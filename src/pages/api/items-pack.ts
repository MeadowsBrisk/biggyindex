import type { NextApiRequest, NextApiResponse } from 'next';
import { getSnapshotMeta } from '@/lib/data/indexData';
import { readR2Raw, buildR2Key } from '@/lib/data/r2Client';
import type { Market, MARKETS } from '@/lib/market/market';

export const config = { runtime: 'nodejs' };

/** Map market code → R2 store name for key building */
function storeForMarket(mkt: string): string {
  return `site-index-${mkt.toLowerCase()}`;
}

/**
 * Cache strategy: CDN cache matches the indexer cycle (30 min) with stale-while-revalidate.
 *
 * Previous approach used 12h CDN + immutable, relying on version-based cache busting
 * from ISR pages. But if ISR revalidation fails or gets stuck, the old version stays
 * baked in the page HTML → client keeps requesting the same ?v=OLD → CDN serves stale
 * for up to 12 hours. This created a staleness loop that couldn't self-heal.
 *
 * New approach: CDN cache expires every 30 min (one indexer cycle). When ISR works,
 * the new version param cache-busts immediately. When ISR fails, worst case is one
 * full cycle behind — same as the timed ISR safety net.
 */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Prevent indexing of binary API endpoints
  try { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); } catch {}

  const mkt = String(req.query.mkt || 'GB').toUpperCase() as Market;

  try {
    // Try reading pre-built MessagePack blob from R2 (written by the indexer)
    const packKey = buildR2Key(storeForMarket(mkt), 'indexed_items.msgpack');
    const [packed, meta] = await Promise.all([
      readR2Raw(packKey),
      getSnapshotMeta(mkt),
    ]);

    if (!packed || packed.length === 0) {
      // Fallback: encode on-the-fly if pre-built blob doesn't exist yet
      const { getAllItems } = await import('@/lib/data/indexData');
      const items = await getAllItems(mkt);
      if (!items || items.length === 0) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'no_items' });
      }
      const { encode } = await import('@msgpack/msgpack');
      const fallbackPacked = Buffer.from(encode(items));

      res.setHeader('Content-Type', 'application/msgpack');
      res.setHeader('Cache-Control', CACHE_CONTROL);
      const version = meta?.version || items.length.toString(36);
      res.setHeader('ETag', `W/"pack-${mkt}-${version}"`);
      const inm = req.headers['if-none-match'];
      if (inm && inm === `W/"pack-${mkt}-${version}"`) {
        return res.status(304).end();
      }
      return res.status(200).send(fallbackPacked);
    }

    // Serve pre-built blob — zero encoding cost
    res.setHeader('Content-Type', 'application/msgpack');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    const version = meta?.version || packed.length.toString(36);
    res.setHeader('ETag', `W/"pack-${mkt}-${version}"`);

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
