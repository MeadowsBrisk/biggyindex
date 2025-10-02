const fs = require('fs');
const path = require('path');
const log = require('../../item-crawler/util/logger');

let persistence = null;

function setPersistence(p){ persistence = p; }
function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }

function writePerSeller(outputDir, seller){
  try {
    if (persistence && persistence.mode === 'blobs') {
      const key = `sellers/${seller.sellerId}.json`;
      persistence.writeJson(key, seller);
      return;
    }
    const dir = path.join(outputDir, 'sellers');
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, `${seller.sellerId}.json`), JSON.stringify(seller,null,2),'utf8');
  } catch(e){ log.warn(`writePerSeller failed ${e.message}`); }
}

function writeShareLinks(outputDir, map){
  try {
    if (!map || Object.keys(map).length === 0) return;
    if (persistence && persistence.mode === 'blobs') {
      (async () => {
        try {
          const existing = await persistence.readJson('share-links.json');
          const merged = { ...(existing||{}), ...(map||{}) };
          await persistence.writeJson('share-links.json', merged);
        } catch (e) {
          try { await persistence.writeJson('share-links.json', map||{}); } catch {}
        }
      })();
      return;
    }
    ensureDir(outputDir);
    const file = path.join(outputDir,'share-links.json');
    let existing = {};
    try { if (fs.existsSync(file)) existing = JSON.parse(fs.readFileSync(file,'utf8')); } catch {}
    const merged = { ...(existing||{}), ...(map||{}) };
    fs.writeFileSync(file, JSON.stringify(merged,null,2),'utf8');
  } catch(e){ log.warn(`writeShareLinks failed ${e.message}`); }
}

function writeRunMeta(outputDir, meta){
  try {
    if (persistence && persistence.mode === 'blobs') {
      persistence.writeJson('run-meta.json', meta);
      return;
    }
    ensureDir(outputDir);
    fs.writeFileSync(path.join(outputDir,'run-meta.json'), JSON.stringify(meta,null,2),'utf8');
  } catch(e){ log.warn(`writeRunMeta failed ${e.message}`); }
}

function writeRecentReviews(outputDir, list){
  try {
    const payload = Array.isArray(list) ? list : [];
    if (persistence && persistence.mode === 'blobs') {
      (async () => {
        try {
          if (!payload.length) {
            // Don't clobber existing non-empty recent list with empty
            const existing = await persistence.readJson('recent-reviews.json');
            if (Array.isArray(existing) && existing.length > 0) {
              try { log.info('[recent] skip write: empty recent-reviews would overwrite non-empty existing'); } catch {}
              return;
            }
          }
          await persistence.writeJson('recent-reviews.json', payload);
        } catch (e) {
          try { await persistence.writeJson('recent-reviews.json', payload); } catch {}
        }
      })();
      return;
    }
    ensureDir(outputDir);
    try {
      const file = path.join(outputDir,'recent-reviews.json');
      if (!payload.length && fs.existsSync(file)) {
        try {
          const existing = JSON.parse(fs.readFileSync(file,'utf8'));
          if (Array.isArray(existing) && existing.length > 0) {
            try { log.info('[recent] skip write: empty recent-reviews would overwrite non-empty existing (fs)'); } catch {}
            return;
          }
        } catch {}
      }
      fs.writeFileSync(file, JSON.stringify(payload,null,2),'utf8');
    } catch (e) { throw e; }
  } catch (e) { log.warn(`writeRecentReviews failed ${e.message}`); }
}

function writeRecentMedia(outputDir, list){
  try {
    const payload = Array.isArray(list) ? list : [];
    if (persistence && persistence.mode === 'blobs') {
      (async () => {
        try {
          if (!payload.length) {
            const existing = await persistence.readJson('recent-media.json');
            if (Array.isArray(existing) && existing.length > 0) {
              try { log.info('[recent] skip write: empty recent-media would overwrite non-empty existing'); } catch {}
              return;
            }
          }
          await persistence.writeJson('recent-media.json', payload);
        } catch (e) {
          try { await persistence.writeJson('recent-media.json', payload); } catch {}
        }
      })();
      return;
    }
    ensureDir(outputDir);
    try {
      const file = path.join(outputDir,'recent-media.json');
      if (!payload.length && fs.existsSync(file)) {
        try {
          const existing = JSON.parse(fs.readFileSync(file,'utf8'));
          if (Array.isArray(existing) && existing.length > 0) {
            try { log.info('[recent] skip write: empty recent-media would overwrite non-empty existing (fs)'); } catch {}
            return;
          }
        } catch {}
      }
      fs.writeFileSync(file, JSON.stringify(payload,null,2),'utf8');
    } catch (e) { throw e; }
  } catch (e) { log.warn(`writeRecentMedia failed ${e.message}`); }
}

