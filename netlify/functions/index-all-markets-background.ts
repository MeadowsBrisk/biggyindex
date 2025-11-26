// Lightweight background function that ONLY runs indexing for all markets
// This replaces the 5 separate market indexer schedules with a single unified one
// Does NOT run items/sellers/pruning stages - those have their own schedules

import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets, marketStore } from "../../scripts/unified-crawler/shared/env/markets";
import { indexMarket } from "../../scripts/unified-crawler/indexer/indexMarket";
import { appendRunMeta } from "../../scripts/unified-crawler/shared/persistence/runMeta";
import { Keys } from "../../scripts/unified-crawler/shared/persistence/keys";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async (event) => {
  const started = Date.now();
  const log = (m: string) => console.log(`[index-all-markets] ${m}`);
  const warn = (m: string) => console.warn(`[index-all-markets] ${m}`);
  const errlog = (m: string) => console.error(`[index-all-markets] ${m}`);

  try {
    log("start");

    // Ensure persistence defaults for Netlify runtime
    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "blobs";

    const env = loadEnv();
    const markets = listMarkets(env.markets); // e.g., ["GB","DE","FR","IT","PT"]

    log(`indexing ${markets.length} markets: ${markets.join(", ")}`);

    let totalIndexed = 0;
    const results: Array<{ market: string; items: number; elapsed: number; error?: string }> = [];

    for (const code of markets) {
      const t0 = Date.now();
      log(`[${code}] start`);
      
      try {
        const res: any = await indexMarket(code as any);
        const itemCount = Number(res?.counts?.items || 0);
        totalIndexed += itemCount;
        const elapsed = since(t0);
        
        log(`[${code}] done items=${itemCount} elapsed=${elapsed}s`);
        results.push({ market: code, items: itemCount, elapsed });

        // Append run meta (best-effort)
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
        const elapsed = since(t0);
        errlog(`[${code}] error: ${e?.message || e}`);
        results.push({ market: code, items: 0, elapsed, error: e?.message || String(e) });
      }
    }

    const totalElapsed = since(started);
    log(`done total=${totalElapsed}s totalItems=${totalIndexed}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        ok: true, 
        totalItems: totalIndexed,
        elapsed: totalElapsed,
        markets: results 
      }),
    } as any;
  } catch (e: any) {
    errlog(`fatal: ${e?.stack || e?.message || String(e)}`);
    return { statusCode: 500, body: "error" } as any;
  }
};

export default handler;
