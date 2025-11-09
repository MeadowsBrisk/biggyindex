import type { NextApiRequest, NextApiResponse } from 'next';
import { getSellers, getSnapshotMeta } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const meta: any = await getSnapshotMeta(mkt);
  const sellers: any[] = await getSellers(mkt);
  const updatedAt: string = meta?.updatedAt || new Date().toISOString();
  const version: string = meta?.version || sellers.length.toString(36);
  await conditionalJSON(req as any, res as any, {
    prefix: `sellers-${mkt}`,
    version,
    updatedAt,
    getBody: async () => ({ sellers, count: sellers.length, dynamic: true as const, version, updatedAt })
  });
}
