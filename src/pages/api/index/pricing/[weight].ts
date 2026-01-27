import type { NextApiRequest, NextApiResponse } from 'next';
import { getPricingByWeight } from '@/lib/data/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market/market';

export const config = { runtime: 'nodejs' };

// Valid weight breakpoints (50g and 100g mainly for Hash bulk)
const VALID_WEIGHTS = [1, 3.5, 7, 14, 28, 50, 100];

/**
 * GET /api/index/pricing/[weight]?mkt=GB
 * 
 * Returns items with a specific weight variant, sorted by ppg ascending:
 * - weight: number (1, 3.5, 7, 14, 28)
 * - items: [{ id, usd, ppg, cat, d }]
 * 
 * Example: /api/index/pricing/7?mkt=GB
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const weightParam = String(req.query.weight || '');
  
  // Parse weight - support both "7" and "7g" formats
  const weight = parseFloat(weightParam.replace(/g$/i, ''));
  
  if (!VALID_WEIGHTS.includes(weight)) {
    return res.status(400).json({ 
      error: 'Invalid weight', 
      validWeights: VALID_WEIGHTS,
      received: weightParam 
    });
  }
  
  const pricing = await getPricingByWeight(weight, mkt);
  
  if (!pricing) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'Pricing data not available for this weight' });
  }
  
  await conditionalJSON(req as any, res as any, {
    prefix: `pricing-${weight}g-${mkt}`,
    version: pricing.updatedAt || '1',
    updatedAt: pricing.updatedAt || new Date().toISOString(),
    getBody: async () => pricing,
  });
}
