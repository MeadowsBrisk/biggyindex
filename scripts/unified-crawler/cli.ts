#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { EventEmitter } from 'events';
import { loadEnv } from './shared/env/loadEnv';
import { listMarkets as cfgMarkets } from './shared/env/markets';
import type { MarketCode } from './shared/env/loadEnv';
import { indexMarket } from './indexer/indexMarket';
import { buildItemsWorklist } from './stages/items/run';
import { processSingleItem } from './stages/items/processItem';
import { runSellers } from './stages/sellers/run';
import { runPruning } from './stages/pruning/run';
import { runTranslate } from './stages/translate/run';
import { runCleanupShortDesc } from './stages/translate/cleanup-short-desc';
import { processImages, clearAllImages } from './stages/images';
import { runPricing } from './stages/pricing';
import { detectItemChanges } from './shared/logic/changes';
import { Keys } from './shared/persistence/keys';
import { getBlobClient } from './shared/persistence/blobs';
import { marketStore } from './shared/env/markets';
import { ensureAuthedClient } from './shared/http/authedClient';
import { log, timer } from './shared/logging/logger';
import { tryRevalidateMarkets } from './shared/revalidation/revalidate';

const argv = yargs(hideBin(process.argv))
  .scriptName('unified-crawler')
  .option('stage', {
    type: 'string',
    choices: ['index', 'items', 'sellers', 'pruning', 'translate', 'images', 'pricing', 'all', 'cat-tests'],
    default: 'index',
    describe: 'Which stage(s) to run',
  })
  .option('markets', {
    type: 'string',
    describe: 'Comma-separated market codes (e.g., GB,DE,FR). Defaults to configured markets.',
  })
  .option('persist', {
    type: 'string',
    choices: ['auto', 'blobs', 'fs'],
    default: 'auto',
    describe: 'Persistence mode (blobs recommended for parity with Netlify)'
  })
  .option('limit', {
    type: 'number',
    describe: 'Limit number of items to process in items/translate stage (for quick tests)',
  })
  .option('concurrency', {
    type: 'number',
    describe: 'Max concurrent items processed (defaults to env CRAWLER_MAX_PARALLEL or 6)'
  })
  .option('force', {
    type: 'boolean',
    default: false,
    describe: 'Force run regardless of env guards (equivalent intent to ?force=1)'
  })
  .option('refresh-share', {
    type: 'boolean',
    default: false,
    describe: 'Force regeneration of share/referral links (overrides cached aggregate and core)'
  })
  .option('refresh-shipping', {
    type: 'boolean',
    default: false,
    describe: 'Force refresh of shipping data regardless of freshness (for testing/benchmarking)'
  })
  .option('ids', {
    type: 'string',
    describe: 'Comma-separated list of item IDs to process (for targeting specific items)'
  })
  // Translation stage options
  .option('locales', {
    type: 'string',
    describe: 'Comma-separated target locales for translate stage (e.g., de,fr). Defaults to de,fr,pt,it'
  })
  .option('dry-run', {
    type: 'boolean',
    default: false,
    describe: 'Preview what would be translated without making API calls'
  })
  .option('budget-check', {
    type: 'boolean',
    default: false,
    describe: 'Show remaining translation budget for this month'
  })
  .option('budget-init', {
    type: 'number',
    describe: 'Initialize budget with this many chars already used (for recovery after blob deletion)'
  })
  .option('backfill-fulldesc', {
    type: 'boolean',
    default: false,
    describe: 'Backfill full descriptions to shipping blobs for already-translated items'
  })
  .option('cleanup-short-desc', {
    type: 'boolean',
    default: false,
    describe: 'Update aggregate short descriptions from shipping blob full translations (max 260 chars)'
  })
  .option('confirmed', {
    type: 'boolean',
    default: false,
    describe: 'Required for pruning stage to actually delete data (safety flag)'
  })
  .option('retention-days', {
    type: 'number',
    default: 365,
    describe: 'Days to retain unlisted items before pruning (default 365)'
  })
  .option('items', {
    type: 'string',
    describe: 'Comma-separated refNums to force-translate (translate stage only)'
  })
  .option('delay', {
    type: 'number',
    default: 60,
    describe: 'Delay between translation batches in seconds (free tier needs ~60s)'
  })
  .option('clear', {
    type: 'boolean',
    default: false,
    describe: 'Clear all images from R2 before processing (use when changing sizes)'
  })
  .help()
  .strict()
  .parseSync();

