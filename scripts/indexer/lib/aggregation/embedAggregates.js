// Aggregated crawler data embedding (share links, shipping price ranges)
// Prefer fresh data from Netlify Blobs (index-supplement.json); fallback to filesystem JS in the repo bundle.
const path = require('path');
const fs = require('fs');

async function embedAggregatedCrawlerData(processedItems, { rootDir = process.cwd(), log = console } = {}) {
  let embeddedShareCount = 0;
  let embeddedShippingRangeCount = 0;
  let missingRefLookup = 0;
  try {
    let aggregated = null;
    const requireBlobs = (() => {
      const v = String(process.env.REQUIRE_BLOBS_AGGREGATES || '').trim().toLowerCase();
      return ['1','true','yes','on','strict'].includes(v);
    })();
    // 1) Try Netlify Blobs JSON first for freshest data (prefer explicit-first auth)
    try {
      const mod = await import('@netlify/blobs');
      const { getStore } = mod;
      const storeName = process.env.CRAWLER_BLOBS_STORE || 'site-index';
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
      let store = null;
      if (siteID && token) {
        try { store = getStore({ name: storeName, siteID, token, consistency: 'strong' }); } catch {}
      }
      if (!store) {
        try { store = getStore({ name: storeName, consistency: 'strong' }); } catch {}
      }
      if (store) {
        const prefixRaw = process.env.CRAWLER_BLOBS_PREFIX || 'item-crawler/';
        const prefix = prefixRaw.replace(/^\/+|\/+$/g,'') + '/';
        const raw = await store.get(prefix + 'index-supplement.json');
        if (raw) {
          try { aggregated = JSON.parse(raw); log.log('[aggregated] source=blobs'); } catch {}
        }
      }
    } catch {}
    // 2) Fallback to filesystem: prefer new JS, then legacy JS (unless strict)
    if (!aggregated) {
      if (requireBlobs) {
        log.warn('[aggregated] strict mode requires Blobs; skipping filesystem fallback');
      } else {
        const primary = path.join(rootDir, 'public', 'item-crawler', 'index-supplement.js');
        const legacy = path.join(rootDir, 'public', 'item-crawler', 'aggregated-referral-shipping.js');
        if (fs.existsSync(primary)) { aggregated = require(primary); log.warn('[aggregated] source=filesystem primary (stale risk)'); }
        else if (fs.existsSync(legacy)) { aggregated = require(legacy); log.warn('[aggregated] source=filesystem legacy (stale risk)'); }
      }
    }
    if (aggregated) {
      if (aggregated && aggregated.items && typeof aggregated.items === 'object') {
        // Build auxiliary map by itemId for fallback if refNum absent in processed item
        const byItemId = new Map();
        for (const entry of Object.values(aggregated.items)) {
          if (entry && typeof entry.itemId === 'number') byItemId.set(entry.itemId, entry);
        }
        for (const it of processedItems) {
          if (!it) continue;
          let entry = null;
          if (it.refNum) entry = aggregated.items[it.refNum];
          if (!entry && it.id != null) {
            // attempt numeric id fallback
            entry = byItemId.get(Number(it.id));
            if (entry) missingRefLookup++;
          }
            if (!entry) continue;
          // Accept either legacy shortLink or new share field
          const shareLink = entry.share || entry.shortLink;
          if (shareLink && !it.share) { it.share = shareLink; embeddedShareCount++; }
          // Legacy shippingPriceRange vs new minShip/maxShip
          if (!it.minShip && !it.maxShip) {
            if (entry.minShip != null || entry.maxShip != null) {
              it.minShip = entry.minShip ?? null;
              it.maxShip = entry.maxShip ?? null;
              embeddedShippingRangeCount++;
            } else if (entry.shippingPriceRange) {
              const r = entry.shippingPriceRange;
              if (r && (typeof r.min === 'number' || typeof r.max === 'number')) {
                it.minShip = r.min ?? null;
                it.maxShip = r.max ?? null;
                embeddedShippingRangeCount++;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    log.warn('[aggregated] injection skipped:', e.message);
  }
  log.log(`[aggregated] embedded shareLinks=${embeddedShareCount} shippingRanges=${embeddedShippingRangeCount} fallbackIdMatches=${missingRefLookup} of ${processedItems.length}`);
  return { embeddedShareCount, embeddedShippingRangeCount, missingRefLookup };
}

module.exports = { embedAggregatedCrawlerData };
