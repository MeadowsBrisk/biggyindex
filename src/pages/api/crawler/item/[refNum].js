// API route: /api/crawler/item/[refNum]
// Optimized: blobs-only (Store API) with explicit-first auth, no filesystem fallback.
// Env:
//   CRAWLER_BLOBS_STORE (default site-index)
//   CRAWLER_BLOBS_PREFIX (default item-crawler/)
//   NETLIFY_SITE_ID + (NETLIFY_BLOBS_TOKEN | NETLIFY_API_TOKEN | NETLIFY_AUTH_TOKEN | BLOBS_TOKEN) for explicit auth (preferred).
// Response headers:
//   X-Crawler-Storage: blob|miss
//   X-Crawler-Detail-Auth: explicit|implicit|none
//   ETag: weak hash of body for client caching
//   Cache-Control: short client cache + allow revalidation
//ALLOW_FS_DETAIL_FALLBACK - use filesystem fallback if blob miss

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const { refNum } = req.query;
  if (!refNum || Array.isArray(refNum)) { res.status(400).json({ error: 'invalid refNum'}); return; }
  const storeName = process.env.CRAWLER_BLOBS_STORE || 'site-index';
  const prefix = (process.env.CRAWLER_BLOBS_PREFIX || 'item-crawler/').replace(/\/+/g,'/');
  const allowFs = /^(1|true|yes|on)$/i.test(String(process.env.ALLOW_FS_DETAIL_FALLBACK || process.env.CRAWLER_DETAIL_FS_FALLBACK || ''));
  const localFile = path.join(process.cwd(),'public','item-crawler','items', refNum + '.json');
  let authMode = 'none';
  let attemptedKey = null;
  // Blobs (explicit-first)
  try {
    const mod = await import('@netlify/blobs').catch(()=>null);
    if (mod && mod.getStore) {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
      let store = null;
      if (siteID && token) {
        try { store = mod.getStore({ name: storeName, siteID, token, consistency: 'strong' }); authMode = 'explicit'; }
        catch (e) { console.warn('[detail-api] explicit getStore failed', e.message); }
      }
      if (!store) {
        try { store = mod.getStore({ name: storeName, consistency: 'strong' }); authMode = authMode === 'explicit' ? 'explicit' : 'implicit'; }
        catch (e) { console.warn('[detail-api] implicit getStore failed', e.message); store = null; }
      }
      res.setHeader('X-Crawler-Detail-Auth', authMode);
      if (store) {
        try {
          const blobKey = prefix + 'items/' + refNum + '.json'; attemptedKey = blobKey;
          const raw = await store.get(blobKey);
          if (raw) {
            console.log('[detail-api] blob hit', blobKey, 'auth='+authMode, 'bytes=' + raw.length);
            const etag = 'W/"'+crypto.createHash('sha1').update(raw).digest('hex').slice(0, 32)+'"';
            res.setHeader('Content-Type','application/json');
            res.setHeader('Cache-Control','public, max-age=30, stale-while-revalidate=120');
            res.setHeader('ETag', etag);
            res.setHeader('X-Crawler-Storage','blob');
            // Conditional GET support
            if (req.headers['if-none-match'] === etag) {
              res.status(304).end();
              return;
            }
            res.status(200).send(raw);
            return;
          }
          console.log('[detail-api] blob miss', blobKey, 'auth='+authMode);
        } catch {}
      }
    }
  } catch {}
  // Optional filesystem fallback
  if (allowFs) {
    try {
      if (fs.existsSync(localFile)) {
        const data = fs.readFileSync(localFile,'utf8');
        console.log('[detail-api] fs fallback (enabled) ref='+refNum);
        res.setHeader('Content-Type','application/json');
        res.setHeader('X-Crawler-Storage','fs');
        res.status(200).send(data);
        return;
      }
    } catch {}
  }
  // Miss
  console.warn('[detail-api] miss ref=' + refNum, 'auth='+authMode, attemptedKey ? 'attempted='+attemptedKey : '', allowFs? 'fsAllowed':'fsDisabled');
  res.setHeader('X-Crawler-Storage','miss');
  res.status(404).json({ error:'not_found' });
}
