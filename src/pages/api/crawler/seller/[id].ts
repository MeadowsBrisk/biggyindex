import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const idRaw = (req.query as any).id;
  try { res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive'); } catch {}
  if (!idRaw || Array.isArray(idRaw)) { res.status(400).json({ error: 'invalid id' }); return; }
  const id = String(idRaw);
  const storeName = process.env.SHARED_STORE_NAME || process.env.CRAWLER_BLOBS_STORE || 'site-index-shared';
  const legacyPrefix = (process.env.SELLER_CRAWLER_BLOBS_PREFIX || 'seller-crawler/').replace(/\/+$/, '/') + 'sellers/';
  const candidateKeys: string[] = [];
  const pushKey = (key: string) => { if (!candidateKeys.includes(key)) { candidateKeys.push(key); } };
  pushKey(`sellers/${id}.json`);
  pushKey(`sellers/${encodeURIComponent(id)}.json`);
  pushKey(legacyPrefix + encodeURIComponent(id) + '.json');
  let storage: 'blob' | 'fs' | 'miss' = 'miss';
  try {
    const mod: any = await import('@netlify/blobs').catch(()=>null);
    if (mod && mod.getStore) {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
      let store: any = null;
      if (siteID && token) { try { store = mod.getStore({ name: storeName, siteID, token, consistency: 'strong' }); } catch {} }
      if (!store) { try { store = mod.getStore({ name: storeName, consistency: 'strong' }); } catch {} }
      if (store) {
        for (const key of candidateKeys) {
          const raw = await store.get(key);
          if (raw) {
            storage = 'blob';
            try { res.setHeader('X-Crawler-Storage', storage); } catch {}
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).send(raw);
            return;
          }
        }
      }
    }
  } catch {}
  if (storage !== 'blob') {
    try {
      const { promises: fs } = await import('fs');
      const path = (await import('path')).default;
      const filePath = path.join(process.cwd(), 'public', 'seller-crawler', 'sellers', encodeURIComponent(id) + '.json');
      const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
      if (raw) {
        storage = 'fs';
        try { res.setHeader('X-Crawler-Storage', storage); } catch {}
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(raw);
        return;
      }
    } catch {}
  }
  try { res.setHeader('X-Crawler-Storage', storage); } catch {}
  res.status(404).json({ error: 'not_found' });
}
