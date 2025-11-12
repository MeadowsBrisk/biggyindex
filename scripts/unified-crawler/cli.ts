#!/usr/bin/env node
import 'dotenv/config';
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
import { detectItemChanges } from './shared/logic/changes';
import { Keys } from './shared/persistence/keys';
import { getBlobClient } from './shared/persistence/blobs';
import { marketStore } from './shared/env/markets';
import { ensureAuthedClient } from './shared/http/authedClient';

const argv = yargs(hideBin(process.argv))
  .scriptName('unified-crawler')
  .option('stage', {
    type: 'string',
    choices: ['index', 'items', 'sellers', 'pruning', 'all', 'cat-tests'],
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
    describe: 'Limit number of items to process in items stage (for quick tests)',
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

  const stage = argv.stage as 'index' | 'items' | 'sellers' | 'pruning' | 'all' | 'cat-tests';
  const started = Date.now();
  const since = (t: number) => Math.round((Date.now() - t) / 1000);

  console.log(`[cli] start stage=${stage} markets=${markets.join(',')} persist=${process.env.CRAWLER_PERSIST || 'auto'}`);

  try {
    if (stage === 'index' || stage === 'all') {
      const t0 = Date.now();
      let total = 0;
      for (const m of markets) {
        console.log(`[cli:index] market=${m}`);
        try {
          const res = await indexMarket(m);
          total += Number(res?.counts?.items || 0);
          console.log(`[cli:index] done market=${m} items=${res?.counts?.items ?? 0}`);
        } catch (e: any) {
          console.error(`[cli:index] error market=${m}:`, e?.message || e);
        }
      }
      console.log(`[cli:index] all markets done totalItems=${total} in ${since(t0)}s`);
    }

    if (stage === 'cat-tests') {
      const t0 = Date.now();
      console.log(`[cli:tests] categorization tests start`);
      const { runUnifiedCategorizationRegressions } = await import('./tests/categorization-regressions');
      const reg = await runUnifiedCategorizationRegressions();
      const { runAllCategorizationTests } = await import('./tests/categorization-all');
      try { await runAllCategorizationTests(); } catch { /* exit code set by test file */ }
      console.log(`[cli:tests] done unifiedFail=${reg.fail} in ${since(t0)}s`);
      process.exit(reg.fail ? 1 : 0);
    }

    if (stage === 'items' || stage === 'all') {
      const t0 = Date.now();
  console.log(`[cli:items] build worklist...`);
  const work = await buildItemsWorklist(markets);
  const forceAll = !!argv.force || /^(1|true|yes|on)$/i.test(String(process.env.CRAWLER_FORCE||''));
  const explicitLimit = (typeof argv.limit === 'number' && argv.limit > 0) ? argv.limit : undefined;
      
      // Determine staleness threshold for full refresh (default: 80 days from env)
      const fullRefreshDays = Number.parseInt(process.env.CRAWLER_FULL_REFRESH_DAYS || '80', 10);
      const fullRefreshMs = fullRefreshDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - fullRefreshMs;
      
      // Plan modes: full for new/stale/changed, reviews-only for the rest (every run) unless --force
      let planned: Array<{ id: string; markets: MarketCode[]; mode: 'full' | 'reviews-only'; sig?: string }> = [];
      if (forceAll) {
        // --force flag: everything gets full mode
        planned = work.uniqueIds.map(id => ({ id, markets: Array.from(work.presenceMap.get(id) || []) as MarketCode[], mode: 'full', sig: work.idSig.get(id) || undefined }));
      } else {
        // Use shipping-meta aggregate to check lastRefresh (one file load instead of 943!)
        const sharedBlob = getBlobClient(env.stores.shared);
        const shippingMeta = await sharedBlob.getJSON<any>(Keys.shared.aggregates.shippingMeta()).catch(() => ({}));
        
        // Determine mode for each item
        for (const id of work.uniqueIds) {
          const marketsFor = Array.from(work.presenceMap.get(id) || []) as MarketCode[];
          const indexSig = work.idSig.get(id);
          const metaEntry = shippingMeta[id];
          
          let mode: 'full' | 'reviews-only' = 'reviews-only';
          
          // Full mode if: new item or stale (older than CRAWLER_FULL_REFRESH_DAYS)
          if (!metaEntry || !metaEntry.lastRefresh) {
            mode = 'full'; // New item (never crawled)
          } else {
            const lastRefreshTime = new Date(metaEntry.lastRefresh).getTime();
            if (lastRefreshTime < cutoffTime) {
              mode = 'full'; // Stale
            }
          }
          
          // Note: Not checking signature changes since shipping-meta doesn't track them.
          // Signature changes are rare, and indexer marks items as "updated" anyway.
          
          planned.push({ id, markets: marketsFor, mode, sig: indexSig });
        }
      }

  // Apply --ids filter if specified
  if (argv.ids) {
    const filterIds = String(argv.ids).split(',').map(s => s.trim()).filter(Boolean);
    planned = planned.filter(item => filterIds.includes(item.id));
    console.log(`[cli:items] filtered by --ids: ${planned.length} items matching [${filterIds.join(', ')}]`);
  }

  // Apply limit only if explicitly provided via CLI; otherwise process all planned
  let toProcess = typeof explicitLimit === 'number' ? planned.slice(0, explicitLimit) : planned;
      const fullCt = toProcess.filter(p => p.mode === 'full').length;
      const revCt = toProcess.length - fullCt;
      const desired = (typeof argv.concurrency === 'number' && argv.concurrency > 0) ? argv.concurrency : (env.maxParallel || 6);
  const limitNote = explicitLimit ?? 'none';
  console.log(`[cli:items] toProcess=${toProcess.length} full=${fullCt} reviews=${revCt} (limit=${limitNote}) concurrency=${desired} force=${forceAll ? 1 : 0}`);

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
      const shippingMetaUpdates: Record<string, { lastRefresh: string; markets?: Record<string, string> }> = {};

      const runOne = async (entry: { id: string; markets: MarketCode[]; mode: 'full' | 'reviews-only'; sig?: string }) => {
        const t1 = Date.now();
        try {
          const res = await processSingleItem(entry.id, entry.markets as MarketCode[], { client: httpClient, mode: entry.mode === 'full' ? 'full' : 'reviews-only', currentSignature: entry.sig, logPrefix: '[cli:item]', sharesAgg, forceShare: !!argv['refresh-share'] });
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
          console.log(`[cli:item:time] (${pos}/${total}) id=${entry.id} mode=${entry.mode} dur=${ms}ms ${(ms/1000).toFixed(2)}s ok=${res.ok ? 1 : 0}`);
          if (processed % Math.max(10, Math.floor(toProcess.length/10) || 10) === 0) {
            const avg = processed ? Math.round(totalMs/processed) : 0;
            console.log(`[cli:items] progress ${processed}/${toProcess.length} ok=${ok} fail=${fail} avg=${avg}ms/item`);
          }
        } catch (e: any) {
          const ms = Date.now() - t1; totalMs += ms; processed++; fail++;
          const pos = positionById.get(entry.id) || processed;
          console.error(`[cli:item:time] (${pos}/${total}) id=${entry.id} mode=${entry.mode} error dur=${ms}ms ${e?.message || e}`);
        }
      };

      for (const entry of toProcess) q.add(() => runOne(entry as any));
      await q.onIdle();

      const avg = processed ? Math.round(totalMs/processed) : 0;
      console.log(`[cli:items] done ok=${ok} fail=${fail} total=${toProcess.length} avg=${avg}ms/item in ${since(t0)}s`);

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
          console.log(`[cli:items] aggregates: wrote shares updates=${Object.keys(shareUpdates).length} total=${Object.keys(existingShares).length}`);
        } else {
          console.log(`[cli:items] aggregates: shares unchanged candidates=${Object.keys(shareUpdates).length}`);
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
            console.log(`[cli:items] aggregates: wrote shipSummary ${mkt} updates=${Object.keys(updates).length} total=${Object.keys(existing).length}`);
          } else {
            console.log(`[cli:items] aggregates: shipSummary unchanged ${mkt} candidates=${Object.keys(updates).length}`);
          }
        }
        
        // Shipping metadata aggregate (staleness tracking)
        if (Object.keys(shippingMetaUpdates).length > 0) {
          const metaKey = Keys.shared.aggregates.shippingMeta();
          const existingMeta = ((await sharedBlob.getJSON<any>(metaKey)) || {}) as Record<string, { lastRefresh: string; markets?: Record<string, string> }>;
          let metaChanged = false;
          for (const [id, update] of Object.entries(shippingMetaUpdates)) {
            const prev = existingMeta[id];
            const same = prev && prev.lastRefresh === update.lastRefresh && JSON.stringify(prev.markets || {}) === JSON.stringify(update.markets || {});
            if (!same) {
              existingMeta[id] = update;
              metaChanged = true;
            }
          }
          if (metaChanged) {
            await sharedBlob.putJSON(metaKey, existingMeta);
            console.log(`[cli:items] aggregates: wrote shippingMeta updates=${Object.keys(shippingMetaUpdates).length} total=${Object.keys(existingMeta).length}`);
          } else {
            console.log(`[cli:items] aggregates: shippingMeta unchanged candidates=${Object.keys(shippingMetaUpdates).length}`);
          }
        }
      } catch (e: any) {
        console.warn(`[cli:items] aggregates write failed: ${e?.message || e}`);
      }
    }

    if (stage === 'sellers' || stage === 'all') {
      const t0 = Date.now();
      console.log(`[cli:sellers] start`);
      // If a numeric --limit was provided, use it to limit count of sellers processed during this run
      if (typeof argv.limit === 'number' && argv.limit > 0) {
        process.env.SELLERS_LIMIT = String(argv.limit);
      }
      const res = await runSellers(markets);
      console.log(`[cli:sellers] done ok=${res.ok} counts=${JSON.stringify(res.counts || {})} in ${since(t0)}s`);
    }

    if (stage === 'pruning' || stage === 'all') {
      const t0 = Date.now();
      console.log(`[cli:pruning] start`);
      const res = await runPruning(markets);
      const perMarket = res.counts?.perMarket ? Object.entries(res.counts.perMarket).map(([m, c]) => `${m}:shipDel=${c.shipDeleted},aggTrim=${c.shipSummaryTrimmed}`).join(' | ') : 'n/a';
      console.log(`[cli:pruning] done ok=${res.ok} orphanCores=${res.counts?.itemsDeleted ?? 0} sellersDel=${res.counts?.sellersDeleted ?? 0} perMarket=${perMarket} in ${since(t0)}s`);
    }

    console.log(`[cli] completed stage=${stage} total=${since(started)}s`);
    process.exit(0);
  } catch (e: any) {
    console.error('[cli] fatal:', e?.stack || e?.message || String(e));
    process.exit(1);
  }
}

void main();
