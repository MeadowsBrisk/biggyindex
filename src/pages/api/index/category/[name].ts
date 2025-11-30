import type { NextApiRequest, NextApiResponse } from 'next';
import { getCategoryItems, getSnapshotMeta } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const name = (req.query as any).name || '';
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const meta: any = await getSnapshotMeta(mkt);
  const rawItems: any[] = await getCategoryItems(String(name), mkt);
  // Items now use minified keys directly - no normalization needed
  const items = rawItems;
  const updatedAt: string = meta?.updatedAt || new Date().toISOString();
  const version: string = meta?.version || `${name}-${items.length.toString(36)}`;
  await conditionalJSON(req as any, res as any, {
    prefix: `cat-${encodeURIComponent(String(name))}-${mkt}`,
    version,
    updatedAt,
    getBody: async () => ({ items, category: name, count: items.length, dynamic: true as const, version, updatedAt })
  });
}
