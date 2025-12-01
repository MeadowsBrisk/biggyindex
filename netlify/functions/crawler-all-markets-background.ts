// Netlify background orchestrator for the Unified Crawler
// Runs stages sequentially: Index → Items (worklist build for now) → Sellers (TODO) → Pruning (TODO)
// Scheduling is configured in netlify.toml. File name suffix "-background" ensures background execution.

import type { Handler } from "@netlify/functions";

// Keep imports lean; rely on shared stage modules we've already built
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets } from "../../scripts/unified-crawler/shared/env/markets";
import { appendRunMeta } from "../../scripts/unified-crawler/shared/persistence/runMeta";
import { Keys } from "../../scripts/unified-crawler/shared/persistence/keys";
import { marketStore } from "../../scripts/unified-crawler/shared/env/markets";
import { tryRevalidateAllMarkets } from "../../scripts/unified-crawler/shared/revalidation/revalidate";

// Index stage (wrapper delegates to stage implementation)
// Prefer wrapper if present to preserve existing behavior
import { indexMarket } from "../../scripts/unified-crawler/indexer/indexMarket";

// Items stage (for now: build worklist and log; full per-item processing will be wired next)
import { buildItemsWorklist } from "../../scripts/unified-crawler/stages/items/run";
import { processSingleItem } from "../../scripts/unified-crawler/stages/items/processItem";
import { detectItemChanges } from "../../scripts/unified-crawler/shared/logic/changes";
import { runSellers } from "../../scripts/unified-crawler/stages/sellers/run";
import { runPruning } from "../../scripts/unified-crawler/stages/pruning/run";

