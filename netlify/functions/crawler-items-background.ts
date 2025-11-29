// Netlify background function: Unified Items stage (every 4 hours)
// Builds a deduped worklist across markets, then processes items within a time budget.
// Handles full vs reviews-only modes; full mode may switch location filter per market for shipping.
import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets } from "../../scripts/unified-crawler/shared/env/markets";
import { buildItemsWorklist } from "../../scripts/unified-crawler/stages/items/run";
import { processSingleItem } from "../../scripts/unified-crawler/stages/items/processItem";
import { detectItemChanges } from "../../scripts/unified-crawler/shared/logic/changes";
import { appendRunMeta } from "../../scripts/unified-crawler/shared/persistence/runMeta";
import { Keys } from "../../scripts/unified-crawler/shared/persistence/keys";
import { marketStore } from "../../scripts/unified-crawler/shared/env/markets";
import { getBlobClient } from "../../scripts/unified-crawler/shared/persistence/blobs";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async (event) => {
  const started = Date.now();
  const log = (m: string) => console.log(`[crawler:items] ${m}`);
  const warn = (m: string) => console.warn(`[crawler:items] ${m}`);
  const err = (m: string) => console.error(`[crawler:items] ${m}`);

  try {
    // Guard: allow disabling via env; override with ?force=1
    const force = event?.queryStringParameters?.force === "1" || event?.queryStringParameters?.force === "true";
    // if (!force && process.env.CRAWLER_UNIFIED_ITEMS !== "1") {
    //   warn("disabled via CRAWLER_UNIFIED_ITEMS != 1; skipping");
    //   return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) } as any;
    // }

    // Safety defaults for Netlify env
    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "blobs";

    if (!process.env.LB_LOGIN_USERNAME || !process.env.LB_LOGIN_PASSWORD) {
      warn("missing LB credentials; items stage requires auth");
    }

    const env = loadEnv();
    const markets = listMarkets(env.markets);

    // Optional: force share refresh via query param
    const refreshShare = event?.queryStringParameters?.refreshShare === "1" ||
      event?.queryStringParameters?.forceShare === "1" ||
      event?.queryStringParameters?.refresh_share === "1" ||
      event?.queryStringParameters?.refreshShare === "true";
    if (refreshShare) process.env.CRAWLER_REFRESH_SHARE = "1";

    log(`start markets=${markets.join(',')}`);

    // Build unified worklist
  const wl = await buildItemsWorklist(markets as any);
  log(`worklist unique=${wl.uniqueIds.length} toCrawl=${wl.toCrawl.length} already=${wl.alreadyHave.length}`);

    // Change detection: decide full vs reviews-only
    // Note: detectItemChanges uses shipping-meta aggregate, not signatures
    const allItems = wl.uniqueIds.map((id) => ({ id, sig: wl.idLua.get(id) }));
    const changeRes = await detectItemChanges(
      { market: markets[0] as any, items: allItems },
      { sharedStoreName: env.stores.shared }
    );
    const fullSet = new Set(changeRes.fullCrawlIds);

    // Time budget for background functions (leave buffer under 15m)
    const maxMs = Math.min(env.maxRuntimeMs, 14 * 60 * 1000);
    const deadline = Date.now() + Math.max(10_000, maxMs - 30_000);

    // Build plan: full first, then reviews-only
    const plan: Array<{ id: string; markets: import("../../scripts/unified-crawler/shared/types").MarketCode[]; mode: "full" | "reviews-only" }> = [];
    for (const id of wl.uniqueIds) {
      const marketsFor = wl.presenceMap.get(id)
        ? (Array.from(wl.presenceMap.get(id) as any) as import("../../scripts/unified-crawler/shared/types").MarketCode[])
        : ([] as import("../../scripts/unified-crawler/shared/types").MarketCode[]);
      if (fullSet.has(id)) plan.push({ id, markets: marketsFor, mode: "full" });
    }
    for (const id of wl.uniqueIds) {
      if (fullSet.has(id)) continue;
      const marketsFor = wl.presenceMap.get(id)
        ? (Array.from(wl.presenceMap.get(id) as any) as import("../../scripts/unified-crawler/shared/types").MarketCode[])
        : ([] as import("../../scripts/unified-crawler/shared/types").MarketCode[]);
      plan.push({ id, markets: marketsFor, mode: "reviews-only" });
    }

    // No sample fallback; process the computed plan and rely on time budget enforcement
    const items = plan;
    log(`toProcess=${items.length}`);

    // Concurrency for Netlify background execution
  const desired = Math.max(1, Number(env.maxParallel || 5));
    log(`planned=${items.length} concurrency=${desired} (env CRAWLER_MAX_PARALLEL)`);

    // Dynamically load p-queue to manage concurrency
    const PQueue = (await import("p-queue")).default;
    const q = new PQueue({ concurrency: desired });

    let processed = 0;
    let ok = 0;
    let fail = 0;
    let totalMs = 0;
    let skippedDueToTime = 0;

  const progressEvery = Math.max(10, Math.floor(items.length / 10) || 10);

  // Load aggregates once to avoid per-item blob reads
  let sharesAgg: Record<string, string> = {};
  try {
    const sharedBlob = getBlobClient(env.stores.shared);
    const map = await sharedBlob.getJSON<any>(Keys.shared.aggregates.shares());
    if (map && typeof map === 'object') sharesAgg = map as Record<string, string>;
  } catch {}

  // Aggregate writers: collect updates during run, write once at the end
  const shareUpdates: Record<string, string> = {};
  const shipUpdatesByMarket: Record<string, Record<string, { min: number; max: number; free: number }>> = {};
  const shippingMetaUpdates: Record<string, { lastRefresh: string; markets?: Record<string, string> }> = {};

  // Stable position map for progress like (x/N) even under concurrency
  const total = items.length;
  const positionById = new Map<string, number>();
  items.forEach((e, idx) => positionById.set(e.id, idx + 1));

  const runOne = async (it: { id: string; markets: import("../../scripts/unified-crawler/shared/types").MarketCode[]; mode: "full" | "reviews-only" }) => {
      // Time budget check at execution start
      if (Date.now() > deadline) {
        skippedDueToTime++;
        return;
      }
      const t1 = Date.now();
      try {
        const res = await processSingleItem(
          it.id,
          it.markets as import("../../scripts/unified-crawler/shared/types").MarketCode[],
          { client: wl.client, logPrefix: "[crawler:items]", mode: it.mode, indexLua: wl.idLua.get(it.id) || undefined, sharesAgg, forceShare: refreshShare }
        );
        const ms = Date.now() - t1;
        totalMs += ms;
        processed++;
        if (res?.ok) {
          ok++;
          // Collect aggregate updates
          if (res.shareLink) {
            shareUpdates[it.id] = res.shareLink;
          }
          if (res.shipSummaryByMarket) {
            for (const [mkt, summary] of Object.entries(res.shipSummaryByMarket)) {
              if (!shipUpdatesByMarket[mkt]) shipUpdatesByMarket[mkt] = {};
              shipUpdatesByMarket[mkt][it.id] = summary as any;
            }
          }
          if (res.shippingMetaUpdate) {
            shippingMetaUpdates[it.id] = res.shippingMetaUpdate;
          }
        } else {
          fail++;
        }
  const pos = positionById.get(it.id) || processed;
  console.log(`[crawler:items:time] (${pos}/${total}) id=${it.id} dur=${ms}ms ${(ms / 1000).toFixed(2)}s ok=${res?.ok ? 1 : 0}`);
        if (processed % progressEvery === 0) {
          const avg = processed ? Math.round(totalMs / processed) : 0;
          log(`progress ${processed}/${items.length} ok=${ok} fail=${fail} avg=${avg}ms/item elapsed=${since(started)}s`);
        }
      } catch (e: any) {
        const ms = Date.now() - t1;
        totalMs += ms;
        processed++;
        fail++;
  const pos = positionById.get(it.id) || processed;
  err(`[crawler:items:time] (${pos}/${total}) id=${it.id} error dur=${ms}ms ${e?.message || e}`);
      }
    };

    for (const it of items) q.add(() => runOne(it));
    await q.onIdle();

    const avg = processed ? Math.round(totalMs / processed) : 0;
    log(`done processed=${processed}/${items.length} ok=${ok} fail=${fail} skippedDueToTime=${skippedDueToTime} avg=${avg}ms/item total=${since(started)}s`);

    // Write aggregates once per run (best-effort)
    try {
      // Shared shares aggregate
      const sharedBlob = getBlobClient(env.stores.shared);
      const sharesKey = Keys.shared.aggregates.shares();
      const existingShares = ((await sharedBlob.getJSON<any>(sharesKey)) || {}) as Record<string, string>;
      let sharesChanged = false;
      for (const [id, link] of Object.entries(shareUpdates)) {
        if (typeof link !== "string" || !link) continue;
        if (existingShares[id] !== link) {
          existingShares[id] = link;
          sharesChanged = true;
        }
      }
      if (sharesChanged) {
        await sharedBlob.putJSON(sharesKey, existingShares);
        log(`aggregates: wrote shares (${Object.keys(shareUpdates).length} updates, total ${Object.keys(existingShares).length})`);
      } else {
        log(`aggregates: shares unchanged (${Object.keys(shareUpdates).length} candidates)`);
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
          log(`aggregates: wrote shipSummary for ${mkt} (${Object.keys(updates).length} updates, total ${Object.keys(existing).length})`);
        } else {
          log(`aggregates: shipSummary unchanged for ${mkt} (${Object.keys(updates).length} candidates)`);
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
          log(`aggregates: wrote shippingMeta (${Object.keys(shippingMetaUpdates).length} updates, total ${Object.keys(existingMeta).length})`);
        } else {
          log(`aggregates: shippingMeta unchanged (${Object.keys(shippingMetaUpdates).length} candidates)`);
        }
      }
    } catch (e: any) {
      warn(`aggregates write failed: ${e?.message || e}`);
    }

    // Best-effort run-meta snapshot per first market
    try {
      const first = markets[0] as any;
      const key = Keys.runMeta.market(first);
      const storeName = marketStore(first, env.stores as any);
      await appendRunMeta(storeName, key, {
        scope: `items:${first}`,
        counts: { processed, planned: items.length, ok, fail, avgMs: processed ? Math.round(totalMs / processed) : 0 },
      });
    } catch {}
    return { statusCode: 200, body: JSON.stringify({ ok: true, processed, planned: items.length, okCount: ok, failCount: fail }) } as any;
  } catch (e: any) {
    err(`fatal ${e?.stack || e?.message || String(e)}`);
    return { statusCode: 500, body: "error" } as any;
  }
};

export default handler;
