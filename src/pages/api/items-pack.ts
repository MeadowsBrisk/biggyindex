import type { NextApiRequest, NextApiResponse } from 'next';
import { encode } from '@msgpack/msgpack';
import { getAllItems, getSnapshotMeta } from '@/lib/data/indexData';
import type { Market } from '@/lib/market/market';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Prevent indexing of binary API endpoints
  try { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); } catch {}

  const mkt = String(req.query.mkt || 'GB').toUpperCase() as Market;

  try {
    const [items, meta] = await Promise.all([
      getAllItems(mkt),
      getSnapshotMeta(mkt),
    ]);

    if (!items || items.length === 0) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ error: 'no_items' });
    }

    const packed = Buffer.from(encode(items));

    res.setHeader('Content-Type', 'application/msgpack');
    // Version query param busts cache on data change.
    // Browser: 24h, CDN: 12h (aligns with other index routes), stale: 7 days
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=43200, stale-while-revalidate=604800, immutable'
    );
    // ETag for conditional requests
    const version = meta?.version || items.length.toString(36);
    res.setHeader('ETag', `W/"pack-${mkt}-${version}"`);

    // Handle conditional request
    const inm = req.headers['if-none-match'];
    if (inm && inm === `W/"pack-${mkt}-${version}"`) {
      return res.status(304).end();
    }

    res.status(200).send(packed);
  } catch (e) {
    console.error('[items-pack] Error:', e);
    res.status(500).json({ error: 'pack_failed' });
  }
}
