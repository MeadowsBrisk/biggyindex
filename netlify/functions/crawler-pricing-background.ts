// Netlify background function: Pricing stage
// Generates price-per-gram aggregates for Flower, Hash, and Concentrates
// Runs after the images function (which runs at 5:30 AM UTC)
// Schedule: 5:45 AM UTC daily
import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets } from "../../scripts/unified-crawler/shared/env/markets";
import { runPricing } from "../../scripts/unified-crawler/stages/pricing/run";

import { since } from "../../scripts/unified-crawler/shared/timing";
import { createFnLogger } from "../../scripts/unified-crawler/shared/fnLogger";

export const handler: Handler = async (event) => {
  const started = Date.now();
  const { log, error: err } = createFnLogger('crawler:pricing');

  try {
    // Safety defaults for Netlify env
    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "blobs";

    const env = loadEnv();
    const markets = listMarkets(env.markets);

    log(`start markets=${markets.join(',')}`);

    await runPricing(markets as any);

    const elapsed = since(started);
    log(`done in ${elapsed}s`);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, elapsed }),
    };
  } catch (e) {
    err(`fatal: ${e instanceof Error ? e.message : String(e)}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    };
  }
};
