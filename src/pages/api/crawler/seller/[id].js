export default async function handler(req, res) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const storeName = process.env.CRAWLER_BLOBS_STORE || 'site-index';
  const prefix = (process.env.SELLER_CRAWLER_BLOBS_PREFIX || 'seller-crawler/').replace(/\/+$/,'/') + 'sellers/';
  const key = prefix + encodeURIComponent(String(id)) + '.json';
  let storage = 'miss';
  try {
    const mod = await import('@netlify/blobs').catch(()=>null);
    if (mod && mod.getStore) {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
      let store = null;
      if (siteID && token) { try { store = mod.getStore({ name: storeName, siteID, token, consistency: 'strong' }); } catch {} }
      if (!store) { try { store = mod.getStore({ name: storeName, consistency: 'strong' }); } catch {} }
      if (store) {
        const raw = await store.get(key);
        if (raw) {
          storage = 'blob';
          res.setHeader('X-Crawler-Storage', storage);
          res.setHeader('Content-Type','application/json');
          res.setHeader('Cache-Control','no-store');
          res.status(200).send(raw);
          return;
        }
      }
    }
  } catch {}
  // Fallback to local filesystem when developing locally
  try {
    const { promises: fs } = await import('fs');
    const path = (await import('path')).default;
    const filePath = path.join(process.cwd(), 'public', 'seller-crawler', 'sellers', encodeURIComponent(String(id)) + '.json');
    const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (raw) {
      storage = 'fs';
      res.setHeader('X-Crawler-Storage', storage);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(raw);
      return;
    }
  } catch {}
  res.setHeader('X-Crawler-Storage', storage);
  res.status(404).json({ error: 'not_found' });
}


