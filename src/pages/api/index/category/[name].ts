import type { NextApiRequest, NextApiResponse } from 'next';
import { getCategoryItems, getSnapshotMeta } from '@/lib/data/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market/market';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const name = (req.query as any).name || '';
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const meta: any = await getSnapshotMeta(mkt);
  const rawItems: any[] = await getCategoryItems(String(name), mkt);
  // Items now use minified keys directly - no normalization needed
  const items = rawItems;
  
  // Safety check: if category items is empty, don't cache it (could be a blob read failure)
  // Note: empty category is valid, so only warn but still apply no-cache for safety
  const isEmpty = !items || items.length === 0;
  if (isEmpty) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  
  const updatedAt: string = meta?.updatedAt || new Date().toISOString();
  const version: string = meta?.version || `${name}-${items.length.toString(36)}`;
  await conditionalJSON(req as any, res as any, {
    prefix: `cat-${encodeURIComponent(String(name))}-${mkt}`,
    version,
    updatedAt,
    // Don't cache empty responses
    ...(isEmpty ? { cacheControl: 'no-store, no-cache, must-revalidate' } : {}),
    getBody: async () => ({ items, category: name, count: items.length, dynamic: true as const, version, updatedAt })
  });
}
