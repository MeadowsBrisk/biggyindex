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

import { since } from "../../scripts/unified-crawler/shared/timing";
import { createFnLogger } from "../../scripts/unified-crawler/shared/fnLogger";
const { log } = createFnLogger('crawler:images');

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
    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "r2";

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

    // Import image meta helpers
    const {
      loadImageMeta,
      saveImageMeta,
      getItemsNeedingImageUpdate,
      updateItemImageMeta,
      getStaleHashes
    } = await import("../../scripts/unified-crawler/stages/images/imageMeta");

    // Also need deleteImageFolder for stale cleanup
    const { hashUrl, deleteImageFolder } = await import("../../scripts/unified-crawler/stages/images/optimizer");

    // Load image metadata
    const imageMeta = force ? {} : await loadImageMeta(sharedBlob);
    log(`loaded image metadata itemsTracked=${Object.keys(imageMeta).length}`);

    // Gather all items with their image URLs from all markets
    // Use minified keys: id->id, lua->lastUpdatedAt, i->imageUrl, is->imageUrls
    type IndexItem = { id: string; lua?: string; i?: string; imageUrl?: string; is?: string[]; imageUrls?: string[] };
    const allItems: IndexItem[] = [];
    const seenIds = new Set<string>();

    for (const m of markets) {
      const storeName = marketStore(m, env.stores as any);
      const blob = getBlobClient(storeName);
      const items = await blob.getJSON<IndexItem[]>(Keys.market.index(m)) || [];
      for (const item of items) {
        if (!item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        allItems.push(item);
      }
    }

    // Normalize items to consistent format
    const normalizedItems = allItems.map(item => ({
      id: item.id,
      lua: item.lua,
      imageUrl: item.i || item.imageUrl,
      imageUrls: item.is || item.imageUrls || [],
    }));

    // Determine which items need processing
    let itemsToProcess = force
      ? normalizedItems.map(item => ({
        id: item.id,
        lua: item.lua || '',
        imageUrls: [item.imageUrl, ...(item.imageUrls || [])].filter(Boolean) as string[],
        existingHashes: imageMeta[item.id]?.hashes || [],
      }))
      : getItemsNeedingImageUpdate(normalizedItems, imageMeta);

    // Count statistics
    const totalImageUrls = normalizedItems.reduce((sum, item) => {
      return sum + (item.imageUrl ? 1 : 0) + (item.imageUrls?.length || 0);
    }, 0);
    const uniqueImageUrls = new Set(normalizedItems.flatMap(item =>
      [item.imageUrl, ...(item.imageUrls || [])].filter(Boolean)
    )).size;

    log(`discovered: items=${allItems.length} images=${totalImageUrls} (unique=${uniqueImageUrls}) itemsNeedingUpdate=${itemsToProcess.length} force=${force}`);

    if (itemsToProcess.length === 0) {
      log("no items need image updates");
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, stats: { processed: 0, cached: 0, failed: 0 }, seconds: since(started) })
      };
    }

    // Collect all image URLs
    const imageUrls: string[] = [];
    for (const item of itemsToProcess) {
      for (const url of item.imageUrls) {
        imageUrls.push(url);
      }
    }

    // Deduplicate URLs for processing
    const processingUrls = [...new Set(imageUrls)];

    const { stats } = await processImages(processingUrls, {
      concurrency: 10,
      force,
      sharedBlob,
    });

    // Cleanup stale images and update metadata
    let staleDeleted = 0;
    let updatedMeta = { ...imageMeta };

    for (const item of itemsToProcess) {
      const newHashes = item.imageUrls.map(url => hashUrl(url));

      // Delete stale images
      const staleHashes = getStaleHashes(item.existingHashes, newHashes);
      for (const hash of staleHashes) {
        const deleted = await deleteImageFolder(hash);
        if (deleted) staleDeleted++;
      }

      // Update metadata
      updatedMeta = updateItemImageMeta(updatedMeta, item.id, item.lua, newHashes);
    }

    if (staleDeleted > 0) log(`deleted stale images count=${staleDeleted}`);

    // Save updated metadata
    await saveImageMeta(sharedBlob, updatedMeta);
    log(`saved image metadata itemsTracked=${Object.keys(updatedMeta).length}`);

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
