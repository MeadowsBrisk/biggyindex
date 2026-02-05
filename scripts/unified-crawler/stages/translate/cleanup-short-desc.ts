/**
 * Cleanup script: Update aggregate short descriptions from shipping blob full translations
 * 
 * Problem: Original translate stage truncated translated descriptions to 200 chars,
 * but the English source descriptions were already 200-300 chars. We should preserve
 * the full translated length (up to 260 chars) in the aggregate.
 * 
 * Solution: Read full translations from shipping blobs, truncate to 260 chars,
 * and update the translations aggregate.
 * 
 * Usage:
 *   yarn uc --stage=translate --cleanup-short-desc [--dry-run] [--limit=N]
 */

import { getBlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { log } from '../../shared/logging/logger';
import { marketStore } from '../../shared/env/markets';
import type { MarketCode } from '../../shared/env/loadEnv';
import { NON_GB_MARKETS, MARKET_TO_FULL_LOCALE } from '../../shared/locale-map';

const SHORT_DESC_MAX = 260;

const MARKETS = NON_GB_MARKETS;

// Map market to locale code used in aggregate (full BCP-47 format)
const MARKET_TO_LOCALE: Record<string, string> = {
  GB: 'en',
  ...MARKET_TO_FULL_LOCALE,
};

interface CleanupOptions {
  dryRun?: boolean;
  limit?: number;
  env: {
    stores: Record<string, string>;
  };
}

interface CleanupResult {
  ok: boolean;
  scanned: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function truncateToWordBoundary(text: string, maxLen: number = SHORT_DESC_MAX): string {
  if (!text || text.length <= maxLen) return text;
  
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  
  // Break at word boundary if reasonable (>70% of max)
  if (lastSpace > maxLen * 0.7) {
    return truncated.slice(0, lastSpace) + '…';
  }
  return truncated + '…';
}

export async function runCleanupShortDesc(opts: CleanupOptions): Promise<CleanupResult> {
  const { env, dryRun = false, limit } = opts;
  
  log.translate.info('cleanup-short-desc starting', { dryRun, limit: limit || 'all' });
  
  const sharedBlob = getBlobClient(env.stores.shared);
  
  // Load existing aggregate
  const aggKey = Keys.shared.aggregates.translations();
  let aggregate: Record<string, { sourceHash: string; locales: Record<string, { n: string; d: string; v?: any[] }> }> = {};
  
  try {
    aggregate = await sharedBlob.getJSON<typeof aggregate>(aggKey) || {};
  } catch {
    log.translate.error('failed to load translations aggregate');
    return { ok: false, scanned: 0, updated: 0, skipped: 0, errors: ['Failed to load aggregate'] };
  }
  
  const refNums = Object.keys(aggregate);
  log.translate.info('loaded aggregate', { itemCount: refNums.length });
  
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const updates: Map<string, Record<string, string>> = new Map(); // refNum -> { locale: newDesc }
  
  // Process each market
  for (const market of MARKETS) {
    const locale = MARKET_TO_LOCALE[market];
    const storeName = marketStore(market, env.stores as any);
    const mktBlob = getBlobClient(storeName);
    
    log.translate.info(`scanning market ${market}...`);
    
    // List all shipping blobs
    let shipKeys: string[] = [];
    try {
      const allKeys = await mktBlob.list();
      shipKeys = allKeys.filter((k: string) => k.startsWith('market-shipping/'));
    } catch (e: any) {
      log.translate.warn(`failed to list ${market} blobs`, { error: e?.message });
      continue;
    }
    
    // Filter to only keys that exist in aggregate
    const relevantKeys = shipKeys.filter(key => {
      const refNum = key.replace('market-shipping/', '').replace('.json', '');
      return aggregate[refNum]?.locales?.[locale];
    });
    
    log.translate.info(`found ${shipKeys.length} shipping blobs in ${market}, ${relevantKeys.length} in aggregate`);
    
    // Process sequentially to avoid auth issues with Netlify Blobs
    let sampleCount = 0;
    
    for (const key of relevantKeys) {
      if (limit && scanned >= limit) break;
      
      const refNum = key.replace('market-shipping/', '').replace('.json', '');
      scanned++;
      
      try {
        const shipData = await mktBlob.getJSON<any>(key);
        const fullDesc = shipData?.translations?.description;
        
        if (!fullDesc) {
          skipped++;
          continue;
        }
        
        const currentShort = aggregate[refNum].locales[locale].d || '';
        const newShort = truncateToWordBoundary(fullDesc, SHORT_DESC_MAX);
        
        // Only update if new is longer (we're fixing truncation, not re-truncating)
        if (newShort.length > currentShort.length) {
          if (!updates.has(refNum)) {
            updates.set(refNum, {});
          }
          updates.get(refNum)![locale] = newShort;
          
          if (sampleCount < 3) {
            log.translate.info('sample update', {
              refNum,
              locale,
              oldLen: currentShort.length,
              newLen: newShort.length,
            });
            sampleCount++;
          }
        } else {
          skipped++;
        }
      } catch (e: any) {
        errors.push(`${market}/${refNum}: ${e?.message || e}`);
        if (errors.length <= 5) {
          log.translate.warn('error reading shipping blob', { market, refNum, error: e?.message });
        }
      }
    }
    
    log.translate.info(`${market} complete`, { processed: relevantKeys.length });
    
    if (limit && scanned >= limit) break;
  }
  
  // Count total updates
  let totalUpdates = 0;
  for (const [, locales] of updates) {
    totalUpdates += Object.keys(locales).length;
  }
  
  log.translate.info('scan complete', {
    scanned,
    itemsToUpdate: updates.size,
    totalLocaleUpdates: totalUpdates,
    skipped,
    errors: errors.length,
  });
  
  if (dryRun) {
    log.translate.info('dry run - no changes written');
    return { ok: true, scanned, updated: 0, skipped, errors };
  }
  
  if (updates.size === 0) {
    log.translate.info('nothing to update');
    return { ok: true, scanned, updated: 0, skipped, errors };
  }
  
  // Apply updates to aggregate
  for (const [refNum, localeUpdates] of updates) {
    for (const [locale, newDesc] of Object.entries(localeUpdates)) {
      if (aggregate[refNum]?.locales?.[locale]) {
        aggregate[refNum].locales[locale].d = newDesc;
        updated++;
      }
    }
  }
  
  // Write updated aggregate
  try {
    await sharedBlob.putJSON(aggKey, aggregate);
    log.translate.info('wrote updated aggregate', { updated });
  } catch (e: any) {
    log.translate.error('failed to write aggregate', { error: e?.message });
    return { ok: false, scanned, updated: 0, skipped, errors: [...errors, 'Failed to write aggregate'] };
  }
  
  return { ok: true, scanned, updated, skipped, errors };
}
