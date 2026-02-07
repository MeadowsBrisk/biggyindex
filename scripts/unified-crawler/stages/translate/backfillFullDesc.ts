/**
 * Backfill mode: translate FULL descriptions for items already in the translation
 * aggregate and write to market shipping blobs.
 *
 * Extracted from run.ts to reduce file size and separate concerns.
 */

import type { MarketCode } from '../../shared/env/loadEnv';
import type { UnifiedEnv } from '../../shared/env/loadEnv';
import { getBlobClient, type BlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { log } from '../../shared/logging/logger';
import { marketStore } from '../../shared/env/markets';
import { translateBatch, type TargetLocale } from './azure';
import { wouldExceedBudget, recordUsage, checkBudget, formatBudgetStatus, MONTHLY_CHAR_BUDGET } from './budget';
import type { TranslationAggregate, TranslateOptions, TranslateResult } from './run';
import { AZURE_LOCALE_TO_MARKET } from '../../shared/locale-map';

const MAX_TEXT_LENGTH = 5000;
const LOCALE_TO_MARKET = AZURE_LOCALE_TO_MARKET as Record<TargetLocale, MarketCode>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * For items already translated (in aggregate), translate FULL descriptions
 * and write to market shipping blobs. Does NOT update the aggregate (already has short d).
 *
 * This is for backfilling full descriptions for items translated before this feature was added.
 */
export async function runBackfillFullDesc(
  opts: TranslateOptions,
  env: UnifiedEnv,
  sharedBlob: BlobClient,
  targetLocales: TargetLocale[],
  initialRemaining: number,
): Promise<TranslateResult> {
  log.translate.info('backfill-fulldesc starting', {
    remaining: initialRemaining.toLocaleString(),
    locales: targetLocales.join(','),
    limit: opts.limit || 'none',
  });

  const existingAgg = await sharedBlob.getJSON<TranslationAggregate>(Keys.shared.aggregates.translations()) || {};
  const aggRefNums = Object.keys(existingAgg);
  log.translate.info('loaded translation aggregate', { items: aggRefNums.length });

  if (aggRefNums.length === 0) {
    log.translate.info('no items in aggregate to backfill');
    return { ok: true, translated: 0, charCount: 0, budgetExhausted: false };
  }

  const refNumsToProcess = opts.limit ? aggRefNums.slice(0, opts.limit) : aggRefNums;

  interface BackfillItem {
    refNum: string;
    fullDescription: string;
    locales: TargetLocale[];
    charEstimate: number;
  }
  const pending: BackfillItem[] = [];

  log.translate.info('loading core item blobs', { count: refNumsToProcess.length });

  for (const refNum of refNumsToProcess) {
    const aggEntry = existingAgg[refNum];
    if (!aggEntry?.locales) continue;

    const itemLocales = Object.keys(aggEntry.locales)
      .map(l => {
        const short = l.split('-')[0] as TargetLocale;
        return targetLocales.includes(short) ? short : null;
      })
      .filter((l): l is TargetLocale => l !== null);

    if (itemLocales.length === 0) continue;

    const coreKey = Keys.shared.itemCore(refNum);
    let coreItem: any = null;
    try {
      coreItem = await sharedBlob.getJSON<any>(coreKey);
    } catch { }

    if (!coreItem?.description) continue;

    const fullDescription = String(coreItem.description).slice(0, MAX_TEXT_LENGTH);
    if (fullDescription.length < 50) continue;

    pending.push({
      refNum,
      fullDescription,
      locales: itemLocales,
      charEstimate: fullDescription.length * itemLocales.length,
    });
  }

  const toProcess = pending;
  const totalCharsNeeded = toProcess.reduce((sum, p) => sum + p.charEstimate, 0);

  log.translate.info('backfill scan complete', {
    inAggregate: aggRefNums.length,
    scanned: refNumsToProcess.length,
    withFullDesc: pending.length,
    estimatedChars: totalCharsNeeded.toLocaleString(),
  });

  if (opts.dryRun) {
    log.translate.info('dry run complete', {
      wouldBackfill: toProcess.length,
      estimatedChars: totalCharsNeeded.toLocaleString(),
    });
    return { ok: true, translated: 0, charCount: 0, budgetExhausted: false, dryRun: true };
  }

  if (toProcess.length === 0) {
    log.translate.info('nothing to backfill');
    return { ok: true, translated: 0, charCount: 0, budgetExhausted: false };
  }

  const BACKFILL_BATCH_SIZE = 5;

  let translated = 0;
  let charCount = 0;
  let budgetExhausted = false;
  const errors: string[] = [];

  for (let i = 0; i < toProcess.length; i += BACKFILL_BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BACKFILL_BATCH_SIZE);
    const batchChars = batch.reduce((sum, b) => sum + b.charEstimate, 0);

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

    let batchActualChars = 0;

    try {
      for (const item of batch) {
        const { results, charCount: itemChars } = await translateBatch([item.fullDescription], item.locales);
        batchActualChars += itemChars;

        if (!results[0]?.translations) {
          log.translate.warn('no translation returned', { refNum: item.refNum });
          continue;
        }

        for (let localeIdx = 0; localeIdx < item.locales.length; localeIdx++) {
          const locale = item.locales[localeIdx];
          const market = LOCALE_TO_MARKET[locale];
          const translatedDesc = results[0].translations[localeIdx]?.text || '';

          if (!market || !translatedDesc) continue;

          try {
            const mktStoreName = marketStore(market, env.stores as any);
            const mktBlob = getBlobClient(mktStoreName);
            const shipKey = Keys.market.shipping(item.refNum);

            const existingShip = await mktBlob.getJSON<any>(shipKey) || {
              id: item.refNum,
              market,
              options: [],
              warnings: [],
            };

            existingShip.translations = {
              description: translatedDesc,
              sourceHash: existingAgg[item.refNum]?.sourceHash || '',
              updatedAt: new Date().toISOString(),
            };

            await mktBlob.putJSON(shipKey, existingShip);
          } catch (shipErr: any) {
            log.translate.warn('failed to write shipping blob', {
              refNum: item.refNum,
              market,
              error: shipErr?.message || String(shipErr),
            });
          }
        }

        translated++;
      }

      charCount += batchActualChars;

      const updatedBudget = await recordUsage(sharedBlob, batchActualChars, batch.length);

      const batchNum = Math.floor(i / BACKFILL_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(toProcess.length / BACKFILL_BATCH_SIZE);
      log.translate.info(`backfill batch ${batchNum}/${totalBatches}`, {
        items: batch.length,
        chars: batchActualChars.toLocaleString(),
        remaining: (MONTHLY_CHAR_BUDGET - updatedBudget.charsUsed).toLocaleString(),
      });

      const delayMs = opts.batchDelayMs ?? 60000;
      if (i + BACKFILL_BATCH_SIZE < toProcess.length && delayMs > 0) {
        log.translate.info('rate limit delay', { delaySecs: Math.round(delayMs / 1000) });
        await sleep(delayMs);
      }

    } catch (e: any) {
      const errorMsg = e.message || String(e);
      errors.push(`batch ${Math.floor(i / BACKFILL_BATCH_SIZE) + 1}: ${errorMsg}`);
      log.translate.error('batch failed', { error: errorMsg });

      if (errorMsg.includes('QUOTA_EXCEEDED') || errorMsg.includes('RATE_LIMITED')) {
        budgetExhausted = true;
        break;
      }
    }
  }

  const { budget: finalBudget } = await checkBudget(sharedBlob);
  log.translate.info('backfill completed', {
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
