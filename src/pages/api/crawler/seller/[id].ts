import type { NextApiRequest, NextApiResponse } from 'next';
import { readR2JSON, buildR2Key } from '@/lib/data/r2Client';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const idRaw = (req.query as any).id;
  try { res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive'); } catch {}
  if (!idRaw || Array.isArray(idRaw)) { res.status(400).json({ error: 'invalid id' }); return; }
  const id = String(idRaw);
  const storeName = process.env.SHARED_STORE_NAME || 'site-index-shared';
  const legacyPrefix = (process.env.SELLER_CRAWLER_BLOBS_PREFIX || 'seller-crawler/').replace(/\/+$/, '/') + 'sellers/'; // env var name is legacy but still in use
  const candidateKeys: string[] = [];
  const pushKey = (key: string) => { if (!candidateKeys.includes(key)) { candidateKeys.push(key); } };
  pushKey(`sellers/${id}.json`);
  pushKey(`sellers/${encodeURIComponent(id)}.json`);
  pushKey(legacyPrefix + encodeURIComponent(id) + '.json');

  try {
    for (const key of candidateKeys) {
      const data = await readR2JSON(buildR2Key(storeName, key));
      if (data) {
        res.setHeader('X-Crawler-Storage', 'r2');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        res.status(200).json(data);
        return;
      }
    }
  } catch (e: any) {
    console.error('[seller-api] R2 read error:', e?.message);
    res.status(500).json({ error: 'internal_error' });
    return;
  }

  res.setHeader('X-Crawler-Storage', 'miss');
  res.status(404).json({ error: 'not_found' });
}
