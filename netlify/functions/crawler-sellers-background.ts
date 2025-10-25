// Netlify background function: Unified Sellers stage (every 4 hours, offset)
// Currently calls the sellers stage stub; will run analytics and persistence when implemented.
import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets } from "../../scripts/unified-crawler/shared/env/markets";
import { runSellers } from "../../scripts/unified-crawler/stages/sellers/run";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async (event) => {
  const started = Date.now();
  const log = (m: string) => console.log(`[crawler:sellers] ${m}`);
  const err = (m: string) => console.error(`[crawler:sellers] ${m}`);

  try {
    // Guard: allow disabling via env; override with ?force=1
    const force = event?.queryStringParameters?.force === "1" || event?.queryStringParameters?.force === "true";
    if (!force && process.env.CRAWLER_UNIFIED_SELLERS !== "1") {
      log("disabled via CRAWLER_UNIFIED_SELLERS != 1; skipping");
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) } as any;
    }

    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "blobs";

    const env = loadEnv();
    const markets = listMarkets(env.markets);

    log(`start markets=${markets.join(',')}`);

    const res = await runSellers(markets as any);
    log(`done ok=${res.ok} total=${since(started)}s`);

    return { statusCode: 200, body: JSON.stringify({ ok: res.ok }) } as any;
  } catch (e: any) {
    err(`fatal ${e?.stack || e?.message || String(e)}`);
    return { statusCode: 500, body: "error" } as any;
  }
};

export default handler;
