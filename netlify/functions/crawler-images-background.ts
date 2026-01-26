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
import { listMarkets, marketStore } from "../../scripts/unified-crawler/shared/env/markets";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { getBlobClient } from "../../scripts/unified-crawler/shared/persistence/blobs";
import { Keys } from "../../scripts/unified-crawler/shared/persistence/keys";

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

    // Load markets and gather image URLs
    const markets = listMarkets(env.markets);
    log(`gathering images from markets=${markets.join(",")}`);

    // Gather all image URLs from all markets (same as CLI)
    const imageUrls: string[] = [];
    for (const m of markets) {
      const storeName = marketStore(m, env.stores as any);
      const blob = getBlobClient(storeName);
      const items = await blob.getJSON<any[]>(Keys.market.index(m)) || [];
      for (const item of items) {
        // Main image (minified key: i)
        const mainImg = item.i || item.imageUrl;
        if (mainImg && typeof mainImg === 'string') {
          imageUrls.push(mainImg);
        }
        // Gallery images (minified key: is)
        const gallery = item.is || item.imageUrls;
        if (Array.isArray(gallery)) {
          for (const img of gallery) {
            if (img && typeof img === 'string') {
              imageUrls.push(img);
            }
          }
        }
      }
    }

    // Deduplicate URLs
    const uniqueUrls = [...new Set(imageUrls)];
    log(`discovered images total=${imageUrls.length} unique=${uniqueUrls.length}`);

    const { stats } = await processImages(uniqueUrls, {
      concurrency: 10,
      force,
      sharedBlob,
    });

    log(`complete processed=${stats.processed} cached=${stats.cached} failed=${stats.failed} gifs=${stats.gifs} sizeMB=${(stats.totalSizeBytes / 1024 / 1024).toFixed(1)} elapsed=${since(started)}s`);

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
