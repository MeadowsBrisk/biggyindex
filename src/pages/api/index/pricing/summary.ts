import type { NextApiRequest, NextApiResponse } from 'next';
import { getPricingSummary } from '@/lib/data/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market/market';

export const config = { runtime: 'nodejs' };

/**
 * GET /api/index/pricing/summary?mkt=GB
 * 
 * Returns the pricing summary for all items with ppg data:
 * - items: { [refNum]: { ppgMin, ppgMax, weights, unit, cat } }
 * - sortedByPpgAsc: refNum[] sorted by ppgMin ascending
 * - sortedByPpgDesc: refNum[] sorted by ppgMax descending
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const summary = await getPricingSummary(mkt);
  
  if (!summary) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'Pricing data not available' });
  }
  
  await conditionalJSON(req as any, res as any, {
    prefix: `pricing-summary-${mkt}`,
    version: summary.updatedAt || '1',
    updatedAt: summary.updatedAt || new Date().toISOString(),
    getBody: async () => summary,
  });
}
