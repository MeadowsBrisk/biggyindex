// Netlify background function: Pricing stage
// Generates price-per-gram aggregates for Flower, Hash, and Concentrates
// Runs after the images function (which runs at 5:30 AM UTC)
// Schedule: 5:45 AM UTC daily
import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets } from "../../scripts/unified-crawler/shared/env/markets";
import { processPricingForMarket } from "../../scripts/unified-crawler/stages/pricing/run";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async (event) => {
  const started = Date.now();
  const log = (m: string) => console.log(`[crawler:pricing] ${m}`);
  const warn = (m: string) => console.warn(`[crawler:pricing] ${m}`);
  const err = (m: string) => console.error(`[crawler:pricing] ${m}`);

  try {
    // Safety defaults for Netlify env
    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "blobs";

    const env = loadEnv();
    const markets = listMarkets(env.markets);

    log(`start markets=${markets.join(',')}`);

    const results: Record<string, { itemCount: number; weightCounts: Record<number, number> }> = {};

    // Process each market
    for (const market of markets) {
      try {
        log(`processing ${market}`);
        const result = await processPricingForMarket(market as any);
        results[market] = result;
        log(`completed ${market}: ${result.itemCount} items, weights=${JSON.stringify(result.weightCounts)}`);
      } catch (e) {
        err(`failed ${market}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const elapsed = since(started);
    log(`done in ${elapsed}s`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        elapsed,
        results,
      }),
    };
  } catch (e) {
    err(`fatal: ${e instanceof Error ? e.message : String(e)}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    };
  }
};
