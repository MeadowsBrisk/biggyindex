// Netlify background function: Unified Items stage (every 4 hours)
// Builds a deduped worklist across markets, then processes items within a time budget.
// Handles full vs reviews-only modes; full mode may switch location filter per market for shipping.
import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets } from "../../scripts/unified-crawler/shared/env/markets";
import { buildItemsWorklist } from "../../scripts/unified-crawler/stages/items/run";
import { processSingleItem } from "../../scripts/unified-crawler/stages/items/processItem";
import { detectItemChanges } from "../../scripts/unified-crawler/shared/logic/changes";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async (event) => {
  const started = Date.now();
  const log = (m: string) => console.log(`[crawler:items] ${m}`);
  const warn = (m: string) => console.warn(`[crawler:items] ${m}`);
  const err = (m: string) => console.error(`[crawler:items] ${m}`);

  try {
    // Guard: allow disabling via env; override with ?force=1
    const force = event?.queryStringParameters?.force === "1" || event?.queryStringParameters?.force === "true";
    if (!force && process.env.CRAWLER_UNIFIED_ITEMS !== "1") {
      warn("disabled via CRAWLER_UNIFIED_ITEMS != 1; skipping");
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) } as any;
    }

    // Safety defaults for Netlify env
    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "blobs";

    if (!process.env.LB_LOGIN_USERNAME || !process.env.LB_LOGIN_PASSWORD) {
      warn("missing LB credentials; items stage requires auth");
    }

    const env = loadEnv();
    const markets = listMarkets(env.markets);

    log(`start markets=${markets.join(',')}`);

    // Build unified worklist
    const wl = await buildItemsWorklist(markets as any);
    log(`worklist unique=${wl.uniqueIds.length} toCrawl=${wl.toCrawl.length} already=${wl.alreadyHave.length} sample=${wl.sample.length}`);

    // Change detection: decide full vs reviews-only
    const allItems = wl.uniqueIds.map((id) => ({ id }));
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

    // If empty, fall back to a small round-robin sample
    if (!plan.length) {
      for (const s of wl.sample) plan.push({ id: s.id, markets: [s.market], mode: "reviews-only" });
    }

    // Respect CRAWLER_ITEMS_SAMPLE cap for safety
    const limit = Math.max(0, Math.min(env.itemsSampleLimit || 10, plan.length));
    const items = plan.slice(0, limit);

    let processed = 0;
    for (const it of items) {
      if (Date.now() > deadline) {
        warn(`time budget reached; stopping at ${processed}/${items.length}`);
        break;
      }
      try {
        await processSingleItem(
          it.id,
          it.markets as import("../../scripts/unified-crawler/shared/types").MarketCode[],
          { client: wl.client, logPrefix: "[crawler:items]", mode: it.mode }
        );
        processed++;
        if (processed % 5 === 0) {
          log(`progress ${processed}/${items.length} elapsed=${since(started)}s`);
        }
      } catch (e: any) {
        err(`item error id=${it.id}: ${e?.message || e}`);
      }
    }

    log(`done processed=${processed}/${items.length} total=${since(started)}s`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, processed, planned: items.length }) } as any;
  } catch (e: any) {
    err(`fatal ${e?.stack || e?.message || String(e)}`);
    return { statusCode: 500, body: "error" } as any;
  }
};

export default handler;
