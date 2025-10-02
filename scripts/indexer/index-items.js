/*
  Node.js data indexing script for littlebiggy items.
  - Fetches items from the public API
  - Normalizes and categorizes items
  - Writes public/indexed_items.json and public/sellers.json
*/

// Load local env (only if NETLIFY_* vars absent)
require('./lib/env/loadEnv').loadIndexerEnv();

const fs = require("fs");
const path = require("path");
const { runCategorizationPipeline } = require('./lib/categorize/pipeline');

// Toggle console logging of exclusions (tips/custom). Leave false to silence logs easily.
const LOG_EXCLUDED_TIPS = false;
const LOG_EXCLUDED_CUSTOM = false;

const ENDPOINTS = [
  process.env.LB_ENDPOINT,
  // API endpoints first
  "https://littlebiggy.net/core/api/items-wall/?shipsTo=GB",
  "https://www.littlebiggy.net/core/api/items-wall/?shipsTo=GB",
].filter(Boolean);

// Writable output handling: Netlify function bundle is read-only, so use /tmp
const IS_FUNCTION = !!process.env.INDEX_TRIGGER;
const RUNTIME_WRITABLE_ROOT = IS_FUNCTION ? (process.env.TMPDIR || '/tmp') : process.cwd();
const OUTPUT_DIR = path.join(RUNTIME_WRITABLE_ROOT, 'public');
const ITEMS_OUTPUT = path.join(OUTPUT_DIR, 'indexed_items.json');
const SELLERS_OUTPUT = path.join(OUTPUT_DIR, 'sellers.json');

// Listing / aggregation helpers extracted for clarity
const { isTipListing, isCustomListing } = require('./lib/exclusions/listingExclusions');
const { embedAggregatedCrawlerData } = require('./lib/aggregation/embedAggregates');

