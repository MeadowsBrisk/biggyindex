import type { NextApiRequest, NextApiResponse } from 'next';
import { getSellers, getSnapshotMeta } from '@/lib/data/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market/market';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const [meta, sellers] = await Promise.all([
    getSnapshotMeta(mkt) as Promise<any>,
    getSellers(mkt),
  ]);
  
  // Safety check: if sellers array is empty, don't cache it (likely an R2 read failure)
  const isEmpty = !sellers || sellers.length === 0;
  if (isEmpty) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  
  const updatedAt: string = meta?.updatedAt || new Date().toISOString();
  const version: string = meta?.version || sellers.length.toString(36);
  await conditionalJSON(req as any, res as any, {
    prefix: `sellers-${mkt}`,
    version,
    updatedAt,
    // Don't cache empty responses
    ...(isEmpty ? { cacheControl: 'no-store, no-cache, must-revalidate' } : {}),
    getBody: async () => ({ sellers, count: sellers.length, dynamic: true as const, version, updatedAt })
  });
}
