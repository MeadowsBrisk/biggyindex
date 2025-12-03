import type { MarketCode } from "../../shared/env/loadEnv";
import { loadEnv } from "../../shared/env/loadEnv";
import { marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { pruneIndexMeta, type IndexMetaEntry } from "../../shared/logic/indexMetaStore";
import { log } from "../../shared/logging/logger";

export interface PruningRunResult {
  ok: boolean;
  markets: MarketCode[];
  dryRun?: boolean;
  counts?: { 
    itemsDeleted?: number; 
    sellersDeleted?: number; 
    translationsPruned?: number;
    perMarket?: Record<string, { shipDeleted: number; shipSummaryTrimmed: number }>;
  };
  note?: string;
}

export interface PruningOptions {
  dryRun?: boolean;
}

// Phase A pruning: safe, reference-based cleanup
// - Per market: delete market-shipping/<id>.json when id not present in current indexed_items.json
// - Per market: trim aggregates/ship.json to only include currently indexed items
// - Shared: delete items/<id>.json when id not present in ANY market index
// Sellers: not deleted in Phase A (kept for analytics continuity)
export async function runPruning(markets?: MarketCode[], opts: PruningOptions = {}): Promise<PruningRunResult> {
  const dryRun = opts.dryRun ?? false;
  try {
    const env = loadEnv();
    const mkts = (markets && markets.length ? markets : env.markets) as MarketCode[];
    log.cli.info(`pruning start`, { markets: mkts.join(','), dryRun });
    const sharedBlob = getBlobClient(env.stores.shared);

    // 1) Build active item id sets per market and union across markets
    const activeByMarket = new Map<string, Set<string>>();
    const unionActive = new Set<string>();
    for (const mkt of mkts) {
      try {
        const storeName = marketStore(mkt, env.stores as any);
        const blob = getBlobClient(storeName);
        const index = (await blob.getJSON<any[]>(Keys.market.index(mkt))) || [];
        const ids = new Set<string>();
        for (const e of Array.isArray(index) ? index : []) {
          const id = String(e?.refNum ?? e?.ref ?? e?.id ?? '').trim();
          if (id) { ids.add(id); unionActive.add(id); }
        }
        activeByMarket.set(mkt, ids);
        log.cli.info(`pruning market`, { market: mkt, activeItems: ids.size });
      } catch (e: any) {
        log.cli.warn(`pruning: failed to read index`, { market: mkt, reason: e?.message || String(e) });
        activeByMarket.set(mkt, new Set());
      }
    }

    // Shared aggregate fallback: drop metadata entries for items no longer present anywhere
    let indexMetaPruned = 0;
    try {
      let indexMetaAgg: Record<string, IndexMetaEntry> = {};
      const agg = await sharedBlob.getJSON<any>(Keys.shared.aggregates.indexMeta());
      if (agg && typeof agg === 'object') indexMetaAgg = agg as Record<string, IndexMetaEntry>;
      const { removed } = pruneIndexMeta(indexMetaAgg, unionActive);
      indexMetaPruned = removed;
      if (removed > 0) {
        if (!dryRun) {
          await sharedBlob.putJSON(Keys.shared.aggregates.indexMeta(), indexMetaAgg);
        }
        log.cli.info(`pruning: ${dryRun ? 'would prune' : 'pruned'} index-meta`, { entries: removed });
      }
    } catch (e: any) {
      log.cli.warn(`pruning: failed to prune index-meta aggregate`, { reason: e?.message || String(e) });
    }

    // Prune translations aggregate: remove entries for items no longer in any market
    let translationsPruned = 0;
    try {
      const translationsAgg = await sharedBlob.getJSON<Record<string, any>>(Keys.shared.aggregates.translations());
      if (translationsAgg && typeof translationsAgg === 'object') {
        const toDelete: string[] = [];
        for (const refNum of Object.keys(translationsAgg)) {
          if (!unionActive.has(refNum)) {
            toDelete.push(refNum);
          }
        }
        translationsPruned = toDelete.length;
        if (toDelete.length > 0) {
          if (!dryRun) {
            for (const refNum of toDelete) {
              delete translationsAgg[refNum];
            }
            await sharedBlob.putJSON(Keys.shared.aggregates.translations(), translationsAgg);
          }
          log.cli.info(`pruning: ${dryRun ? 'would prune' : 'pruned'} translations aggregate`, { entries: translationsPruned });
        }
      }
    } catch (e: any) {
      log.cli.warn(`pruning: failed to prune translations aggregate`, { reason: e?.message || String(e) });
    }

    // 2) Per-market: delete stale shipping files and trim ship summary aggregate
    const perMarketCounts: Record<string, { shipDeleted: number; shipSummaryTrimmed: number }> = {};
    for (const mkt of mkts) {
      const storeName = marketStore(mkt, env.stores as any);
      const blob = getBlobClient(storeName);
      const active = activeByMarket.get(mkt) || new Set<string>();
      let shipDeleted = 0;
      let shipSummaryTrimmed = 0;

      try {
        const shipKeys = await blob.list("market-shipping/");
        for (const key of shipKeys) {
          const match = key.match(/^market-shipping\/(.+)\.json$/);
          const id = match?.[1];
          if (!id) continue;
          if (!active.has(id)) {
            if (!dryRun) {
              try { await blob.del(key); } catch {}
            }
            shipDeleted++;
          }
        }
      } catch (e: any) {
        log.cli.warn(`pruning: list shipping failed`, { market: mkt, reason: e?.message || String(e) });
      }

      // Trim aggregates/ship.json to current active set
      try {
        const aggKey = Keys.market.aggregates.shipSummary();
        const existing = (await blob.getJSON<Record<string, { min: number; max: number; free: number }>>(aggKey)) || {};
        const toDelete: string[] = [];
        for (const id of Object.keys(existing)) {
          if (!active.has(id)) { toDelete.push(id); shipSummaryTrimmed++; }
        }
        if (toDelete.length > 0 && !dryRun) {
          for (const id of toDelete) {
            delete (existing as any)[id];
          }
          await blob.putJSON(aggKey, existing);
        }
      } catch (e: any) {
        // non-fatal
      }

      perMarketCounts[mkt] = { shipDeleted, shipSummaryTrimmed };
      log.cli.info(`pruning: market ${dryRun ? 'scan' : 'complete'}`, { market: mkt, shipDeleted, shipSummaryTrimmed, dryRun });
    }

    // 3) Shared: delete orphaned item cores (not present in any market)
    let orphanCores = 0;
    try {
      const coreKeys = await sharedBlob.list("items/");
      for (const key of coreKeys) {
        const match = key.match(/^items\/(.+)\.json$/);
        const id = match?.[1];
        if (!id) continue;
        if (!unionActive.has(id)) {
          if (!dryRun) {
            try { await sharedBlob.del(key); } catch {}
          }
          orphanCores++;
        }
      }
    } catch (e: any) {
      log.cli.warn(`pruning: shared list cores failed`, { reason: e?.message || String(e) });
    }

    // Sellers: keep for now (Phase A)
    const sellersDeleted = 0;

    log.cli.info(`pruning ${dryRun ? 'dry run' : 'complete'}`, { orphanCores, translationsPruned, dryRun });
    return { ok: true, markets: mkts, dryRun, counts: { itemsDeleted: orphanCores, sellersDeleted, translationsPruned, perMarket: perMarketCounts } };
  } catch (e: any) {
    log.cli.error(`pruning error`, { reason: e?.message || String(e) });
    return { ok: false, markets: (loadEnv().markets as MarketCode[]), counts: { itemsDeleted: 0, sellersDeleted: 0, translationsPruned: 0 }, note: e?.message || String(e) } as any;
  }
}