async function main() {
  // Avoid noisy MaxListeners warnings under higher concurrency in local runs
  try { EventEmitter.defaultMaxListeners = Math.max(50, EventEmitter.defaultMaxListeners || 10); } catch {}
  if (argv.persist) process.env.CRAWLER_PERSIST = argv.persist;
  if (argv.force) process.env.CRAWLER_FORCE = '1';
  if (argv['refresh-share']) process.env.CRAWLER_REFRESH_SHARE = '1';
  if (argv['refresh-shipping']) process.env.CRAWLER_REFRESH_SHIPPING = '1';

  const env = loadEnv();
  const defaultMkts = cfgMarkets(env.markets);
  const markets = (argv.markets ? argv.markets.split(',').map((s: string) => s.trim().toUpperCase()) : defaultMkts) as MarketCode[];

  const stage = argv.stage as 'index' | 'items' | 'sellers' | 'pruning' | 'translate' | 'images' | 'all' | 'cat-tests';
  const started = Date.now();
  const since = (t: number) => Math.round((Date.now() - t) / 1000);

  log.cli.info(`start`, { stage, markets: markets.join(','), persist: process.env.CRAWLER_PERSIST || 'auto' });

  try {
    if (stage === 'index' || stage === 'all') {
      const t0 = Date.now();
      let total = 0;
      for (const m of markets) {
        log.index.info(`market`, { market: m });
        try {
          const res = await indexMarket(m);
          total += Number(res?.counts?.items || 0);
          log.index.info(`done`, { market: m, items: res?.counts?.items ?? 0 });
        } catch (e: any) {
          log.index.error(`error`, { market: m, reason: e?.message || String(e) });
        }
      }
      log.index.info(`all markets done`, { totalItems: total, secs: since(t0) });
      
      // Trigger on-demand ISR revalidation only for markets that were indexed
      log.index.info(`triggering ISR revalidation`, { markets: markets.join(',') });
      const tRevalidate = Date.now();
      await tryRevalidateMarkets(markets);
      log.index.info(`revalidation complete`, { secs: since(tRevalidate) });
    }

    if (stage === 'cat-tests') {
      const t0 = Date.now();
      log.cli.info(`categorization tests start`);
      const { runUnifiedCategorizationRegressions } = await import('./tests/categorization-regressions');
      const reg = await runUnifiedCategorizationRegressions();
      const { runAllCategorizationTests } = await import('./tests/categorization-all');
      try { await runAllCategorizationTests(); } catch { /* exit code set by test file */ }
      log.cli.info(`tests done`, { unifiedFail: reg.fail, secs: since(t0) });
      process.exit(reg.fail ? 1 : 0);
    }

    if (stage === 'items' || stage === 'all') {
      const t0 = Date.now();
  log.items.info(`build worklist`);
  const work = await buildItemsWorklist(markets);
  const forceAll = !!argv.force || /^(1|true|yes|on)$/i.test(String(process.env.CRAWLER_FORCE||''));
  const explicitLimit = (typeof argv.limit === 'number' && argv.limit > 0) ? argv.limit : undefined;
      
      // Determine staleness threshold for full refresh (default: 80 days from env)
      const fullRefreshDays = Number.parseInt(process.env.CRAWLER_FULL_REFRESH_DAYS || '80', 10);
      const fullRefreshMs = fullRefreshDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - fullRefreshMs;
      
      // Plan modes: full for new/stale/changed, reviews-only for the rest (every run) unless --force
      let planned: Array<{ id: string; markets: MarketCode[]; mode: 'full' | 'reviews-only'; lua?: string }> = [];
      if (forceAll) {
        // --force flag: everything gets full mode
        planned = work.uniqueIds.map(id => ({ id, markets: Array.from(work.presenceMap.get(id) || []) as MarketCode[], mode: 'full', lua: work.idLua.get(id) || undefined }));
      } else {
        // Use shipping-meta aggregate to check lastRefresh (one file load instead of 943!)
        const sharedBlob = getBlobClient(env.stores.shared);
        const shippingMeta = await sharedBlob.getJSON<any>(Keys.shared.aggregates.shippingMeta()).catch(() => ({}));
        
        // Determine mode for each item
        let indexChangedCount = 0;
        let noFullCrawlCount = 0;
        for (const id of work.uniqueIds) {
          const marketsFor = Array.from(work.presenceMap.get(id) || []) as MarketCode[];
          const indexLua = work.idLua.get(id);
          const metaEntry = shippingMeta[id];
          
          let mode: 'full' | 'reviews-only' = 'reviews-only';
          
          // Full mode if: new item, never had full crawl, or stale (older than CRAWLER_FULL_REFRESH_DAYS)
          if (!metaEntry || !metaEntry.lastRefresh) {
            mode = 'full'; // New item (never crawled)
          } else if (!metaEntry.lastFullCrawl) {
            // CRITICAL: Item was crawled (has lastRefresh) but never had a full crawl
            // This happens when a prior run got reviews but failed to get description
            // Without this check, such items get stuck in reviews-only forever
            mode = 'full';
            noFullCrawlCount++;
          } else {
            const lastFullCrawlTime = new Date(metaEntry.lastFullCrawl).getTime();
            if (lastFullCrawlTime < cutoffTime) {
              mode = 'full'; // Stale (lastFullCrawl older than CRAWLER_FULL_REFRESH_DAYS)
            } else if (indexLua) {
              // Compare index lua to stored lastIndexedLua (legacy pattern: item.lastUpdatedAt vs rec.lastIndexedUpdatedAt)
              const lastIndexedLua = metaEntry.lastIndexedLua;
              if (!lastIndexedLua || new Date(indexLua) > new Date(lastIndexedLua)) {
                mode = 'full'; // Index changed since last full crawl
                indexChangedCount++;
              }
            }
          }
          
          planned.push({ id, markets: marketsFor, mode, lua: indexLua });
        }
        if (indexChangedCount > 0) {
          log.items.info(`index changes detected`, { count: indexChangedCount });
        }
        if (noFullCrawlCount > 0) {
          log.items.info(`items missing lastFullCrawl (will get full crawl)`, { count: noFullCrawlCount });
        }
      }

  // Apply --ids filter if specified
  if (argv.ids) {
    const filterIds = String(argv.ids).split(',').map(s => s.trim()).filter(Boolean);
    planned = planned.filter(item => filterIds.includes(item.id));
    log.items.info(`filtered by --ids`, { count: planned.length, ids: filterIds.join(', ') });
  }

  // Apply limit only if explicitly provided via CLI; otherwise process all planned
  let toProcess = typeof explicitLimit === 'number' ? planned.slice(0, explicitLimit) : planned;
      const fullCt = toProcess.filter(p => p.mode === 'full').length;
      const revCt = toProcess.length - fullCt;
      const desired = (typeof argv.concurrency === 'number' && argv.concurrency > 0) ? argv.concurrency : (env.maxParallel || 6);
  const limitNote = explicitLimit ?? 'none';
  log.items.info(`planning`, { toProcess: toProcess.length, full: fullCt, reviews: revCt, limit: limitNote, concurrency: desired, force: forceAll ? 1 : 0 });

  // Establish a single authenticated client (reuses persisted cookies; falls back to anon if creds missing)
  const { client: httpClient } = await ensureAuthedClient();

  // Stable position map for progress like (x/N) even under concurrency
      const total = toProcess.length;
      const positionById = new Map<string, number>();
      toProcess.forEach((e, idx) => positionById.set(e.id, idx + 1));

  const PQueue = (await import('p-queue')).default;
      const q = new PQueue({ concurrency: desired });
      let ok = 0; let fail = 0; let processed = 0; let totalMs = 0;

      // Load aggregated shares once; collect updates to write at end
      let sharesAgg: Record<string, string> = {};
      try {
        const sharedBlob = getBlobClient(env.stores.shared);
        const map = await sharedBlob.getJSON<any>(Keys.shared.aggregates.shares());
        if (map && typeof map === 'object') sharesAgg = map as Record<string, string>;
      } catch {}
      const shareUpdates: Record<string, string> = {};
      const shipUpdatesByMarket: Record<string, Record<string, { min: number; max: number; free: number }>> = {};
      const shippingMetaUpdates: Record<string, { lastRefresh: string; markets?: Record<string, string>; lastIndexedLua?: string }> = {};

      const runOne = async (entry: { id: string; markets: MarketCode[]; mode: 'full' | 'reviews-only'; lua?: string }) => {
        const t1 = Date.now();
        try {
          // BUG-002: Pass index entry for SEO field preservation
          const indexEntry = work.indexEntryById?.get(entry.id);
          const res = await processSingleItem(entry.id, entry.markets as MarketCode[], { client: httpClient, mode: entry.mode === 'full' ? 'full' : 'reviews-only', indexLua: entry.lua, logPrefix: '[cli:item]', sharesAgg, forceShare: !!argv['refresh-share'], indexEntry });
          const ms = Date.now() - t1; totalMs += ms; processed++;
          if (res.ok) {
            ok++;
            if (res.shareLink) {
              shareUpdates[entry.id] = res.shareLink;
            }
            if (res.shipSummaryByMarket) {
              for (const [mkt, summary] of Object.entries(res.shipSummaryByMarket)) {
                if (!shipUpdatesByMarket[mkt]) shipUpdatesByMarket[mkt] = {} as any;
                shipUpdatesByMarket[mkt][entry.id] = summary as any;
              }
            }
            if (res.shippingMetaUpdate) {
              shippingMetaUpdates[entry.id] = res.shippingMetaUpdate;
            }
          } else {
            fail++;
          }
          const pos = positionById.get(entry.id) || processed;
          log.items.time(`(${pos}/${total}) id=${entry.id}`, ms, { mode: entry.mode, ok: res.ok ? 1 : 0 });
          if (processed % Math.max(10, Math.floor(toProcess.length/10) || 10) === 0) {
            const avg = processed ? Math.round(totalMs/processed) : 0;
            log.items.info(`progress`, { processed: `${processed}/${toProcess.length}`, ok, fail, avgMs: avg });
          }
        } catch (e: any) {
          const ms = Date.now() - t1; totalMs += ms; processed++; fail++;
          const pos = positionById.get(entry.id) || processed;
          log.items.error(`item error`, { pos: `${pos}/${total}`, id: entry.id, mode: entry.mode, ms, reason: e?.message || String(e) });
        }
      };

      for (const entry of toProcess) q.add(() => runOne(entry as any));
      await q.onIdle();

      const avg = processed ? Math.round(totalMs/processed) : 0;
      log.items.info(`done`, { ok, fail, total: toProcess.length, avgMs: avg, secs: since(t0) });

      // Merge-write aggregates (shares + shipping summaries) to live Blobs
      try {
        // Shared shares aggregate
        const sharedBlob = getBlobClient(env.stores.shared);
        const sharesKey = Keys.shared.aggregates.shares();
        const existingShares = ((await sharedBlob.getJSON<any>(sharesKey)) || {}) as Record<string, string>;
        let sharesChanged = false;
        for (const [id, link] of Object.entries(shareUpdates)) {
          if (typeof link !== 'string' || !link) continue;
          if (existingShares[id] !== link) {
            existingShares[id] = link;
            sharesChanged = true;
          }
        }
        if (sharesChanged) {
          await sharedBlob.putJSON(sharesKey, existingShares);
          log.items.info(`aggregates: wrote shares`, { updates: Object.keys(shareUpdates).length, total: Object.keys(existingShares).length });
        } else {
          log.items.info(`aggregates: shares unchanged`, { candidates: Object.keys(shareUpdates).length });
        }

        // Per-market shipping summary aggregates
        for (const [mkt, updates] of Object.entries(shipUpdatesByMarket)) {
          const storeName = marketStore(mkt as any, env.stores as any);
          const marketBlob = getBlobClient(storeName);
          const key = Keys.market.aggregates.shipSummary();
          const existing = ((await marketBlob.getJSON<any>(key)) || {}) as Record<string, { min: number; max: number; free: number }>;
          let changed = false;
          for (const [id, summary] of Object.entries(updates)) {
            const prev = existing[id];
            const same = prev && prev.min === (summary as any).min && prev.max === (summary as any).max && prev.free === (summary as any).free;
            if (!same) {
              existing[id] = summary as any;
              changed = true;
            }
          }
          if (changed) {
            await marketBlob.putJSON(key, existing);
            log.items.info(`aggregates: wrote shipSummary`, { market: mkt, updates: Object.keys(updates).length, total: Object.keys(existing).length });
          } else {
            log.items.info(`aggregates: shipSummary unchanged`, { market: mkt, candidates: Object.keys(updates).length });
          }
        }
        
        // Shipping metadata aggregate (staleness tracking)
        if (Object.keys(shippingMetaUpdates).length > 0) {
          const metaKey = Keys.shared.aggregates.shippingMeta();
          const existingMeta = ((await sharedBlob.getJSON<any>(metaKey)) || {}) as Record<string, { lastRefresh: string; markets?: Record<string, string>; lastIndexedLua?: string }>;
          let metaChanged = false;
          for (const [id, update] of Object.entries(shippingMetaUpdates)) {
            const prev = existingMeta[id];
            const same = prev && prev.lastRefresh === update.lastRefresh && prev.lastIndexedLua === update.lastIndexedLua && JSON.stringify(prev.markets || {}) === JSON.stringify(update.markets || {});
            if (!same) {
              existingMeta[id] = update;
              metaChanged = true;
            }
          }
          if (metaChanged) {
            await sharedBlob.putJSON(metaKey, existingMeta);
            log.items.info(`aggregates: wrote shippingMeta`, { updates: Object.keys(shippingMetaUpdates).length, total: Object.keys(existingMeta).length });
          } else {
            log.items.info(`aggregates: shippingMeta unchanged`, { candidates: Object.keys(shippingMetaUpdates).length });
          }
        }
      } catch (e: any) {
        log.items.warn(`aggregates write failed`, { reason: e?.message || String(e) });
      }
    }

    if (stage === 'sellers' || stage === 'all') {
      const t0 = Date.now();
      log.sellers.info(`start`);
      // If a numeric --limit was provided, use it to limit count of sellers processed during this run
      if (typeof argv.limit === 'number' && argv.limit > 0) {
        process.env.SELLERS_LIMIT = String(argv.limit);
      }
      const res = await runSellers(markets);
      log.sellers.info(`done`, { ok: res.ok, counts: res.counts || {}, secs: since(t0) });
    }

    if (stage === 'pruning' || stage === 'all') {
      const t0 = Date.now();
      const dryRun = argv['dry-run'] && stage === 'pruning';
      const confirmed = argv['confirmed'] === true && stage === 'pruning';
      const retentionDays = typeof argv['retention-days'] === 'number' ? argv['retention-days'] : 365;
      log.cli.info(`pruning start`, { dryRun, confirmed, retentionDays });
      const res = await runPruning(markets, { dryRun, confirmed, retentionDays });
      const perMarket = res.counts?.perMarket ? Object.entries(res.counts.perMarket).map(([m, c]) => `${m}:shipDel=${c.shipDeleted},aggTrim=${c.shipSummaryTrimmed}`).join(' | ') : 'n/a';
      log.cli.info(`pruning ${res.dryRun ? 'dry run' : 'done'}`, { 
        ok: res.ok, 
        orphanCores: res.counts?.itemsDeleted ?? 0, 
        translationsPruned: res.counts?.translationsPruned ?? 0,
        indexMetaRemoved: res.counts?.indexMetaRemoved ?? 0,
        indexMetaRetained: res.counts?.indexMetaRetained ?? 0,
        indexMetaMigrated: res.counts?.indexMetaMigrated ?? 0,
        sellersDel: res.counts?.sellersDeleted ?? 0, 
        perMarket,
        retentionDays,
        dryRun: res.dryRun,
        secs: since(t0) 
      });
    }

    // Translation stage (separate from 'all' to avoid consuming budget on routine crawls)
    if (stage === 'translate') {
      const t0 = Date.now();
      
      // Cleanup mode: update aggregate from shipping blobs
      if (argv['cleanup-short-desc']) {
        const res = await runCleanupShortDesc({
          dryRun: argv['dry-run'],
          limit: typeof argv.limit === 'number' ? argv.limit : undefined,
          env,
        });
        
        log.translate.info('cleanup-short-desc complete', {
          scanned: res.scanned,
          updated: res.updated,
          skipped: res.skipped,
          errors: res.errors.length,
          secs: since(t0),
        });
        return;
      }
      
      // Parse locales if provided
      const locales = argv.locales 
        ? String(argv.locales).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : undefined;
      
      const res = await runTranslate({
        limit: typeof argv.limit === 'number' ? argv.limit : undefined,
        locales,
        force: argv.force,
        dryRun: argv['dry-run'],
        budgetCheck: argv['budget-check'],
        budgetInit: typeof argv['budget-init'] === 'number' ? argv['budget-init'] : undefined,
        batchDelayMs: (argv.delay as number) * 1000,
        backfillFullDesc: Boolean(argv['backfill-fulldesc']),
        items: argv.items ? String(argv.items).split(',').map(s => s.trim()).filter(Boolean) : undefined,
      });
      
      if (res.budgetExhausted) {
        log.translate.warn(`budget exhausted`, { translated: res.translated, secs: since(t0) });
      } else {
        log.translate.info(`done`, { 
          translated: res.translated, 
          charCount: res.charCount.toLocaleString(),
          dryRun: res.dryRun ? 'yes' : 'no',
          secs: since(t0) 
        });
      }
    }

    // Images stage: optimize images and upload to R2
    if (stage === 'images') {
      const t0 = Date.now();
      const sharedBlob = getBlobClient('site-index-shared');
      
      // Clear all existing images if --clear flag is set
      if (argv.clear) {
        log.image.info('clearing existing images (--clear flag)');
        const { deleted, errors } = await clearAllImages();
        log.image.info('clear result', { deleted, errors });
      }
      
      // Gather all image URLs from all markets
      const imageUrls: string[] = [];
      for (const m of markets) {
        const storeName = marketStore(m, env.stores);
        const blob = getBlobClient(storeName);
        const items = await blob.getJSON<any[]>(Keys.market.index(m)) || [];
        for (const item of items) {
          // Main image (minified key: i)
          const mainImg = item.i || item.imageUrl;
          if (mainImg && typeof mainImg === 'string') {
            imageUrls.push(mainImg);
          }
          // Gallery images (minified key: is)
          const gallery = item.is || item.imageUrls;
          if (Array.isArray(gallery)) {
            for (const img of gallery) {
              if (img && typeof img === 'string') {
                imageUrls.push(img);
              }
            }
          }
        }
      }
      
      // Deduplicate URLs
      const uniqueUrls = [...new Set(imageUrls)];
      log.image.info('discovered images', { total: imageUrls.length, unique: uniqueUrls.length });
      
      const { stats } = await processImages(uniqueUrls, {
        concurrency: argv.concurrency || 10,
        force: argv.force || argv.clear, // Force re-process if clearing
        maxImages: typeof argv.limit === 'number' ? argv.limit : undefined,
        sharedBlob,
        dryRun: argv['dry-run'],
      });
      
      // No gif-map needed! Frontend detects GIFs by checking if anim.webp exists
      
      log.image.info('complete', {
        processed: stats.processed,
        cached: stats.cached,
        failed: stats.failed,
        gifs: stats.gifs,
        budgetLimited: stats.budgetLimited,
        secs: since(t0),
      });
    }

    // Pricing stage: generate price-per-gram aggregates
    if (stage === 'pricing') {
      const t0 = Date.now();
      log.pricing.info('starting pricing aggregation');
      await runPricing(markets);
      log.pricing.info('complete', { secs: since(t0) });
    }

    log.cli.info(`completed`, { stage, totalSecs: since(started) });
    process.exit(0);
  } catch (e: any) {
    log.cli.error(`fatal`, { error: e?.stack || e?.message || String(e) });
    process.exit(1);
  }
}

void main();