// function writeTopSellersAll(outputDir, list){
//   try {
//     const payload = Array.isArray(list) ? list : [];
//     if (persistence && persistence.mode === 'blobs') {
//       persistence.writeJson('top-sellers.json', payload);
//       return;
//     }
//     ensureDir(outputDir);
//     fs.writeFileSync(path.join(outputDir,'top-sellers.json'), JSON.stringify(payload,null,2),'utf8');
//   } catch (e) { log.warn(`writeTopSellersAll failed ${e.message}`); }
// }

// function writeBottomSellersAll(outputDir, list){
//   try {
//     const payload = Array.isArray(list) ? list : [];
//     if (persistence && persistence.mode === 'blobs') {
//       persistence.writeJson('bottom-sellers.json', payload);
//       return;
//     }
//     ensureDir(outputDir);
//     fs.writeFileSync(path.join(outputDir,'bottom-sellers.json'), JSON.stringify(payload,null,2),'utf8');
//   } catch (e) { log.warn(`writeBottomSellersAll failed ${e.message}`); }
// }

// function writeTopSellersWeek(outputDir, list){
//   try {
//     const payload = Array.isArray(list) ? list : [];
//     if (persistence && persistence.mode === 'blobs') {
//       persistence.writeJson('top-sellers-week.json', payload);
//       return;
//     }
//     ensureDir(outputDir);
//     fs.writeFileSync(path.join(outputDir,'top-sellers-week.json'), JSON.stringify(payload,null,2),'utf8');
//   } catch (e) { log.warn(`writeTopSellersWeek failed ${e.message}`); }
// }

function writeSellersLeaderboard(outputDir, leaderboard){
  try {
    const payload = leaderboard && typeof leaderboard === 'object' ? leaderboard : { top: [], bottom: [] };
    if (persistence && persistence.mode === 'blobs') {
      persistence.writeJson('sellers-leaderboard.json', payload);
      return;
    }
    ensureDir(outputDir);
    fs.writeFileSync(path.join(outputDir,'sellers-leaderboard.json'), JSON.stringify(payload,null,2),'utf8');
  } catch (e) { log.warn(`writeSellersLeaderboard failed ${e.message}`); }
}

function writeSellerImages(outputDir, map){
  try {
    const payload = map && typeof map === 'object' ? map : {};
    if (persistence && persistence.mode === 'blobs') {
      // Write to Blobs
      try { persistence.writeJson('seller-images.json', payload); } catch {}
      // Also mirror to FS so local builds (without blob auth) can use the aggregate
      try {
        ensureDir(outputDir);
        fs.writeFileSync(path.join(outputDir,'seller-images.json'), JSON.stringify(payload,null,2),'utf8');
      } catch {}
      return;
    }
    ensureDir(outputDir);
    fs.writeFileSync(path.join(outputDir,'seller-images.json'), JSON.stringify(payload,null,2),'utf8');
  } catch (e) { log.warn(`writeSellerImages failed ${e.message}`); }
}

// Merge-only update: read existing map, overlay deltas, then persist
async function upsertSellerImages(outputDir, delta){
  try {
    if (!delta || typeof delta !== 'object' || !Object.keys(delta).length) return false;
    let current = {};
    if (persistence && persistence.mode === 'blobs') {
      try { current = (await persistence.readJson('seller-images.json')) || {}; } catch { current = {}; }
    } else {
      try {
        const file = path.join(outputDir, 'seller-images.json');
        if (fs.existsSync(file)) current = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
      } catch { current = {}; }
    }
    // Determine if delta actually changes anything
    let changed = false;
    for (const [k, v] of Object.entries(delta)) {
      if (typeof v !== 'string' || !v) continue; // ignore empty
      if (!current || current[k] !== v) { changed = true; break; }
    }
    if (!changed) return false; // no-op
    const merged = { ...(current||{}), ...(delta||{}) };
    writeSellerImages(outputDir, merged);
    return true;
  } catch (e) {
    log.warn(`upsertSellerImages failed ${e.message}`);
    return false;
  }
}

module.exports = { setPersistence, writePerSeller, writeShareLinks, writeRunMeta, writeRecentReviews, writeRecentMedia, writeSellersLeaderboard, writeSellerImages, upsertSellerImages };


