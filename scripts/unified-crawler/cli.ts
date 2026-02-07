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
    choices: ['auto', 'blobs', 'fs', 'r2', 'both'],
    default: 'auto',
    describe: 'Persistence mode: auto|blobs|fs|r2|both (both = blobs primary + R2 shadow write)'
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
  .option('type', {
    type: 'string',
    choices: ['items', 'sellers', 'all'],
    default: 'all',
    describe: 'Which entities to translate (requires --stage=translate)'
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
  .option('skip-enrich', {
    type: 'boolean',
    default: false,
    describe: 'Skip fast-enrich after indexing (index stage only)'
  })
  .help()
  .strict()
  .parseSync();

async function main() {
  // Avoid noisy MaxListeners warnings under higher concurrency in local runs
  try { EventEmitter.defaultMaxListeners = Math.max(50, EventEmitter.defaultMaxListeners || 10); } catch { }
  if (argv.persist) process.env.CRAWLER_PERSIST = argv.persist;
  if (argv.force) process.env.CRAWLER_FORCE = '1';
  if (argv['refresh-share']) process.env.CRAWLER_REFRESH_SHARE = '1';
  if (argv['refresh-shipping']) process.env.CRAWLER_REFRESH_SHIPPING = '1';

  const env = loadEnv();
  const defaultMkts = cfgMarkets(env.markets);
  const markets = (argv.markets ? argv.markets.split(',').map((s: string) => s.trim().toUpperCase()) : defaultMkts) as MarketCode[];

  const stage = argv.stage as 'index' | 'items' | 'sellers' | 'pruning' | 'translate' | 'images' | 'all' | 'cat-tests';
  const started = Date.now();
  const { since } = await import('./shared/timing');

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

      // -----------------------------------------------------------------------
      // Fast-enrich: detect new/changed items and enrich inline
      // -----------------------------------------------------------------------
      if (!argv['skip-enrich'] && total > 0) {
        const tEnrich = Date.now();
        try {
          const indexDiffMod = await import('./shared/logic/indexDiff');
          const { computeIndexDiff, mergeMarketDiffs } = indexDiffMod;
          const sharedBlob = getBlobClient(env.stores.shared);
          const SNAPSHOT_KEY = 'aggregates/index-snapshot.json';

          // Load previous snapshots
          let allSnapshots: Record<string, Record<string, { lua: string; sig: string }>> = {};
          try {
            const stored = await sharedBlob.getJSON<typeof allSnapshots>(SNAPSHOT_KEY);
            if (stored && typeof stored === 'object') allSnapshots = stored;
          } catch {}

          // Compute per-market diffs
          const diffs: Array<ReturnType<typeof computeIndexDiff>> = [];
          const newSnapshots: Record<string, Record<string, { lua: string; sig: string }>> = {};

          for (const m of markets) {
            try {
              const storeName = marketStore(m, env.stores);
              const mktBlob = getBlobClient(storeName);
              const currentIndex = await mktBlob.getJSON<any[]>(Keys.market.index(m));
              if (!Array.isArray(currentIndex) || currentIndex.length === 0) continue;

              const prevSnap = allSnapshots[m] || {};
              const diff = computeIndexDiff(currentIndex, prevSnap, m);
              diffs.push(diff);
              newSnapshots[m] = diff.snapshot;

              if (diff.newItems.length > 0 || diff.changedItems.length > 0) {
                log.index.info(`diff`, { market: m, new: diff.newItems.length, changed: diff.changedItems.length, removed: diff.removedIds.length });
              }
            } catch (e: any) {
              log.index.warn(`diff error`, { market: m, reason: e?.message || String(e) });
              if (allSnapshots[m]) newSnapshots[m] = allSnapshots[m];
            }
          }

          // Merge diffs across markets
          const merged = mergeMarketDiffs(diffs);
          const toEnrich = [...merged.newItems, ...merged.changedItems];
          log.index.info(`diff merged`, { new: merged.newItems.length, changed: merged.changedItems.length, toEnrich: toEnrich.length });

          // Fast-enrich new/changed items
          if (toEnrich.length > 0) {
            const { fastEnrich } = await import('./stages/items/fastEnrich');
            const { writeItemAggregates } = await import('./stages/items/aggregates');

            // CLI has no hard deadline — use a generous 30 min default
            const deadlineMs = Date.now() + (30 * 60 * 1000);
            // Respect --limit for fast-enrich too
            const maxItems = typeof argv.limit === 'number' && argv.limit > 0 ? argv.limit : undefined;

            const enrichRes = await fastEnrich(toEnrich, {
              markets,
              stores: env.stores as any,
              deadlineMs,
              processImages: true,
              maxItems,
            });

            log.index.info(`fast-enrich done`, {
              enriched: enrichRes.enriched,
              failed: enrichRes.failed,
              skipped: enrichRes.skippedDeadline,
              images: enrichRes.imagesProcessed,
              secs: since(tEnrich),
            });

            // Write aggregate updates
            if (enrichRes.enriched > 0) {
              try {
                await writeItemAggregates(
                  enrichRes.aggregateUpdates,
                  env.stores as any,
                  (msg) => log.index.info(msg),
                );
              } catch (e: any) {
                log.index.warn(`aggregates write failed`, { reason: e?.message || String(e) });
              }
            }
          }

          // Save updated snapshots (always — tracks removals too)
          try {
            await sharedBlob.putJSON(SNAPSHOT_KEY, newSnapshots);
            log.index.info(`snapshot saved`, { markets: Object.keys(newSnapshots).length });
          } catch (e: any) {
            log.index.warn(`snapshot save failed`, { reason: e?.message || String(e) });
          }

        } catch (e: any) {
          // Fast-enrich failures never break the CLI index stage
          log.index.warn(`fast-enrich phase error`, { reason: e?.message || String(e) });
        }
      } else if (argv['skip-enrich']) {
        log.index.info(`fast-enrich skipped (--skip-enrich)`);
      }
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
      const forceAll = !!argv.force || /^(1|true|yes|on)$/i.test(String(process.env.CRAWLER_FORCE || ''));
      const explicitLimit = (typeof argv.limit === 'number' && argv.limit > 0) ? argv.limit : undefined;

      // Plan modes via shared logic (full for new/stale/changed, reviews-only otherwise)
      const { planItemModes } = await import('./stages/items/planModes');
      const { planned: rawPlanned, indexChangedCount, noFullCrawlCount } = await planItemModes({
        uniqueIds: work.uniqueIds,
        presenceMap: work.presenceMap,
        idLua: work.idLua,
        sharedStoreName: env.stores.shared,
        forceAll,
      });
      let planned = rawPlanned;
      if (indexChangedCount > 0) {
        log.items.info(`index changes detected`, { count: indexChangedCount });
      }
      if (noFullCrawlCount > 0) {
        log.items.info(`items missing lastFullCrawl (will get full crawl)`, { count: noFullCrawlCount });
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
      } catch { }
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
          if (processed % Math.max(10, Math.floor(toProcess.length / 10) || 10) === 0) {
            const avg = processed ? Math.round(totalMs / processed) : 0;
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

      const avg = processed ? Math.round(totalMs / processed) : 0;
      log.items.info(`done`, { ok, fail, total: toProcess.length, avgMs: avg, secs: since(t0) });

      // Merge-write aggregates (shares + shipping summaries) to live Blobs
      try {
        const { writeItemAggregates } = await import('./stages/items/aggregates');
        await writeItemAggregates(
          { shareUpdates, shipUpdatesByMarket, shippingMetaUpdates },
          env.stores as any,
          (msg) => log.items.info(msg),
        );
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
        type: argv.type as 'items' | 'sellers' | 'all',
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
    // Smart change detection: only processes NEW or UPDATED items (based on lua)
    if (stage === 'images') {
      const t0 = Date.now();
      const sharedBlob = getBlobClient('site-index-shared');

      // Import image meta helpers
      const {
        loadImageMeta,
        saveImageMeta,
        getItemsNeedingImageUpdate,
        updateItemImageMeta,
        getStaleHashes
      } = await import('./stages/images/imageMeta');
      const { hashUrl, deleteImageFolder } = await import('./stages/images/optimizer');

      // Clear all existing images if --clear flag is set
      if (argv.clear) {
        log.image.info('clearing existing images (--clear flag)');
        const { deleted, errors } = await clearAllImages();
        log.image.info('clear result', { deleted, errors });
      }

      // Load image metadata (tracks which images we've processed per item)
      const imageMeta = argv.clear ? {} : await loadImageMeta(sharedBlob);
      log.image.info('loaded image metadata', { itemsTracked: Object.keys(imageMeta).length });

      // Gather all items with their image URLs from all markets
      // Use minified keys: id->id, lua->lastUpdatedAt, i->imageUrl, is->imageUrls
      type IndexItem = { id: string; lua?: string; i?: string; imageUrl?: string; is?: string[]; imageUrls?: string[] };
      const allItems: IndexItem[] = [];
      const seenIds = new Set<string>();

      for (const m of markets) {
        const storeName = marketStore(m, env.stores);
        const blob = getBlobClient(storeName);
        const items = await blob.getJSON<IndexItem[]>(Keys.market.index(m)) || [];
        for (const item of items) {
          if (!item.id || seenIds.has(item.id)) continue;
          seenIds.add(item.id);
          allItems.push(item);
        }
      }

      // Normalize items to consistent format for change detection
      const normalizedItems = allItems.map(item => ({
        id: item.id,
        lua: item.lua,
        imageUrl: item.i || item.imageUrl,
        imageUrls: item.is || item.imageUrls || [],
      }));

      // Determine which items need image processing (new or lua changed)
      const forceAll = argv.force || argv.clear;
      let itemsToProcess = forceAll
        ? normalizedItems.map(item => ({
          id: item.id,
          lua: item.lua || '',
          imageUrls: [item.imageUrl, ...(item.imageUrls || [])].filter(Boolean) as string[],
          existingHashes: imageMeta[item.id]?.hashes || [],
        }))
        : getItemsNeedingImageUpdate(normalizedItems, imageMeta);

      // Count total images across all items
      const totalImageUrls = normalizedItems.reduce((sum, item) => {
        return sum + (item.imageUrl ? 1 : 0) + (item.imageUrls?.length || 0);
      }, 0);
      const uniqueImageUrls = new Set(normalizedItems.flatMap(item =>
        [item.imageUrl, ...(item.imageUrls || [])].filter(Boolean)
      )).size;

      log.image.info('discovered images', {
        totalItems: allItems.length,
        total: totalImageUrls,
        unique: uniqueImageUrls,
        itemsNeedingUpdate: itemsToProcess.length,
        force: forceAll,
      });

      if (itemsToProcess.length === 0) {
        log.image.info('no items need image updates');
        log.image.info('complete', { processed: 0, cached: 0, failed: 0, gifs: 0, secs: since(t0) });
      } else {
        // Apply --limit if specified (limit number of items, not images)
        if (typeof argv.limit === 'number' && argv.limit > 0) {
          itemsToProcess = itemsToProcess.slice(0, argv.limit);
          log.image.info('limited to items', { count: itemsToProcess.length });
        }

        // Collect all image URLs and track which item each belongs to
        const urlToItemId = new Map<string, string>();
        const imageUrls: string[] = [];
        for (const item of itemsToProcess) {
          for (const url of item.imageUrls) {
            if (!urlToItemId.has(url)) {
              urlToItemId.set(url, item.id);
              imageUrls.push(url);
            }
          }
        }

        // Process images
        const { stats, results } = await processImages(imageUrls, {
          concurrency: argv.concurrency || 10,
          force: forceAll,
          sharedBlob,
          dryRun: argv['dry-run'],
        });

        // Delete stale image hashes (images that were replaced or removed from the item)
        let staleDeleted = 0;
        if (!argv['dry-run']) {
          for (const item of itemsToProcess) {
            const newHashes = item.imageUrls.map(url => hashUrl(url));
            const staleHashes = getStaleHashes(item.existingHashes, newHashes);

            for (const hash of staleHashes) {
              const deleted = await deleteImageFolder(hash);
              if (deleted) staleDeleted++;
            }
          }
          if (staleDeleted > 0) {
            log.image.info('deleted stale images', { count: staleDeleted });
          }
        }

        // Update image metadata for processed items
        if (!argv['dry-run']) {
          let updatedMeta = { ...imageMeta };
          for (const item of itemsToProcess) {
            const newHashes = item.imageUrls.map(url => hashUrl(url));
            updatedMeta = updateItemImageMeta(updatedMeta, item.id, item.lua, newHashes);
          }
          await saveImageMeta(sharedBlob, updatedMeta);
          log.image.info('saved image metadata', { itemsTracked: Object.keys(updatedMeta).length });
        }

        log.image.info('complete', {
          itemsProcessed: itemsToProcess.length,
          processed: stats.processed,
          cached: stats.cached,
          failed: stats.failed,
          gifs: stats.gifs,
          staleDeleted,
          budgetLimited: stats.budgetLimited,
          secs: since(t0),
        });
      }
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
