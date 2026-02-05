import type { MarketCode } from '../../shared/env/loadEnv';
import { loadEnv } from '../../shared/env/loadEnv';
import { getBlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { log } from '../../shared/logging/logger';
import { buildSellerWorklist } from '../../shared/sellers/worklist';
import { marketStore, MARKET_CODES } from '../../shared/env/markets';
import { computeSourceHash } from './hash';
import { translateBatch, azureCodeToLocale, type TargetLocale } from './azure';
import { MARKET_TO_AZURE_LOCALE } from '../../shared/locale-map';
import { checkBudget, wouldExceedBudget, recordUsage, recordError, formatBudgetStatus, MONTHLY_CHAR_BUDGET } from './budget';
import type { TranslateResult, TranslateOptions } from './run';

// Embed translations directly in Seller Profile
export interface SellerTranslationEmbed {
    sourceHash: string;
    updatedAt: string;
    locales: {
        [locale: string]: {
            manifesto: string;
        };
    };
}

export async function runTranslateSellers(opts: TranslateOptions): Promise<TranslateResult> {
    const env = loadEnv();
    const sharedBlob = getBlobClient(env.stores.shared);
    const BATCH_SIZE = 5; // Smaller batch for sellers as manifestos can be long

    log.translate.info('starting seller translation scan...');

    // 1. Identify active sellers and their markets
    // We reuse buildSellerWorklist to get the map of SellerID -> Markets
    const markets = (process.env.MARKETS ? process.env.MARKETS.split(',') : MARKET_CODES) as MarketCode[];
    const worklist = await buildSellerWorklist(markets); // Fetches indexes to see where sellers are active
    const sellerMarkets = worklist.sellerMarkets;

    if (sellerMarkets.size === 0) {
        log.translate.info('no active sellers found in indexes');
        return { ok: true, translated: 0, charCount: 0, budgetExhausted: false };
    }

    // 2. Scan all sellers to find candidates
    const candidates: {
        id: string;
        manifesto: string;
        hash: string;
        targetLocales: TargetLocale[];
        charEstimate: number
    }[] = [];

    const sellerIds = Array.from(sellerMarkets.keys());
    log.translate.info(`scanning ${sellerIds.length} sellers for translation candidates...`);

    for (const sid of sellerIds) {
        // Only translate if seller serves non-GB markets
        const marketsServed = sellerMarkets.get(sid);
        if (!marketsServed) continue;

        const targetLocales = [...marketsServed]
            .map(m => MARKET_TO_AZURE_LOCALE[m])
            .filter(Boolean) as TargetLocale[];

        if (targetLocales.length === 0) continue;

        // Load seller profile
        const profile = await sharedBlob.getJSON<any>(Keys.shared.seller(sid));
        if (!profile || !profile.manifesto || typeof profile.manifesto !== 'string') continue;

        const manifesto = profile.manifesto.trim();
        if (!manifesto) continue;

        const hash = computeSourceHash(profile.sellerName || '', manifesto);

        // Check existing translations
        // Re-translate if hash changed OR if any target locale is missing
        if (!opts.force && profile.translations?.sourceHash === hash) {
            const existingLocales = profile.translations?.locales || {};
            const missingLocales = targetLocales.filter(l => !existingLocales[azureCodeToLocale(l)]);
            if (missingLocales.length === 0) continue; // All locales up to date
        }

        // Estimate chars
        const charEstimate = manifesto.length * targetLocales.length;
        candidates.push({
            id: sid,
            manifesto,
            hash,
            targetLocales,
            charEstimate
        });
    }

    if (candidates.length === 0) {
        log.translate.info('no sellers need translation');
        return { ok: true, translated: 0, charCount: 0, budgetExhausted: false };
    }

    // 3. Process candidates
    const totalCharsNeeded = candidates.reduce((sum, c) => sum + c.charEstimate, 0);
    log.translate.info(`found ${candidates.length} sellers to translate`, {
        estimatedChars: totalCharsNeeded.toLocaleString()
    });

    if (opts.dryRun) {
        return { ok: true, translated: 0, charCount: 0, budgetExhausted: false, dryRun: true };
    }

    // Check initial budget
    const { remaining } = await checkBudget(sharedBlob);
    if (remaining <= 0) {
        log.translate.warn('budget exhausted before starting sellers');
        return { ok: false, translated: 0, charCount: 0, budgetExhausted: true };
    }

    let translated = 0;
    let charCount = 0;
    let budgetExhausted = false;
    const errors: string[] = [];

    // Batch processing
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        const batchChars = batch.reduce((sum, b) => sum + b.charEstimate, 0);

        // Budget check
        const { allowed } = await wouldExceedBudget(sharedBlob, batchChars);
        if (!allowed) {
            log.translate.warn('budget would be exceeded by seller batch, stopping');
            budgetExhausted = true;
            break;
        }

        try {
            // Execute translations per-seller (parallel within batch map)
            const results = await Promise.all(batch.map(async (candidate) => {
                const { results: apiResults, charCount: actualChars } = await translateBatch([candidate.manifesto], candidate.targetLocales);

                if (!apiResults[0]?.translations) return null;

                return {
                    candidate,
                    translations: apiResults[0].translations,
                    actualChars
                };
            }));

            // Write updates (Parallelized)
            let batchActualChars = 0;

            await Promise.all(results.map(async (res) => {
                if (!res) return;
                const { candidate, translations, actualChars } = res;

                // Load refresh (optimistic locking not strictly needed for offline crawler but safer)
                const profile = await sharedBlob.getJSON<any>(Keys.shared.seller(candidate.id)) || {};

                const embed: SellerTranslationEmbed = {
                    sourceHash: candidate.hash,
                    updatedAt: new Date().toISOString(),
                    locales: {}
                };

                for (const t of translations) {
                    const locale = azureCodeToLocale(t.to);
                    if (locale) {
                        embed.locales[locale] = {
                            manifesto: t.text
                        };
                    }
                }

                profile.translations = embed;
                await sharedBlob.putJSON(Keys.shared.seller(candidate.id), profile);

                // Track stats (atomic increment not needed as we sum later effectively, 
                // but since this is inside map we need to be careful with closure variables if we were strictly adding to a counter.
                // However, since we're just summing batchActualChars which is local to the batch block but outside the map...
                // Actually, simpler to just return the chars and sum them from the results of Promise.all
                return actualChars;
            })).then((results) => {
                // Aggregate results
                for (const chars of results) {
                    if (typeof chars === 'number') {
                        batchActualChars += chars;
                        translated++;
                    }
                }
            });

            charCount += batchActualChars;
            await recordUsage(sharedBlob, batchActualChars, translated);

            log.translate.info(`seller batch ${Math.floor(i / BATCH_SIZE) + 1} done`, {
                processed: batch.length,
                chars: batchActualChars
            });

            // Rate limit delay
            if (i + BATCH_SIZE < candidates.length) {
                await new Promise(r => setTimeout(r, opts.batchDelayMs ?? 5000));
            }

        } catch (e: any) {
            const msg = e.message || String(e);
            log.translate.error('seller batch failed', { error: msg });
            errors.push(msg);
            // If quota error, stop
            if (msg.includes('quota') || msg.includes('429')) {
                budgetExhausted = true;
                break;
            }
        }
    }

    return {
        ok: errors.length === 0,
        translated,
        charCount,
        budgetExhausted,
        errors: errors.length ? errors : undefined
    };
}
