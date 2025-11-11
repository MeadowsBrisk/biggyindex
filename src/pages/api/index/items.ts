import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllItems, getSnapshotMeta } from '@/lib/indexData';
import type { Market } from '@/lib/market';
import { conditionalJSON } from '@/lib/http/conditional';
import { normalizeItems } from '@/lib/normalizeItem';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const meta: any = await getSnapshotMeta(mkt);
  const rawItems: any[] = await getAllItems(mkt);
  const items: any[] = normalizeItems(rawItems);
  const updatedAt: string = meta?.updatedAt || new Date().toISOString();
  const version: string = meta?.version || `${items.length.toString(36)}-${(items[0] as any)?.id || 'na'}-${(items[items.length-1] as any)?.id || 'na'}`;
  await conditionalJSON(req as any, res as any, {
    prefix: 'items',
    version,
    updatedAt,
    getBody: async () => ({ items, count: items.length, dynamic: true as const, version, updatedAt })
  });
}
