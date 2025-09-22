#!/usr/bin/env node
// Rebuild seller-images.json from existing per-seller snapshots in Netlify Blobs (or FS fallback)
// Usage (requires NETLIFY_SITE_ID and NETLIFY_API_TOKEN or running inside Netlify env):
//   node scripts/seller-crawler/tools/rebuild-seller-images.js

const fs = require('fs');
const path = require('path');

(function tryDotenv(){
  try { require('dotenv').config(); } catch {}
})();

async function main(){
  const { initPersistence } = require('../../item-crawler/persistence/blobStore');
  const { setPersistence, writeSellerImages } = require('../persistence/sellerOutputs');

  const blobsStore = process.env.CRAWLER_BLOBS_STORE || 'site-index';
  const blobsPrefix = 'seller-crawler/';
  const outputDir = path.join(process.cwd(), 'public', 'seller-crawler');

  const persistence = await initPersistence({ persistMode: 'auto', blobsStore, blobsPrefix, outputDir, log: console });
  setPersistence(persistence);

  const images = {};
  let used = 'fs';
  if (persistence && persistence.mode === 'blobs' && typeof persistence.listKeys === 'function') {
    try {
      const keys = await persistence.listKeys('sellers/');
      for (const key of keys || []) {
        if (!key.endsWith('.json')) continue;
        try {
          const rec = await persistence.readJson(key);
          const id = rec && rec.sellerId;
          const url = rec && rec.sellerImageUrl;
          if (Number.isFinite(id) && url) images[id] = url;
        } catch {}
      }
      used = 'blobs';
    } catch (e) {
      console.warn('[seller-images] blob listing failed, will fall back to FS:', e.message);
    }
  }

  if (Object.keys(images).length === 0) {
    try {
      const dir = path.join(outputDir, 'sellers');
      if (fs.existsSync(dir)) {
        const names = fs.readdirSync(dir).filter(n => n.endsWith('.json'));
        for (const name of names) {
          try {
            const rec = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
            const id = rec && rec.sellerId; const url = rec && rec.sellerImageUrl;
            if (Number.isFinite(id) && url) images[id] = url;
          } catch {}
        }
      }
      used = 'fs';
    } catch {}
  }

  console.log(`[seller-images] collected ${Object.keys(images).length} entries via ${used}`);
  writeSellerImages(outputDir, images);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
