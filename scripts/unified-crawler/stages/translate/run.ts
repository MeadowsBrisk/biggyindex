import { createHash } from 'crypto';
import { loadEnv } from '../../shared/env/loadEnv';
import type { MarketCode } from '../../shared/env/loadEnv';
import { getBlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { log } from '../../shared/logging/logger';
import { marketStore, MARKET_CODES } from '../../shared/env/markets';
import { computeSourceHash, estimateCharCount, type VariantForHash } from './hash';
import { translateBatch, azureCodeToLocale, parseTranslatedText, TARGET_LOCALES, type TargetLocale, type TranslationResult } from './azure';
import { checkBudget, wouldExceedBudget, recordUsage, recordError, formatBudgetStatus, initBudget, MONTHLY_CHAR_BUDGET } from './budget';
import { runTranslateSellers } from './sellers';
import { runBackfillFullDesc } from './backfillFullDesc';
import { MARKET_TO_AZURE_LOCALE, AZURE_LOCALE_TO_MARKET, NON_GB_MARKETS } from '../../shared/locale-map';

// Alias for existing usage patterns in this file
const MARKET_TO_LOCALE = MARKET_TO_AZURE_LOCALE as Record<string, TargetLocale>;
const LOCALE_TO_MARKET = AZURE_LOCALE_TO_MARKET as Record<TargetLocale, MarketCode>;

// Translation blob schema (per-item detail)
export interface TranslationBlob {
  sourceHash: string;
  sourceLength: number;
  locales: {
    [locale: string]: {
      name: string;
      description: string;       // Full translated description
      descriptionShort: string;  // Truncated for index (first ~200 chars)
      updatedAt: string;
      provider: 'msft';
      charCount: number;
    };
  };
}

// Aggregate: maps refNum -> { sourceHash, locales: { locale: { n, d, v? } } }
// Used by index stage to quickly populate market indexes without reading individual blobs
export interface TranslationAggregate {
  [refNum: string]: {
    sourceHash: string;
    locales: {
      [locale: string]: {
        n: string;   // Translated name
        d: string;   // Translated short description (for index)
        v?: { vid: string | number; d: string }[]; // Translated variant descriptions
      };
    };
  };
}

export interface TranslateOptions {
  limit?: number;
  locales?: string[];
  force?: boolean;
  dryRun?: boolean;
  budgetCheck?: boolean;
  budgetInit?: number;  // Initialize budget with this many chars already used
  batchDelayMs?: number;
  backfillFullDesc?: boolean;  // Backfill full descriptions to shipping blobs for already-translated items
  items?: string[];  // Specific refNums to force-translate (ignores hash check)
  type?: 'items' | 'sellers' | 'all';
}

export interface TranslateResult {
  ok: boolean;
  translated: number;
  charCount: number;
  budgetExhausted: boolean;
  dryRun?: boolean;
  errors?: string[];
}

const BATCH_SIZE = 25; // Azure limit
const MAX_TEXT_LENGTH = 5000; // Truncate to save chars on free tier
const SHORT_DESC_LENGTH = 260; // For index snippet (aggregate)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncateDescription(text: string, maxLen: number = SHORT_DESC_LENGTH): string {
  if (!text || text.length <= maxLen) return text;
  // Try to break at word boundary
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.7) {
    return truncated.slice(0, lastSpace) + '…';
  }
  return truncated + '…';
}

/**
 * Main translation stage entry point.
 * Orchestrates translation of items and sellers.
 */
export async function runTranslate(opts: TranslateOptions = {}): Promise<TranslateResult> {
  const type = opts.type || 'all';
  const results: TranslateResult = {
    ok: true,
    translated: 0,
    charCount: 0,
    budgetExhausted: false,
    dryRun: opts.dryRun,
    errors: []
  };

  // Run items if requested
  if (type === 'all' || type === 'items') {
    const itemRes = await runTranslateItems(opts);
    results.translated += itemRes.translated;
    results.charCount += itemRes.charCount;
    if (itemRes.budgetExhausted) results.budgetExhausted = true;
    if (itemRes.errors) results.errors?.push(...itemRes.errors);
    if (!itemRes.ok) results.ok = false;

    // Stop if budget exhausted or critical error
    if (results.budgetExhausted) return results;
  }

  // Run sellers if requested
  if (type === 'all' || type === 'sellers') {
    const sellerRes = await runTranslateSellers(opts);
    results.translated += sellerRes.translated;
    results.charCount += sellerRes.charCount;
    if (sellerRes.budgetExhausted) results.budgetExhausted = true;
    if (sellerRes.errors) results.errors?.push(...sellerRes.errors);
    if (!sellerRes.ok) results.ok = false;
  }

  return results;
}

