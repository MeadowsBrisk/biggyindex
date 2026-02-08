import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllItems, getSnapshotMeta } from '@/lib/data/indexData';
import type { Market } from '@/lib/market/market';
import { conditionalJSON } from '@/lib/http/conditional';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const meta: any = await getSnapshotMeta(mkt);
  const rawItems: any[] = await getAllItems(mkt);
  // Items now use minified keys directly - no normalization needed
  const items = rawItems;
  
  // Safety check: if items array is empty, don't cache it (likely an R2 read failure)
  const isEmpty = !items || items.length === 0;
  if (isEmpty) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  
  const updatedAt: string = meta?.updatedAt || new Date().toISOString();
  const version: string = meta?.version || `${items.length.toString(36)}-${(items[0] as any)?.id || 'na'}-${(items[items.length-1] as any)?.id || 'na'}`;
  await conditionalJSON(req as any, res as any, {
    prefix: 'items',
    version,
    updatedAt,
    // Don't cache empty responses
    ...(isEmpty ? { cacheControl: 'no-store, no-cache, must-revalidate' } : {}),
    getBody: async () => ({ items, count: items.length, dynamic: true as const, version, updatedAt })
  });
}
