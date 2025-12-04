import { loadEnv } from '../../shared/env/loadEnv';
import type { MarketCode } from '../../shared/env/loadEnv';
import { getBlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { log } from '../../shared/logging/logger';
import { computeSourceHash, estimateCharCount, type VariantForHash } from './hash';
import { translateBatch, azureCodeToLocale, parseTranslatedTextWithVariants, VARIANT_SEPARATOR, TARGET_LOCALES, type TargetLocale } from './azure';
import { checkBudget, wouldExceedBudget, recordUsage, recordError, formatBudgetStatus, initBudget, MONTHLY_CHAR_BUDGET } from './budget';

// Map market codes to locale codes for translation
const MARKET_TO_LOCALE: Record<string, TargetLocale> = {
  'DE': 'de',
  'FR': 'fr',
  'PT': 'pt',
  'IT': 'it',
};

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
const SHORT_DESC_LENGTH = 200; // For index snippet

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
 * 
 * Uses aggregate-based approach:
 * 1. Load existing translation aggregate (fast, single blob read)
 * 2. Load market index to get list of items + current name/description
 * 3. Compare hashes to find items needing translation
 * 4. Translate in batches
 * 5. Update both per-item blobs AND aggregate
 */
export async function runTranslate(opts: TranslateOptions = {}): Promise<TranslateResult> {
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
  const markets: MarketCode[] = ['GB', 'DE', 'FR', 'IT', 'PT'];
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
  }
  const pending: PendingItem[] = [];

  for (const [refNum, locales] of presenceMap) {
    // Get English content - prefer GB index, but fall back to any market where item exists
    // (Items not in GB are still in English, just don't ship to GB)
    let itemData: any = gbIndex.get(refNum);
    if (!itemData) {
      // Try to get from first available market
      for (const market of ['DE', 'FR', 'IT', 'PT'] as MarketCode[]) {
        const marketIndex = marketIndexes.get(market);
        if (marketIndex?.has(refNum)) {
          itemData = marketIndex.get(refNum);
          break;
        }
      }
    }
    
    if (!itemData) continue; // Shouldn't happen

    const name = itemData.n || '';
    const description = itemData.d || ''; // Short description from index
    
    // Extract variants (minified key: v)
    const rawVariants = itemData.v || [];
    const variants: VariantForHash[] = rawVariants.map((v: any) => ({
      vid: v.vid,
      d: v.d || '',
    })).filter((v: VariantForHash) => v.d); // Only include variants with descriptions
    
    if (!name && !description) continue;

    // Hash only includes name + description (not variants) for backward compatibility
    const hash = computeSourceHash(name, description);
    let localesArray = Array.from(locales);
    let variantsOnly = false;

    const existingEntry = existingAgg[refNum];
    
    // Check which locales already have translations (regardless of hash)
    const localesWithTranslation = localesArray.filter(l => existingEntry?.locales?.[azureCodeToLocale(l)]?.n);
    const missingLocales = localesArray.filter(l => !existingEntry?.locales?.[azureCodeToLocale(l)]?.n);
    
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
    // 1. If hash matches AND all locales have translations with variants → skip
    // 2. If all locales have n/d translations but missing variants → variantsOnly
    // 3. If some locales missing translations entirely → full translation for those
    // 4. If hash changed → only re-translate if --force (name/desc translations are still valid)
    
    if (!opts.force && existingEntry) {
      if (missingLocales.length === 0 && !needsVariantTranslation) {
        continue; // Fully translated with variants, skip
      }
      
      if (missingLocales.length === 0 && needsVariantTranslation) {
        // All locales have n/d, just need variants
        variantsOnly = true;
      } else if (missingLocales.length > 0 && !needsVariantTranslation) {
        // Only translate missing locales (full)
        localesArray = missingLocales;
      } else {
        // Some locales missing, some need variants - translate missing fully, variants for existing
        // For simplicity, if there are missing locales, do full translation for all needed
        // (variant backfill will happen on next run)
        localesArray = missingLocales;
      }
    }
    // If no existing entry, full translation for all locales (default)

    // Estimate chars based on what we're sending
    const variantChars = variants.reduce((sum, v) => sum + (v.d?.length || 0), 0);
    const charEstimate = variantsOnly 
      ? variantChars * localesArray.length
      : estimateCharCount(name, description, variants) * localesArray.length;

    // Skip items with no variants if we're in variantsOnly mode
    if (variantsOnly && variants.length === 0) continue;

    pending.push({ refNum, name, description, variants, hash, locales: localesArray, charEstimate, variantsOnly });
  }

  // Apply limit if specified
  const toProcess = opts.limit ? pending.slice(0, opts.limit) : pending;
  const totalCharsNeeded = toProcess.reduce((sum, p) => sum + p.charEstimate, 0);

  log.translate.info('scan complete', {
    itemsInOtherMarkets: presenceMap.size,
    alreadyTranslated: presenceMap.size - pending.length,
    needsTranslation: pending.length,
    processing: toProcess.length,
    estimatedChars: totalCharsNeeded.toLocaleString(),
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
        
        // Prepare texts based on mode
        // Full mode: "name\n\ndescription||VAR||variant1||VAR||variant2..."
        // Variants only: "variant1||VAR||variant2..." (no name/description)
        const texts = groupItems.map(b => {
          const sortedVariants = [...b.variants].sort((a, v) => 
            String(a.vid || '').localeCompare(String(v.vid || ''))
          );
          
          if (b.variantsOnly) {
            // Only send variants
            return sortedVariants.map(v => v.d || '').join(VARIANT_SEPARATOR);
          } else {
            // Full translation: name + description + variants
            let combined = `${b.name}\n\n${b.description}`;
            for (const v of sortedVariants) {
              if (v.d) {
                combined += `${VARIANT_SEPARATOR}${v.d}`;
              }
            }
            return combined.slice(0, MAX_TEXT_LENGTH);
          }
        });

        const { results, charCount: groupChars } = await translateBatch(texts, locales);
        batchActualChars += groupChars;

        // Process results
        for (let j = 0; j < groupItems.length; j++) {
          const item = groupItems[j];
          const result = results[j];

          if (!result?.translations) {
            log.translate.warn('no translations returned', { refNum: item.refNum });
            continue;
          }

          // Check if we should preserve existing translations
          // Only preserve if source hash matches (content unchanged, just adding new locales)
          const existingEntry = existingAgg[item.refNum];
          const shouldPreserve = existingEntry?.sourceHash === item.hash;
          const existingLocales = shouldPreserve ? (existingEntry?.locales || {}) : {};
          
          const aggEntry: TranslationAggregate[string] = {
            sourceHash: item.hash,
            locales: { ...existingLocales }, // Preserve existing translations if hash matches
          };

          // Get sorted vids to match variants back (same order as text preparation)
          const sortedVariants = [...item.variants].sort((a, v) => 
            String(a.vid || '').localeCompare(String(v.vid || ''))
          );

          // Add/update new translations
          for (const t of result.translations) {
            const locale = azureCodeToLocale(t.to);
            
            // For variantsOnly mode, the text is just variants joined by separator (no name/desc)
            // For full mode, it's "name\n\ndesc||VAR||var1||VAR||var2..."
            let translatedName = '';
            let translatedDescShort = '';
            let translatedVariants: string[] = [];
            
            if (item.variantsOnly) {
              // Text was just variants, split them back
              translatedVariants = t.text.split(VARIANT_SEPARATOR).map(s => s.trim());
              // Preserve existing n/d from aggregate
              const existingLocaleData = existingLocales[locale];
              translatedName = existingLocaleData?.n || '';
              translatedDescShort = existingLocaleData?.d || '';
            } else {
              // Full translation - parse name, description, and variants
              const parsed = parseTranslatedTextWithVariants(t.text);
              translatedName = parsed.name;
              translatedDescShort = truncateDescription(parsed.description);
              translatedVariants = parsed.variants;
            }

            // Map translated variants back to vids
            const variantTranslations: { vid: string | number; d: string }[] = [];
            for (let vi = 0; vi < sortedVariants.length && vi < translatedVariants.length; vi++) {
              const originalVariant = sortedVariants[vi];
              const translatedText = translatedVariants[vi];
              if (originalVariant.vid !== undefined && translatedText) {
                variantTranslations.push({
                  vid: originalVariant.vid,
                  d: translatedText,
                });
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
