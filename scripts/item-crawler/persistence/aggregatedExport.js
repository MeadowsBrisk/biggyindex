// aggregatedExport.js - manage aggregated referral + shipping map ("index-supplement")
// New shape written: module.exports = { version:1, generatedAt:"ISO", items:{ [refNum]:{ refNum, share?, minShip?, maxShip?, firstCapturedAt, lastShippingAt?, shippingHash? } } }

const fs = require('fs');
const path = require('path');

function isNetlifyRuntime(){
  return !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT || process.env.AWS_EXECUTION_ENV);
}

function safeRequire(file){
  try { if (fs.existsSync(file)) return require(file); } catch {};
  return null;
}

function loadAggregated(basePublicDir){
  // Always migrate to new filename index-supplement.js; legacy files only used as data source.
  const primary = path.join(basePublicDir, 'item-crawler','index-supplement.js');
  const legacyJs = path.join(basePublicDir, 'item-crawler','aggregated-referral-shipping.js');
  const legacyJson = path.join(basePublicDir, 'item-crawler','aggregated-referral-shipping.json');
  let migratedFromLegacy = false;
  let data = safeRequire(primary);
  if (!data) {
    const legacyData = safeRequire(legacyJs) || safeRequire(legacyJson);
    if (legacyData) { data = legacyData; migratedFromLegacy = true; }
  }
  if (!data) data = { version:1, generatedAt:null, items:{} };
  if (!data.items || typeof data.items !== 'object') data.items = {};
  // If migrated, mark dirty so we will persist the new canonical file even if nothing changes.
  const dirty = migratedFromLegacy ? true : false;
  return { file: primary, data, dirty, migratedFromLegacy, legacyJs, legacyJson };
}

function hashShippingRange(range){
  if (!range) return null;
  return Buffer.from(JSON.stringify(range)).toString('base64').slice(0,16); // short hash
}

function extractShareCode(link){
  if (!link) return null;
  try {
    const m = String(link).match(/\/link\/([A-Za-z0-9-_]+)/);
    return m ? m[1] : String(link).trim();
  } catch { return String(link).trim(); }
}

// updateAggregated(ctx, { refNum, shareLink?, shippingRange?, nowIso })
function updateAggregated(ctx, { refNum, shareLink, shippingRange, nowIso }){
  if (!refNum) return { shippingUpdated:false, shareAdded:false };
  const items = ctx.data.items;
  let entry = items[refNum];
  const shippingHash = hashShippingRange(shippingRange);
  if (!entry) {
    entry = { refNum, firstCapturedAt: nowIso };
    items[refNum] = entry;
    ctx.dirty = true;
  }
  const hadShare = !!entry.share;
  if (shareLink && !entry.share) {
    // Ensure the same share code is not used twice across different refs
    const newCode = extractShareCode(shareLink);
    let duplicateOwner = null;
    if (newCode) {
      for (const [r, e] of Object.entries(items)) {
        if (!e || r === String(refNum)) continue;
        const existingCode = extractShareCode(e.share);
        if (existingCode && existingCode === newCode) { duplicateOwner = r; break; }
      }
    }
    if (!duplicateOwner) {
      entry.share = shareLink;
      ctx.dirty = true;
    } else {
      // Skip assigning duplicate share; keep existing owner
      // Optional: could record a note for diagnostics
      entry.shareDuplicateOf = duplicateOwner;
    }
  }
  let shippingUpdated = false;
  if (shippingRange) {
    const changed = (entry.minShip == null && entry.maxShip == null) || (entry.shippingHash !== shippingHash);
    if (changed) {
      entry.minShip = shippingRange.min ?? null;
      entry.maxShip = shippingRange.max ?? null;
      entry.lastShippingAt = nowIso;
      entry.shippingHash = shippingHash;
      ctx.dirty = true;
      shippingUpdated = true;
    }
  }
  const shareAdded = !hadShare && !!entry.share;
  return { shippingUpdated, shareAdded };
}

