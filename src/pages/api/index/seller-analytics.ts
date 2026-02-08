import type { NextApiRequest, NextApiResponse } from 'next';
import { getSellerAnalytics } from '@/lib/data/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market/market';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const analytics: any = await getSellerAnalytics(mkt);
  
  // Safety check: if analytics is empty, don't cache it (likely an R2 read failure)
  const isEmpty = !analytics?.sellers || analytics.sellers.length === 0;
  if (isEmpty) {
    console.warn(`[seller-analytics] Empty response for market=${mkt}`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  
  const updatedAt: string = analytics?.generatedAt || new Date().toISOString();
  const version: string = (analytics?.totalSellers?.toString(36) || '0') + '-' + mkt;
  await conditionalJSON(req as any, res as any, {
    prefix: `seller-analytics-${mkt}`,
    version,
    updatedAt,
    // Don't cache empty responses
    ...(isEmpty ? { cacheControl: 'no-store, no-cache, must-revalidate' } : {}),
    getBody: async () => ({ ...analytics, dynamic: true as const })
  });
}
