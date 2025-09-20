// API route: /api/crawler/supplement
// Provides aggregated supplement (shipping/share metadata) with fs first, then Netlify Blobs fallback.

import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Local JS module (legacy) path
  const legacyPath = path.join(process.cwd(), 'public', 'item-crawler', 'index-supplement.js');
  // New JSON form we may emit when using blob persistence
  const jsonPath = path.join(process.cwd(), 'public', 'item-crawler', 'index-supplement.json');

  // Attempt JSON (preferred) then JS for local filesystem
  let body = null;
  let storage = 'miss';
  if (fs.existsSync(jsonPath)) {
    try {
      body = fs.readFileSync(jsonPath, 'utf8');
      storage = 'fs';
    } catch {}
  }
  if (!body && fs.existsSync(legacyPath)) {
    try {
      // Read the JS module and extract the JSON assigned to module.exports
      const js = fs.readFileSync(legacyPath, 'utf8');
      const cleaned = js.replace(/\r?\n/g, '\n');
      const m = cleaned.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
      if (m && m[1]) {
        // m[1] is JSON emitted via JSON.stringify at write time; use as-is
        body = m[1];
        storage = 'fs';
      }
    } catch {}
  }

  if (!body) {
    // Blob fallback
    try {
      const store = process.env.CRAWLER_BLOBS_STORE || 'site-index';
      const prefix = process.env.CRAWLER_BLOBS_PREFIX || 'item-crawler/';
      const mod = await import('@netlify/blobs').catch(()=>null);
      if (mod) {
        const client = mod.createClient({ bucket: store });
        // Prefer JSON variant, fallback to JS variant stored as text if any
        const blobJson = await client.get(prefix + 'index-supplement.json');
        if (blobJson && blobJson.body) {
          body = blobJson.body;
          storage = 'blob';
        } else {
          const blobJs = await client.get(prefix + 'index-supplement.js');
            if (blobJs && blobJs.body) {
              body = blobJs.body;
              storage = 'blob';
            }
        }
      }
    } catch {}
  }

  if (!body) {
    res.setHeader('X-Crawler-Storage','miss');
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.setHeader('Content-Type','application/json');
  res.setHeader('X-Crawler-Storage', storage);
  res.status(200).send(body);
}