// Escape a string for use in RegExp (kept here if needed by future local logic)
function escapeRegExp(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function categorizeItemWithSub(name, description) {
  // Phase 2 Step 10: Delegated to pipeline orchestrator (behaviour parity)
  return runCategorizationPipeline(name, description);
}

// Helpers extracted
const { getImageUrl, getImageUrls } = require('./lib/media/images');
const { normalizeVariants, buildSignature } = require('./pricing/variants');
const { buildItemUrl, buildSellerUrl } = require('./util/urls');
const { buildSellers } = require('./aggregation/buildSellers');
const { buildAndWriteManifest } = require('./persistence/writeManifest');
const { buildRecentItemsCompact } = require('./aggregation/buildRecentItemsCompact');
const { buildItemImageLookup } = require('./aggregation/buildItemImageLookup');

// Normalize a country name/value into a 2-letter lowercase code (best-effort).
// (country normalization removed; we now store source-provided shipsFrom text)

// (Removed local buildItemUrl/buildSellerUrl/getBlobsStore – now sourced from helper modules)

async function main() {
  try {
  const { loadSeen } = require('./persistence/seenStore');
  const { seen: loadedSeen, store, scriptsDataDir, seenPath, loadedFromBlob, baselineSeeding, merged, persistMode, preferBlobPersist } = await loadSeen({ IS_FUNCTION, RUNTIME_WRITABLE_ROOT });
  let seen = loadedSeen;

  // Fetch items (extracted helper)
  const { fetchItemsFromEndpoints } = require('./fetch/fetchItems');
  const { items, sellerReviewSummaries, itemReviewSummaries } = await fetchItemsFromEndpoints(ENDPOINTS);

  const nowIso = new Date().toISOString();
    // Collect listings excluded as tips/custom for optional visibility in local logs
    const excludedTipItems = [];
    const excludedCustomItems = [];
    
    const processedItems = items.map((item) => {
      const id = item.id ?? item.refNum ?? String(Math.random()).slice(2);
      const refNum = item.refNum || null;
      const hadExisting = !!seen[id];
      if (!hadExisting) {
        // brand new id: stamp firstSeenAt now (matches prior behavior)
        seen[id] = { firstSeenAt: nowIso, lastUpdatedAt: null, sig: null };
      }
      const name = item.name ?? "";
      const description = item.description ?? "";
      // Exclude tip-jar style listings from the dataset entirely (optionally log)
      if (isTipListing(name, description)) { excludedTipItems.push({ id, name }); return null; }
      // Exclude custom-order/listing utility entries (optionally log)
      if (isCustomListing(name, description)) { excludedCustomItems.push({ id, name }); return null; }
      const sellerId = item?.seller?.id ?? item?.sellerId ?? null;
      const sellerName = item?.seller?.name ?? "";
      const sellerOnline = item?.seller?.online || null; // new: online status string (e.g. 'today')
      const sellerUrl = buildSellerUrl(sellerName, sellerId);
      const url = buildItemUrl(item);
      const imageUrls = getImageUrls(item.images);
      const imageUrl = imageUrls[0] || getImageUrl(item.images);
      const { primary: category, subcategories } = categorizeItemWithSub(name, description);
      const hotness = item?.hotness ?? null;
      const shipsFrom = (typeof item?.shipsFrom === 'string') ? item.shipsFrom : ((typeof item?.ships_from === 'string') ? item.ships_from : null);
  // Variants normalization
  const { variants, publicVariants: variantsOut, priceMin, priceMax } = normalizeVariants(item?.varieties);
      const ir = itemReviewSummaries?.[String(id)];
      const reviewStats = ir
        ? {
            averageRating: ir.averageRating ?? null,
            averageDaysToArrive: ir.averageDaysToArrive ?? null,
            numberOfReviews: ir.numberOfReviews ?? null,
          }
        : null;
      // Compute signature to detect changes
      const sig = buildSignature(item, variants);
      let lastUpdatedAt = seen[id]?.lastUpdatedAt || null;
      if (seen[id]?.sig) {
        if (seen[id].sig !== sig) {
          // Only mark update if this is not the initial baseline seeding from repo to empty blob
          if (!(baselineSeeding && hadExisting && !loadedFromBlob)) {
            lastUpdatedAt = new Date().toISOString();
          }
        }
      }
  // Preserve existing firstSeenAt or default to now if undefined (matches prior behavior)
  seen[id] = { firstSeenAt: (seen[id] && seen[id].firstSeenAt) ? seen[id].firstSeenAt : nowIso, lastUpdatedAt, sig };
      return { id, refNum, name, description, sellerId: item?.seller?.id ?? item?.sellerId ?? null, sellerName: item?.seller?.name ?? '', sellerUrl: buildSellerUrl(item?.seller?.name ?? '', item?.seller?.id ?? item?.sellerId ?? null), sellerOnline: item?.seller?.online || null, url: buildItemUrl(item), imageUrl: (getImageUrls(item.images)[0] || getImageUrl(item.images)), imageUrls: getImageUrls(item.images), category, subcategories, shipsFrom, priceMin, priceMax, variants: variantsOut, reviewStats: (itemReviewSummaries?.[String(id)] ? { averageRating: itemReviewSummaries[String(id)].averageRating ?? null, averageDaysToArrive: itemReviewSummaries[String(id)].averageDaysToArrive ?? null, numberOfReviews: itemReviewSummaries[String(id)].numberOfReviews ?? null } : null), hotness, firstSeenAt: seen[id].firstSeenAt, lastUpdatedAt };
    }).filter(Boolean);

  // Inject aggregated crawler data (share + shipping price range) if available (extracted helper)
  await embedAggregatedCrawlerData(processedItems);

    // Optional exclusion logs (toggle via constants at top)
    if (LOG_EXCLUDED_TIPS && excludedTipItems.length > 0) {
      try {
        console.log('[exclude][tips] Excluded', excludedTipItems.length, 'utility/tip listings:');
        for (const it of excludedTipItems) console.log(' -', it.id, '|', (it.name || '').slice(0, 140));
      } catch {}
    }
    if (LOG_EXCLUDED_CUSTOM && excludedCustomItems.length > 0) {
      try {
        console.log('[exclude][custom] Excluded', excludedCustomItems.length, 'custom order/listing utilities:');
        for (const it of excludedCustomItems) console.log(' -', it.id, '|', (it.name || '').slice(0, 140));
      } catch {}
    }

    // Optional: load endorsement counts from Neon DB and embed snapshot for frontend seeding
    if (process.env.NETLIFY_DATABASE_URL) {
      try {
        const { neon } = await import('@netlify/neon');
        const sql = neon();
        // Only query counters for IDs we actually have (avoid full table scan)
        const idList = processedItems.map(it => String(it.id));
        if (idList.length) {
          const rows = await sql`SELECT item_id, count FROM votes_counters WHERE item_id = ANY(${idList})`;
          const map = new Map();
          for (const r of rows) map.set(String(r.item_id), Number(r.count) || 0);
          for (const it of processedItems) {
            if (map.has(String(it.id))) it.endorsementCount = map.get(String(it.id));
          }
          console.log('[endorsements] Embedded snapshot counts for', map.size, 'items');
        }
      } catch (e) {
        console.warn('[endorsements] Failed to embed counts:', e.message);
      }
    }

    // Ensure endorsementCount key exists for all items (default 0) so client can seed votes without extra fetch.
    for (const it of processedItems) {
      if (typeof it.endorsementCount !== 'number') it.endorsementCount = 0;
    }

  const sellers = buildSellers(processedItems, sellerReviewSummaries);

  const { manifest, byCategory } = buildAndWriteManifest({ processedItems, OUTPUT_DIR });

  // Build compact recent items aggregate and full image lookup using modular builders
  const recentItemsCompact = buildRecentItemsCompact(processedItems, 25);
  const imageLookup = buildItemImageLookup(processedItems);

    try { if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true }); } catch {}
    try { fs.writeFileSync(ITEMS_OUTPUT, JSON.stringify(processedItems, null, 2), "utf8"); } catch (e) { console.warn('Could not write indexed_items.json:', e.message); }
    // FS fallback for recent items aggregate
    try {
      const dir = path.join(OUTPUT_DIR, 'data');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'recent-items.json'), JSON.stringify(recentItemsCompact, null, 2), 'utf8');
      // FS fallback for item image lookup map
      fs.writeFileSync(path.join(dir, 'item-image-lookup.json'), JSON.stringify(imageLookup, null, 2), 'utf8');
    } catch (e) { console.warn('Could not write data/recent-items.json or item-image-lookup.json:', e.message); }
    // New: write snapshot meta (used for ETag/Last-Modified in API)
    const snapshotMeta = { updatedAt: new Date().toISOString(), itemsCount: processedItems.length, version: Date.now().toString(36) };
    try { fs.writeFileSync(path.join(OUTPUT_DIR, 'snapshot_meta.json'), JSON.stringify(snapshotMeta, null, 2), 'utf8'); } catch (e) { console.warn('Could not write snapshot_meta.json:', e.message); }
    try {
      if (IS_FUNCTION || preferBlobPersist) {
        // Skip local FS write; persist to Netlify Blobs below
        if (IS_FUNCTION) {
          console.log('[seen] Skipping local seen.json write (read-only FS); persisting to Netlify Blobs');
        } else if (preferBlobPersist) {
          console.log('[seen] Skipping local seen.json write (persistMode=blobs)');
        }
      } else {
        if (!fs.existsSync(scriptsDataDir)) fs.mkdirSync(scriptsDataDir, { recursive: true });
        fs.writeFileSync(seenPath, JSON.stringify(seen, null, 2), 'utf8');
      }
    } catch (e) {
      console.warn('Could not persist seen.json locally:', e?.message || e);
    }
  try { fs.writeFileSync(SELLERS_OUTPUT, JSON.stringify(sellers, null, 2), "utf8"); } catch (e) { console.warn('Could not write sellers.json:', e.message); }
  // Persist seen.json to blobs separately (after local file) so dataset helper needn't duplicate migration logic
  const { persistSeen } = require('./persistence/seenStore');
  try { await persistSeen(store, seen, { loadedFromBlob, merged, persistMode }); console.log('[seen] Persisted seen.json to Netlify Blobs'); } catch {}

    // Persist datasets (extracted to helper)
    const { persistDatasets } = require('./persistence/outputs');
    await persistDatasets({
      processedItems,
      sellers,
      manifest,
      byCategory,
      snapshotMeta,
      storeRef: store,
      IS_FUNCTION,
      seen,
      recentItems: recentItemsCompact,
      itemImageLookup: imageLookup,
    });

    console.log(
      `Indexed ${processedItems.length} items. Wrote:\n - ${path.relative(
        process.cwd(),
        ITEMS_OUTPUT
      )}\n - ${path.relative(process.cwd(), SELLERS_OUTPUT)}`
    );
    return { itemsCount: processedItems.length, sellersCount: sellers.length };
  } catch (err) {
    console.error("Indexing failed:", err?.message || err);
    // Still write empty files so the app can build
    try {
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }
      fs.writeFileSync(ITEMS_OUTPUT, JSON.stringify([], null, 2), "utf8");
      fs.writeFileSync(SELLERS_OUTPUT, JSON.stringify([], null, 2), "utf8");
      console.log("Wrote empty datasets due to fetch failure.");
    } catch {}
    // Do not fail the CI/build; continue gracefully
    process.exitCode = 0;
    return { itemsCount: 0, sellersCount: 0, error: err?.message || String(err) };
  }
}

// If executed directly via node scripts/index-items.js run main().
if (require.main === module) {
  main();
}

// Export for programmatic usage (Netlify scheduled function)
module.exports = { run: main, categorizeTest: categorizeItemWithSub, isTipListing };
