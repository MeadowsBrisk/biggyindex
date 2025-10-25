// Netlify scheduled function: Unified Index (every 15 minutes)
// Regular function (not background) since indexing is fast. Toggle with CRAWLER_UNIFIED_INDEX.
import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets, marketStore } from "../../scripts/unified-crawler/shared/env/markets";
import { indexMarket } from "../../scripts/unified-crawler/indexer/indexMarket";
import { Keys } from "../../scripts/unified-crawler/shared/persistence/keys";
import { appendRunMeta } from "../../scripts/unified-crawler/shared/persistence/runMeta";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async () => {
  const started = Date.now();
  const log = (m: string) => console.log(`[crawler:index] ${m}`);
  const warn = (m: string) => console.warn(`[crawler:index] ${m}`);
  const errlog = (m: string) => console.error(`[crawler:index] ${m}`);

  try {
    if (process.env.CRAWLER_UNIFIED_INDEX !== "1") {
      warn("disabled via CRAWLER_UNIFIED_INDEX != 1; skipping");
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) } as any;
    }

    const env = loadEnv();
    const markets = listMarkets(env.markets);
    let total = 0;

    for (const code of markets) {
      const t0 = Date.now();
      log(`start market=${code}`);
      try {
        const res: any = await indexMarket(code as any);
        total += Number(res?.counts?.items || 0);
        log(`done market=${code} items=${res?.counts?.items ?? 0} elapsed=${since(t0)}s`);
        // run-meta best-effort
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
        errlog(`error market=${code} ${e?.message || e}`);
      }
    }

    log(`all markets done totalItems=${total} total=${since(started)}s`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, totalItems: total }) } as any;
  } catch (e: any) {
    errlog(`fatal ${e?.stack || e?.message || String(e)}`);
    return { statusCode: 500, body: "error" } as any;
  }
};

export default handler;
