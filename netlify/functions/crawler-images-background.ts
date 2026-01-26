/**
 * Netlify Background Function: Image Optimization
 * 
 * Runs daily to optimize new images and upload to Cloudflare R2.
 * Uses incremental mode by default (skips already-processed images).
 * 
 * Schedule: 5:30 AM UTC daily (after translate-background at 5:10)
 * Runtime: ~1-2 min incremental, ~9 min full reprocess
 * 
 * Manual trigger with force mode:
 *   curl -X POST https://biggyindex.com/.netlify/functions/crawler-images-background?force=1
 */

import type { Handler } from "@netlify/functions";
import { processImages } from "../../scripts/unified-crawler/stages/images/optimizer";
import { checkBudget, formatBudgetStatus } from "../../scripts/unified-crawler/stages/images/budget";
import { listMarkets } from "../../scripts/unified-crawler/shared/env/markets";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { getBlobClient } from "../../scripts/unified-crawler/shared/persistence/blobs";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);
const log = (msg: string) => console.log(`[crawler:images] ${msg}`);

export const handler: Handler = async (event) => {
  const started = Date.now();
  
  try {
    log("start");
    
    // Check if force mode requested via query param
    const force = event.queryStringParameters?.force === "1";
    if (force) {
      log("force mode enabled - will reprocess all images");
    }

    // Ensure persistence defaults for Netlify runtime
    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "blobs";

    // Validate R2 credentials
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) {
      log("error: missing R2 credentials");
      return { statusCode: 500, body: "Missing R2 credentials" };
    }

    // Load env and get blob client for budget check
    const env = loadEnv();
    const sharedBlob = getBlobClient(env.stores.shared);

    // Check budget before starting
    const budgetCheck = await checkBudget(sharedBlob);
    log(`budget ${formatBudgetStatus(budgetCheck.budget)}`);
    
    if (budgetCheck.budget.storageUsedMB >= 9500) {
      log("error: storage budget exhausted");
      return { statusCode: 429, body: "Storage budget exhausted" };
    }

    // Load markets and process images
    const markets = listMarkets(env.markets);
    log(`processing markets=${markets.join(",")}`);

    const stats = await processImages({
      markets: markets as any,
      force,
      concurrency: 10,
    });

    log(`complete processed=${stats.processed} cached=${stats.cached} failed=${stats.failed} gifs=${stats.gifs} sizeMB=${stats.totalSizeMB.toFixed(1)} elapsed=${since(started)}s`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        stats,
        seconds: since(started),
      }),
    };
  } catch (e: any) {
    log(`fatal: ${e?.stack || e?.message || String(e)}`);
    return { statusCode: 500, body: "error" };
  }
};

export default handler;