/**
 * Item translation logic (original runTranslate)
 * 
 * Uses aggregate-based approach:
 * 1. Load existing translation aggregate (fast, single blob read)
 * 2. Load market index to get list of items + current name/description
 * 3. Compare hashes to find items needing translation
 * 4. Translate in batches
 * 5. Update both per-item blobs AND aggregate
 */
async function runTranslateItems(opts: TranslateOptions = {}): Promise<TranslateResult> {
  const env = loadEnv();
  const sharedBlob = getBlobClient(env.stores.shared);
  const targetLocales = (opts.locales?.length ? opts.locales : [...TARGET_LOCALES]) as TargetLocale[];

  // Budget check mode - just report status
  if (opts.budgetCheck) {
    const { remaining, budget } = await checkBudget(sharedBlob);
    log.translate.info('budget status', {
      month: budget.month,
      used: budget.charsUsed.toLocaleString(),
      remaining: remaining.toLocaleString(),
      limit: MONTHLY_CHAR_BUDGET.toLocaleString(),
      percentUsed: ((budget.charsUsed / MONTHLY_CHAR_BUDGET) * 100).toFixed(1) + '%',
      itemsThisMonth: budget.itemsTranslated,
    });
    return { ok: true, translated: 0, charCount: 0, budgetExhausted: false };
  }

  // Budget init mode - set used chars (for recovery after blob deletion)
  if (opts.budgetInit !== undefined) {
    const budget = await initBudget(sharedBlob, opts.budgetInit);
    log.translate.info('budget initialized', {
      month: budget.month,
      charsUsed: budget.charsUsed.toLocaleString(),
      remaining: (MONTHLY_CHAR_BUDGET - budget.charsUsed).toLocaleString(),
    });
    return { ok: true, translated: 0, charCount: 0, budgetExhausted: false };
  }

  // Check budget before starting
  const { allowed: hasbudget, remaining: initialRemaining, budget: initialBudget } = await checkBudget(sharedBlob);
  if (!hasbudget) {
    log.translate.warn('monthly budget exhausted - try again next month', {
      month: initialBudget.month,
      used: formatBudgetStatus(initialBudget),
    });
    return { ok: false, translated: 0, charCount: 0, budgetExhausted: true };
  }

  // Backfill mode: translate full descriptions for items already in aggregate, write to shipping blobs
  if (opts.backfillFullDesc) {
    return runBackfillFullDesc(opts, env, sharedBlob, targetLocales, initialRemaining);
  }

  log.translate.info('starting', {
    remaining: initialRemaining.toLocaleString(),
    locales: targetLocales.join(','),
    force: opts.force ? 'yes' : 'no',
  });

  // 1. Load existing translation aggregate (single blob read - fast!)
  const existingAgg = await sharedBlob.getJSON<TranslationAggregate>(Keys.shared.aggregates.translations()) || {};
  log.translate.info('loaded translation aggregate', { existingItems: Object.keys(existingAgg).length });

  // 2. Load ALL market indexes to build presence map
  // Only translate items that exist in non-GB markets, and only to locales where they're available
  const markets: MarketCode[] = MARKET_CODES;
  const marketIndexes = new Map<MarketCode, Map<string, any>>();
  const presenceMap = new Map<string, Set<TargetLocale>>(); // refNum -> set of locales needing translation

  for (const market of markets) {
    const storeName = env.stores[market] || `site-index-${market.toLowerCase()}`;
    const blob = getBlobClient(storeName);
    const index = await blob.getJSON<any[]>(Keys.market.index(market)) || [];

    const itemMap = new Map<string, any>();
    for (const item of index) {
      const refNum = String(item.refNum || item.id);
      if (refNum) itemMap.set(refNum, item);
    }
    marketIndexes.set(market, itemMap);

    // For non-GB markets, add locale to presence map
    if (market !== 'GB') {
      const locale = MARKET_TO_LOCALE[market];
      if (locale && targetLocales.includes(locale)) {
        for (const refNum of itemMap.keys()) {
          if (!presenceMap.has(refNum)) presenceMap.set(refNum, new Set());
          presenceMap.get(refNum)!.add(locale);
        }
      }
    }

    log.translate.info('loaded market index', { market, items: itemMap.size });
  }

  // GB index is source of English content
  const gbIndex = marketIndexes.get('GB') || new Map();

  // Count unique items needing translation (present in at least one non-GB market)
  const itemsNeedingTranslation = presenceMap.size;
  log.translate.info('presence map built', {
    gbItems: gbIndex.size,
    itemsInOtherMarkets: itemsNeedingTranslation,
  });

  // If --items specified, filter presence map to only those items
  // AND add any --items that are GB-only (not in presenceMap) so they can be translated too
  const itemsFilter = opts.items?.length ? new Set(opts.items) : null;
  if (itemsFilter) {
    log.translate.info('filtering to specific items', { count: itemsFilter.size, items: Array.from(itemsFilter).join(', ') });

    // Add GB-only items to presenceMap if they're in the filter but not already present
    for (const refNum of itemsFilter) {
      if (!presenceMap.has(refNum) && gbIndex.has(refNum)) {
        // GB-only item - add it with all target locales so it gets translated
        presenceMap.set(refNum, new Set(targetLocales));
        log.translate.info('added GB-only item to translate', { refNum });
      }
    }
  }

  // 3. Find items needing translation (only those in non-GB markets)
  interface PendingItem {
    refNum: string;
    name: string;
    description: string;
    variants: VariantForHash[];  // Variants with vid and d
    hash: string;
    locales: TargetLocale[];
    charEstimate: number;
    variantsOnly: boolean;  // If true, only translate variants (n/d already done)
    reason: 'new' | 'updated' | 'variants-only' | 'missing-locales';  // Why this item needs translation
  }
  const pending: PendingItem[] = [];

  for (const [refNum, locales] of presenceMap) {
    // If --items filter specified, skip items not in the filter
    if (itemsFilter && !itemsFilter.has(refNum)) continue;

    // Force translation for items in --items filter (treat as if --force for these)
    const forceThisItem = opts.force || (itemsFilter && itemsFilter.has(refNum));

    // Get English content - prefer GB index, but fall back to any market where item exists
    // (Items not in GB are still in English, just don't ship to GB)
    let itemData: any = gbIndex.get(refNum);
    let isFromNonGB = false;
    if (!itemData) {
      // Try to get from first available market
      for (const market of NON_GB_MARKETS) {
        const marketIndex = marketIndexes.get(market);
        if (marketIndex?.has(refNum)) {
          itemData = marketIndex.get(refNum);
          isFromNonGB = true;
          break;
        }
      }
    }

    if (!itemData) continue; // Shouldn't happen

    // Get name from index (short is fine for name)
    const name = isFromNonGB ? (itemData.nEn || itemData.n || '') : (itemData.n || '');

    // Use index description for change detection (fast!)
    // Full description will be loaded only when actually translating
    const indexDescription = isFromNonGB ? (itemData.dEn || itemData.d || '') : (itemData.d || '');

    // Extract variants - use dEn (English original) for non-GB items to avoid translating corrupted text
    const rawVariants = itemData.v || [];
    const variants: VariantForHash[] = rawVariants.map((v: any) => ({
      vid: v.vid,
      d: isFromNonGB ? (v.dEn || v.d || '') : (v.d || ''),
    })).filter((v: VariantForHash) => v.d); // Only include variants with descriptions

    if (!name && !indexDescription) continue;

    // Hash only includes name + description (not variants) for backward compatibility
    // Use index description for hash - good enough for change detection
    const hash = computeSourceHash(name, indexDescription);
    let localesArray = Array.from(locales);
    let variantsOnly = false;
    let reason: 'new' | 'updated' | 'variants-only' | 'missing-locales' = 'new';

    const existingEntry = existingAgg[refNum];

    // Check which locales already have translations (regardless of hash)
    const localesWithTranslation = localesArray.filter(l => existingEntry?.locales?.[azureCodeToLocale(l)]?.n);
    const missingLocales = localesArray.filter(l => !existingEntry?.locales?.[azureCodeToLocale(l)]?.n);

    // Check if hash changed (description updated)
    const hashChanged = existingEntry && existingEntry.sourceHash !== hash;

    // Check if any locale with translation is missing variants
    let needsVariantTranslation = false;
    if (variants.length > 0) {
      for (const locale of localesWithTranslation) {
        const localeData = existingEntry?.locales?.[azureCodeToLocale(locale)];
        if (localeData && (!localeData.v || localeData.v.length === 0)) {
          needsVariantTranslation = true;
          break;
        }
      }
    }

    // Decision logic:
    // 1. If --force or --items specified for this item → full re-translation
    // 2. If hash changed (description updated) → full re-translation for ALL locales
    // 3. If some locales missing translations entirely → full translation for those
    // 4. If all locales have n/d but missing variants → variantsOnly
    // 5. If hash matches AND all locales have translations with variants → skip

    if (forceThisItem) {
      // Force flag - translate everything
      reason = existingEntry ? 'updated' : 'new';
    } else if (!existingEntry) {
      // No existing translation - new item
      reason = 'new';
    } else if (hashChanged) {
      // Description changed - re-translate ALL locales (not just missing)
      reason = 'updated';
      // Reset to all locales since content changed
      localesArray = Array.from(locales);
    } else if (missingLocales.length > 0) {
      // Some locales missing - translate those
      reason = 'missing-locales';
      localesArray = missingLocales;
    } else if (needsVariantTranslation) {
      // All locales have n/d, just need variants
      reason = 'variants-only';
      variantsOnly = true;
    } else {
      // Fully translated with variants through all locales, hash matches - skip
      continue;
    }

    // Estimate chars based on what we're sending
    const variantChars = variants.reduce((sum, v) => sum + (v.d?.length || 0), 0);
    const charEstimate = variantsOnly
      ? variantChars * localesArray.length
      : estimateCharCount(name, indexDescription, variants) * localesArray.length;

    // Skip items with no variants if we're in variantsOnly mode
    if (variantsOnly && variants.length === 0) continue;

    pending.push({ refNum, name, description: indexDescription, variants, hash, locales: localesArray, charEstimate, variantsOnly, reason });
  }

  // Apply limit if specified
  const toProcess = opts.limit ? pending.slice(0, opts.limit) : pending;
  const totalCharsNeeded = toProcess.reduce((sum, p) => sum + p.charEstimate, 0);

  // Count by reason for better visibility
  const countByReason = toProcess.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  log.translate.info('scan complete', {
    itemsInOtherMarkets: presenceMap.size,
    alreadyTranslated: presenceMap.size - pending.length,
    needsTranslation: pending.length,
    processing: toProcess.length,
    estimatedChars: totalCharsNeeded.toLocaleString(),
    breakdown: `new=${countByReason['new'] || 0}, updated=${countByReason['updated'] || 0}, missing-locales=${countByReason['missing-locales'] || 0}, variants-only=${countByReason['variants-only'] || 0}`,
  });

  // Dry run mode
  if (opts.dryRun) {
    // Show breakdown by locale
    const localeBreakdown: Record<string, number> = {};
    for (const item of toProcess) {
      for (const locale of item.locales) {
        localeBreakdown[locale] = (localeBreakdown[locale] || 0) + 1;
      }
    }
    log.translate.info('dry run complete', {
      wouldTranslate: toProcess.length,
      estimatedChars: totalCharsNeeded.toLocaleString(),
      perLocale: JSON.stringify(localeBreakdown),
    });
    return { ok: true, translated: 0, charCount: 0, budgetExhausted: false, dryRun: true };
  }

  if (toProcess.length === 0) {
    log.translate.info('nothing to translate');
    return { ok: true, translated: 0, charCount: 0, budgetExhausted: false };
  }

  // 4. Process in batches
  // Group items by their locale sets for efficient batching
  // (items needing same locales can be batched together)
  let translated = 0;
  let charCount = 0;
  let budgetExhausted = false;
  const errors: string[] = [];
  const aggUpdates: TranslationAggregate = {};

  // For simplicity, process items individually but batch API calls
  // Each item gets translated to only the locales it needs
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const batchChars = batch.reduce((sum, b) => sum + b.charEstimate, 0);

    // Check budget before each batch
    const { allowed, remaining } = await wouldExceedBudget(sharedBlob, batchChars);
    if (!allowed) {
      log.translate.warn('budget would be exceeded, stopping', {
        remaining: remaining.toLocaleString(),
        needed: batchChars.toLocaleString(),
        translated,
      });
      budgetExhausted = true;
      break;
    }

    // Group batch items by locale set AND variantsOnly flag for efficient API calls
    // Items with same locales and mode can share an API call
    const byLocaleKey = new Map<string, typeof batch>();
    for (const item of batch) {
      const key = `${item.variantsOnly ? 'v:' : ''}${item.locales.sort().join(',')}`;
      if (!byLocaleKey.has(key)) byLocaleKey.set(key, []);
      byLocaleKey.get(key)!.push(item);
    }

    let batchActualChars = 0;

    try {
      // Process each locale group
      for (const [localeKey, groupItems] of byLocaleKey) {
        const isVariantsOnly = localeKey.startsWith('v:');
        const locales = (isVariantsOnly ? localeKey.slice(2) : localeKey).split(',') as TargetLocale[];

        // NEW APPROACH: Send each text separately to avoid emoji corruption from concatenation
        // For each item, we send: [name\n\ndesc, variant1, variant2, ...]
        // This avoids the separator-based joining that was corrupting multi-byte characters

        // Process items one by one (simpler, avoids complex batching across item boundaries)
        for (const item of groupItems) {
          const sortedVariants = [...item.variants].sort((a, v) =>
            String(a.vid || '').localeCompare(String(v.vid || ''))
          );

          // Load full description from core blob for translation
          // (Scan phase used index desc for fast change detection, but we need full for Azure)
          let fullEnglishDesc = item.description; // fallback to index desc
          if (!item.variantsOnly) {
            try {
              const coreKey = Keys.shared.itemCore(item.refNum);
              const coreItem = await sharedBlob.getJSON<any>(coreKey);
              if (coreItem?.description) {
                fullEnglishDesc = coreItem.description;
              }
            } catch {
              // Use index description as fallback (better than nothing)
            }
          }

          // Build texts array: either just variants, or name+desc followed by variants
          const textsToTranslate: string[] = [];

          if (item.variantsOnly) {
            // Only send variants (no name/description)
            for (const v of sortedVariants) {
              if (v.d) textsToTranslate.push(v.d);
            }
          } else {
            // Full translation: name + full description as first text, then each variant
            textsToTranslate.push(`${item.name}\n\n${fullEnglishDesc}`.slice(0, MAX_TEXT_LENGTH));
            for (const v of sortedVariants) {
              if (v.d) textsToTranslate.push(v.d);
            }
          }

          if (textsToTranslate.length === 0) continue;

          // Azure allows 25 texts per call - split if needed
          const AZURE_MAX_TEXTS = 25;
          let allResults: TranslationResult[] = [];

          for (let textIdx = 0; textIdx < textsToTranslate.length; textIdx += AZURE_MAX_TEXTS) {
            const textBatch = textsToTranslate.slice(textIdx, textIdx + AZURE_MAX_TEXTS);
            const { results: batchResults, charCount: batchChars } = await translateBatch(textBatch, locales);
            batchActualChars += batchChars;
            allResults.push(...batchResults);

            // Small delay between sub-batches to avoid rate limiting
            if (textIdx + AZURE_MAX_TEXTS < textsToTranslate.length) {
              await sleep(1000);
            }
          }

          // Process results for this item
          if (allResults.length === 0 || !allResults[0]?.translations) {
            log.translate.warn('no translations returned', { refNum: item.refNum });
            continue;
          }

          // Check if we should preserve existing translations
          const existingEntry = existingAgg[item.refNum];
          const shouldPreserve = existingEntry?.sourceHash === item.hash;
          const existingLocales = shouldPreserve ? (existingEntry?.locales || {}) : {};

          const aggEntry: TranslationAggregate[string] = {
            sourceHash: item.hash,
            locales: { ...existingLocales },
          };

          // Parse results - each locale gets results from all texts
          for (let localeIdx = 0; localeIdx < locales.length; localeIdx++) {
            const locale = azureCodeToLocale(locales[localeIdx]);

            let translatedName = '';
            let translatedDescShort = '';
            const variantTranslations: { vid: string | number; d: string }[] = [];

            if (item.variantsOnly) {
              // Results are just variants (preserve existing n/d)
              const existingLocaleData = existingAgg[item.refNum]?.locales?.[locale];
              if (existingLocaleData?.n && existingLocaleData?.d) {
                translatedName = existingLocaleData.n;
                translatedDescShort = existingLocaleData.d;
              } else {
                log.translate.warn('variantsOnly item missing existing translations', {
                  refNum: item.refNum, locale,
                });
              }

              // Map results to variants
              for (let vi = 0; vi < sortedVariants.length && vi < allResults.length; vi++) {
                const translatedText = allResults[vi]?.translations?.[localeIdx]?.text || '';
                if (sortedVariants[vi].vid !== undefined && translatedText) {
                  variantTranslations.push({ vid: sortedVariants[vi].vid!, d: translatedText.trim() });
                }
              }
            } else {
              // First result is name+desc, rest are variants
              const nameDescText = allResults[0]?.translations?.[localeIdx]?.text || '';
              const { name, description: fullDescription } = parseTranslatedText(nameDescText);
              translatedName = name;
              translatedDescShort = truncateDescription(fullDescription);

              // Write full description + shipping labels to market shipping blob
              const market = LOCALE_TO_MARKET[locales[localeIdx]];
              if (market && fullDescription) {
                try {
                  const mktStoreName = marketStore(market, env.stores as any);
                  const mktBlob = getBlobClient(mktStoreName);
                  const shipKey = Keys.market.shipping(item.refNum);

                  // Load existing shipping blob (may not exist yet)
                  const existingShip = await mktBlob.getJSON<any>(shipKey) || {
                    id: item.refNum,
                    market,
                    options: [],
                    warnings: [],
                  };

                  // Translate shipping option labels if present and changed
                  let translatedShippingOptions: { label: string; cost: number }[] | undefined;
                  const originalOptions = existingShip.options || [];
                  const existingTranslatedOptions = existingShip.translations?.shippingOptions;
                  const existingSourceLabelsHash = existingShip.translations?.sourceLabelsHash;

                  // Compute hash of current source labels to detect changes
                  const currentLabels = originalOptions.map((opt: any) => opt.label || '').filter(Boolean);
                  const currentLabelsHash = currentLabels.length > 0
                    ? createHash('md5').update(currentLabels.join('|')).digest('hex').slice(0, 8)
                    : undefined;

                  // Translate if: we have labels AND (no existing translation OR labels changed)
                  const labelsChanged = currentLabelsHash && currentLabelsHash !== existingSourceLabelsHash;
                  if (currentLabels.length > 0 && (!existingTranslatedOptions || labelsChanged)) {
                    try {
                      // Translate shipping labels (single locale at a time)
                      const { results: labelResults, charCount: labelChars } = await translateBatch(
                        currentLabels,
                        [locales[localeIdx]]
                      );
                      batchActualChars += labelChars;

                      // Map translated labels back to options
                      translatedShippingOptions = originalOptions.map((opt: any, idx: number) => ({
                        label: labelResults[idx]?.translations?.[0]?.text || opt.label || '',
                        cost: opt.cost ?? 0,
                      }));
                    } catch (labelErr: any) {
                      log.translate.warn('failed to translate shipping labels', {
                        refNum: item.refNum,
                        market,
                        error: labelErr?.message || String(labelErr),
                      });
                    }
                  }

                  // Add/update translations field (include sourceLabelsHash for change detection)
                  existingShip.translations = {
                    description: fullDescription,
                    ...(translatedShippingOptions ? { shippingOptions: translatedShippingOptions } :
                      existingTranslatedOptions ? { shippingOptions: existingTranslatedOptions } : {}),
                    sourceHash: item.hash,
                    ...(currentLabelsHash ? { sourceLabelsHash: currentLabelsHash } : {}),
                    updatedAt: new Date().toISOString(),
                  };

                  await mktBlob.putJSON(shipKey, existingShip);
                } catch (shipErr: any) {
                  log.translate.warn('failed to write shipping blob translation', {
                    refNum: item.refNum,
                    market,
                    error: shipErr?.message || String(shipErr),
                  });
                }
              }

              // Map remaining results to variants
              for (let vi = 0; vi < sortedVariants.length && vi + 1 < allResults.length; vi++) {
                const translatedText = allResults[vi + 1]?.translations?.[localeIdx]?.text || '';
                if (sortedVariants[vi].vid !== undefined && translatedText) {
                  variantTranslations.push({ vid: sortedVariants[vi].vid!, d: translatedText.trim() });
                }
              }
            }

            aggEntry.locales[locale] = {
              n: translatedName,
              d: translatedDescShort,
              ...(variantTranslations.length > 0 ? { v: variantTranslations } : {}),
            };
          }

          aggUpdates[item.refNum] = aggEntry;
          translated++;

          // Log individual item completion with reason
          log.translate.info(`translated [${item.reason}]`, {
            refNum: item.refNum,
            locales: item.locales.join(','),
            variantsOnly: item.variantsOnly ? 'yes' : 'no',
          });
        }
      }

      charCount += batchActualChars;

      // Record usage after successful batch
      const updatedBudget = await recordUsage(sharedBlob, batchActualChars, batch.length);

      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);
      log.translate.info(`batch ${batchNum}/${totalBatches}`, {
        items: batch.length,
        chars: batchActualChars.toLocaleString(),
        remaining: (MONTHLY_CHAR_BUDGET - updatedBudget.charsUsed).toLocaleString(),
      });

      // Rate limit: free tier F0 allows ~33,300 chars/minute (2M chars/hour).
      // Each batch is ~25k chars, so we need ~45-60s between batches to stay under.
      // Default 60s, configurable via --delay option.
      const delayMs = opts.batchDelayMs ?? 60000;
      if (i + BATCH_SIZE < toProcess.length && delayMs > 0) {
        log.translate.info('rate limit delay', { delaySecs: Math.round(delayMs / 1000), nextBatch: Math.floor(i / BATCH_SIZE) + 2 });
        await sleep(delayMs);
      }

    } catch (e: any) {
      const errorMsg = e.message || String(e);
      errors.push(`batch ${Math.floor(i / BATCH_SIZE) + 1}: ${errorMsg}`);

      // Check for quota/rate limit issues
      if (errorMsg.includes('QUOTA_EXCEEDED') || errorMsg.includes('RATE_LIMITED')) {
        log.translate.error('Azure quota/rate limit exceeded', { error: errorMsg });
        budgetExhausted = true;
        break;
      }

      log.translate.error('batch failed', { error: errorMsg, batchStart: i });

      // Record errors for items in failed batch
      for (const item of batch) {
        await recordError(sharedBlob, item.refNum, item.locales.join(','), errorMsg);
      }

      // Continue with next batch
    }
  }

  // 5. Merge and save aggregate
  if (Object.keys(aggUpdates).length > 0) {
    const mergedAgg = { ...existingAgg, ...aggUpdates };
    await sharedBlob.putJSON(Keys.shared.aggregates.translations(), mergedAgg);
    log.translate.info('saved translation aggregate', {
      newItems: Object.keys(aggUpdates).length,
      totalItems: Object.keys(mergedAgg).length,
    });
  }

  // 6. Final status
  const { budget: finalBudget } = await checkBudget(sharedBlob);
  log.translate.info('completed', {
    translated,
    charCount: charCount.toLocaleString(),
    budget: formatBudgetStatus(finalBudget),
    budgetExhausted: budgetExhausted ? 'yes' : 'no',
    errors: errors.length,
  });

  return {
    ok: errors.length === 0 || translated > 0,
    translated,
    charCount,
    budgetExhausted,
    errors: errors.length > 0 ? errors : undefined,
  };
}
