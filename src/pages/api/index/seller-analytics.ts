import type { NextApiRequest, NextApiResponse } from 'next';
import { getSellerAnalytics } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market';

export const config = { runtime: 'nodejs' } as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const analytics: any = await getSellerAnalytics(mkt);
  const updatedAt: string = analytics?.generatedAt || new Date().toISOString();
  const version: string = (analytics?.totalSellers?.toString(36) || '0') + '-' + mkt;
  await conditionalJSON(req as any, res as any, {
    prefix: `seller-analytics-${mkt}`,
    version,
    updatedAt,
    getBody: async () => ({ ...analytics, dynamic: true as const })
  });
}
