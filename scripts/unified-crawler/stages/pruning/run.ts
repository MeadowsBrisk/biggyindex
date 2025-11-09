import type { MarketCode } from "../../shared/env/loadEnv";
import { loadEnv } from "../../shared/env/loadEnv";
import { marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";

export interface PruningRunResult {
  ok: boolean;
  markets: MarketCode[];
  counts?: { itemsDeleted?: number; sellersDeleted?: number; perMarket?: Record<string, { shipDeleted: number; shipSummaryTrimmed: number }> };
  note?: string;
}

// Phase A pruning: safe, reference-based cleanup
// - Per market: delete market-shipping/<id>.json when id not present in current indexed_items.json
// - Per market: trim aggregates/ship.json to only include currently indexed items
// - Shared: delete items/<id>.json when id not present in ANY market index
// Sellers: not deleted in Phase A (kept for analytics continuity)
export async function runPruning(markets?: MarketCode[]): Promise<PruningRunResult> {
  try {
    const env = loadEnv();
    const mkts = (markets && markets.length ? markets : env.markets) as MarketCode[];
    console.log(`[crawler:pruning] start markets=${mkts.join(',')}`);

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
          const id = String(e?.id ?? e?.refNum ?? e?.ref ?? '').trim();
          if (id) { ids.add(id); unionActive.add(id); }
        }
        activeByMarket.set(mkt, ids);
        console.log(`[crawler:pruning] market=${mkt} activeItems=${ids.size}`);
      } catch (e: any) {
        console.warn(`[crawler:pruning] warn market=${mkt} failed to read index: ${e?.message || e}`);
        activeByMarket.set(mkt, new Set());
      }
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
            try { await blob.del(key); shipDeleted++; } catch {}
          }
        }
      } catch (e: any) {
        console.warn(`[crawler:pruning] market=${mkt} list shipping failed: ${e?.message || e}`);
      }

      // Trim aggregates/ship.json to current active set
      try {
        const aggKey = Keys.market.aggregates.shipSummary();
        const existing = (await blob.getJSON<Record<string, { min: number; max: number; free: number }>>(aggKey)) || {};
        let changed = false;
        for (const id of Object.keys(existing)) {
          if (!active.has(id)) { delete (existing as any)[id]; changed = true; shipSummaryTrimmed++; }
        }
        if (changed) {
          await blob.putJSON(aggKey, existing);
        }
      } catch (e: any) {
        // non-fatal
      }

      perMarketCounts[mkt] = { shipDeleted, shipSummaryTrimmed };
      console.log(`[crawler:pruning] market=${mkt} shipDeleted=${shipDeleted} shipSummaryTrimmed=${shipSummaryTrimmed}`);
    }

    // 3) Shared: delete orphaned item cores (not present in any market)
    const sharedBlob = getBlobClient(env.stores.shared);
    let orphanCores = 0;
    try {
      const coreKeys = await sharedBlob.list("items/");
      for (const key of coreKeys) {
        const match = key.match(/^items\/(.+)\.json$/);
        const id = match?.[1];
        if (!id) continue;
        if (!unionActive.has(id)) {
          try { await sharedBlob.del(key); orphanCores++; } catch {}
        }
      }
    } catch (e: any) {
      console.warn(`[crawler:pruning] shared list cores failed: ${e?.message || e}`);
    }

    // Sellers: keep for now (Phase A)
    const sellersDeleted = 0;

    console.log(`[crawler:pruning] complete orphanCores=${orphanCores}`);
    return { ok: true, markets: mkts, counts: { itemsDeleted: orphanCores, sellersDeleted, perMarket: perMarketCounts } };
  } catch (e: any) {
    console.error(`[crawler:pruning] error`, e?.message || e);
    return { ok: false, markets: (loadEnv().markets as MarketCode[]), counts: { itemsDeleted: 0, sellersDeleted: 0 }, note: e?.message || String(e) } as any;
  }
}