async function saveAggregated(ctx){
  if (!ctx.dirty) return false;
  ctx.data.generatedAt = new Date().toISOString();
  // Helper to enforce uniqueness of share codes across items (prefer earliest firstCapturedAt)
  const enforceUniqueShares = (items) => {
    try {
      const byCode = new Map();
      for (const [ref, entry] of Object.entries(items || {})) {
        if (!entry || !entry.share) continue;
        const code = extractShareCode(entry.share);
        if (!code) continue;
        const curFirst = Date.parse(entry.firstCapturedAt || '') || Number.POSITIVE_INFINITY;
        const existing = byCode.get(code);
        if (!existing) {
          byCode.set(code, { ref, first: curFirst });
        } else {
          // Keep the one with the earliest firstCapturedAt; clear share from the other
          const prev = items[existing.ref];
          const prevFirst = existing.first;
          if (curFirst < prevFirst) {
            if (prev && prev.share) delete prev.share;
            byCode.set(code, { ref, first: curFirst });
          } else {
            if (entry && entry.share) delete entry.share;
          }
        }
      }
    } catch {}
  };
  // Always attempt to write to Blobs first (prefer explicit token), independent of CRAWLER_PERSIST.
  try {
    const { getStore } = await import('@netlify/blobs');
    const storeName = process.env.CRAWLER_BLOBS_STORE || 'site-index';
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
    let store = null;
    // Prefer explicit auth if available
    if (siteID && token) {
      try { store = getStore({ name: storeName, siteID, token, consistency:'strong' }); } catch {}
    }
    if (!store) {
      try { store = getStore({ name: storeName, consistency:'strong' }); } catch {}
    }
    if (store) {
      const prefixRaw = process.env.CRAWLER_BLOBS_PREFIX || 'item-crawler/';
      const prefix = prefixRaw.replace(/^\/+|\/+$/g,'') + '/';
      // Merge with existing blob to avoid shrinking dataset when function starts from empty FS bundle
      let base = null;
      try { const raw = await store.get(prefix + 'index-supplement.json'); if (raw) base = JSON.parse(raw); } catch {}
      let toWrite = ctx.data;
      if (base && base.items && typeof base.items === 'object') {
        const merged = { ...base, items: { ...base.items } };
        for (const [ref, entry] of Object.entries(ctx.data.items || {})) {
          if (!entry || typeof entry !== 'object') continue;
          const cur = merged.items[ref] || {};
          const out = { ...cur, refNum: entry.refNum || cur.refNum || ref };
          // Preserve earliest firstCapturedAt
          if (entry.firstCapturedAt && cur.firstCapturedAt) {
            out.firstCapturedAt = (entry.firstCapturedAt < cur.firstCapturedAt) ? entry.firstCapturedAt : cur.firstCapturedAt;
          } else {
            out.firstCapturedAt = entry.firstCapturedAt || cur.firstCapturedAt || null;
          }
          // Share: adopt new non-empty share; otherwise keep existing
          if (entry.share) out.share = entry.share; else if (cur.share) out.share = cur.share;
          // Shipping: update only if hash changed or existing missing
          const newHash = entry.shippingHash;
          const hasExistingShip = (cur.minShip != null || cur.maxShip != null || cur.shippingHash);
          if (newHash && newHash !== cur.shippingHash) {
            out.minShip = entry.minShip ?? null;
            out.maxShip = entry.maxShip ?? null;
            out.shippingHash = newHash;
            out.lastShippingAt = entry.lastShippingAt || new Date().toISOString();
          } else if (!hasExistingShip && (entry.minShip != null || entry.maxShip != null)) {
            out.minShip = entry.minShip ?? null;
            out.maxShip = entry.maxShip ?? null;
            out.shippingHash = entry.shippingHash || null;
            out.lastShippingAt = entry.lastShippingAt || cur.lastShippingAt || null;
          } else {
            if (cur.minShip != null || cur.maxShip != null) { out.minShip = cur.minShip ?? null; out.maxShip = cur.maxShip ?? null; }
            if (cur.shippingHash) out.shippingHash = cur.shippingHash;
            if (cur.lastShippingAt) out.lastShippingAt = cur.lastShippingAt;
          }
          merged.items[ref] = out;
        }
        // Enforce unique share codes across merged items
        enforceUniqueShares(merged.items);
        toWrite = merged;
      }
      else {
        // No base merge; still enforce uniqueness in current dataset
        enforceUniqueShares(ctx.data.items);
      }
      const json = JSON.stringify(toWrite, null, 2);
      await store.set(prefix + 'index-supplement.json', json, { contentType: 'application/json' });
      return true;
    }
  } catch (e) {
    // fall through to filesystem fallback
  }
  // Filesystem write (local dev or fallback). Netlify functions FS is read-only (/var/task), so skip here.
  if (isNetlifyRuntime()) {
    return false;
  }
  const file = ctx.file;
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  const tmp = file + '.tmp';
  // Enforce uniqueness before writing to filesystem
  try { enforceUniqueShares(ctx.data.items); } catch {}
  const js = 'module.exports = ' + JSON.stringify(ctx.data, null, 2) + '\n';
  fs.writeFileSync(tmp, js, 'utf8');
  fs.renameSync(tmp, file);
  // Cleanup legacy files if we migrated (best-effort)
  if (ctx.migratedFromLegacy) {
    for (const legacy of [ctx.legacyJs, ctx.legacyJson]) {
      try { if (legacy && fs.existsSync(legacy)) fs.unlinkSync(legacy); } catch {}
    }
  }
  return true;
}

module.exports = { loadAggregated, updateAggregated, saveAggregated };