// Tiny timer util
const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async (event) => {
  const started = Date.now();
  const logPrefix = (stage: string, market?: string) =>
    `[crawler:${stage}${market ? ":" + market : ""}]`;

  try {
    console.log(`${logPrefix("orchestrator")} start`);

    // Hard safety: require credentials in env for authenticated stages
    if (!process.env.LB_LOGIN_USERNAME || !process.env.LB_LOGIN_PASSWORD) {
      console.warn(`${logPrefix("orchestrator")} missing credentials; index-only run`);
    }

    // Ensure persistence defaults for Netlify runtime
    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "blobs";

  const env = loadEnv();
  const markets = listMarkets(env.markets); // e.g., ["GB","DE","FR"]

    // Stage 1: Index (sequential across markets)
    const tIndex = Date.now();
    let totalIndexed = 0;
    for (const code of markets) {
      const t0 = Date.now();
      console.log(`${logPrefix("index", code)} start`);
      try {
        const res: any = await indexMarket(code as any);
        totalIndexed += Number(res?.counts?.items || 0);
        console.log(
          `${logPrefix("index", code)} done items=${res?.counts?.items ?? 0} elapsed=${since(t0)}s`
        );
        // Append per-market run meta (best-effort)
        try {
          const storeName = marketStore(code as any, env.stores as any);
          const key = Keys.runMeta.market(code as any);
          await appendRunMeta(storeName, key, {
            scope: `index:${code}`,
            counts: res?.counts || {},
            notes: { snapshotMeta: res?.snapshotMeta },
          });
        } catch {}
      } catch (e: any) {
        console.error(`${logPrefix("index", code)} error:`, e?.message || e);
      }
    }
    console.log(`${logPrefix("index")} all-markets elapsed=${since(tIndex)}s totalItems=${totalIndexed}`);

    // Stage 2: Items (worklist build; processing to be wired next)
    const tItems = Date.now();
    try {
      console.log(`${logPrefix("items")} worklist start`);
      const wl = await buildItemsWorklist(markets as any);
      console.log(
        `${logPrefix("items")} worklist unique=${wl.uniqueIds.length} toCrawl=${wl.toCrawl.length} already=${wl.alreadyHave.length}`
      );

      // Change detection: decide full vs reviews-only
      const allItems = wl.uniqueIds.map((id) => ({ id }));
      const changeRes = await detectItemChanges(
        { market: markets[0] as any, items: allItems },
        { sharedStoreName: env.stores.shared }
      );
      const fullSet = new Set(changeRes.fullCrawlIds);

      // Plan processing within time budget
      const maxMs = Math.min(env.maxRuntimeMs, 14 * 60 * 1000); // stay under 15m background cap
      const deadline = Date.now() + Math.max(10_000, maxMs - 30_000); // leave ~30s buffer
      // Prefer full-crawl targets first
      const fullTargets = wl.uniqueIds
        .filter((id) => fullSet.has(id))
        .map((id) => ({ id, markets: wl.presenceMap.get(id) ? (Array.from(wl.presenceMap.get(id) as any) as string[]) : ([] as string[]) }));
      const reviewsOnlyTargets = wl.uniqueIds
        .filter((id) => !fullSet.has(id))
        .map((id) => ({ id, markets: wl.presenceMap.get(id) ? (Array.from(wl.presenceMap.get(id) as any) as string[]) : ([] as string[]) }));
      const plan: Array<{ id: string; markets: string[]; mode: "full" | "reviews-only" }> = [];
      for (const it of fullTargets) plan.push({ ...it, mode: "full" });
      for (const it of reviewsOnlyTargets) plan.push({ ...it, mode: "reviews-only" });
      // No sample fallback or env-based cap; process full plan within time budget
      const items = plan;

      let processed = 0;
      for (const it of items) {
        if (Date.now() > deadline) {
          console.warn(`${logPrefix("items")} time budget reached; stopping at ${processed}/${items.length}`);
          break;
        }
        try {
          const res = await processSingleItem(
            it.id,
            (it as any).markets || (wl.presenceMap.get(it.id) ? Array.from(wl.presenceMap.get(it.id) as any) : []),
            { client: wl.client, logPrefix: logPrefix("items"), mode: it.mode }
          );
          processed++;
          if (processed % 5 === 0) {
            console.log(`${logPrefix("items")} progress ${processed}/${items.length} elapsed=${since(tItems)}s`);
          }
        } catch (e: any) {
          console.error(`${logPrefix("items")} item error id=${it.id}:`, e?.message || e);
        }
      }
  console.log(`${logPrefix("items")} processed=${processed}/${items.length}`);
    } catch (e: any) {
      console.error(`${logPrefix("items")} worklist error:`, e?.message || e);
    }
    console.log(`${logPrefix("items")} elapsed=${since(tItems)}s`);

    // Stage 3: Sellers (stubbed)
    const tSellers = Date.now();
    try {
      console.log(`${logPrefix("sellers")} start`);
      await runSellers(markets as any);
    } catch (e: any) {
      console.error(`${logPrefix("sellers")} error:`, e?.message || e);
    }
    console.log(`${logPrefix("sellers")} elapsed=${since(tSellers)}s`);

    // Stage 4: Pruning (stubbed)
    const tPrune = Date.now();
    try {
      console.log(`${logPrefix("pruning")} start`);
      await runPruning();
    } catch (e: any) {
      console.error(`${logPrefix("pruning")} error:`, e?.message || e);
    }
    console.log(`${logPrefix("pruning")} elapsed=${since(tPrune)}s`);

    // Trigger on-demand ISR revalidation for all markets after successful pipeline completion
    console.log(`${logPrefix("revalidate")} start`);
    const tRevalidate = Date.now();
    await tryRevalidateAllMarkets();
    console.log(`${logPrefix("revalidate")} elapsed=${since(tRevalidate)}s`);

    console.log(`${logPrefix("orchestrator")} done total=${since(started)}s`);
    // Background functions ignore returned body; return to end execution
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, seconds: since(started) }),
    } as any;
  } catch (e: any) {
    console.error(`[crawler] fatal:`, e?.stack || e?.message || String(e));
    return { statusCode: 500, body: "error" } as any;
  }
};

export default handler;
