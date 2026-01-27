/**
 * Pricing Stage - Generates price-per-gram aggregates
 * 
 * Reads indexed_items.json once per market and generates:
 * - pricing-summary.json: Overall ppg min/max per item
 * - pricing-{weight}g.json: Items with specific weight variants, sorted by ppg
 * 
 * Run as: yarn uc --stage=pricing
 */

import { getBlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { loadEnv, type MarketCode } from '../../shared/env/loadEnv';
import { log } from '../../shared/logging/logger';
import {
  parseQuantity,
  matchWeightBreakpoint,
  isGramBasedCategory,
  WEIGHT_BREAKPOINTS,
  type ParsedQuantity,
} from '../../shared/logic/parseQuantity';

// Types for pricing aggregates
export interface PricingSummaryItem {
  ppgMin: number | null;       // Lowest price-per-gram
  ppgMax: number | null;       // Highest price-per-gram
  weights: number[];           // Available weight breakpoints
  unit: 'g' | 'ml' | 'item' | 'mixed';
  cat: string;
}

export interface PricingSummary {
  updatedAt: string;
  itemCount: number;
  items: Record<string, PricingSummaryItem>;
  sortedByPpgAsc: string[];    // Item IDs sorted by ppgMin ascending
  sortedByPpgDesc: string[];   // Item IDs sorted by ppgMax descending
}

export interface WeightPricingItem {
  id: string;                  // refNum
  usd: number;                 // Variant price
  ppg: number;                 // Price per gram
  cat: string;                 // Category
  d: string;                   // Variant description
}

export interface WeightPricingFile {
  weight: number;
  tolerance: number;
  updatedAt: string;
  itemCount: number;
  items: WeightPricingItem[];  // Sorted by ppg ascending
}

interface ItemVariant {
  d?: string;
  dEn?: string;
  usd?: number;
  price?: number;
}

interface IndexItem {
  refNum?: string;
  id?: string | number;
  c?: string;
  category?: string;
  v?: ItemVariant[];
  variants?: ItemVariant[];
}

/**
 * Process a single market and generate pricing aggregates
 */
export async function processPricingForMarket(market: MarketCode): Promise<{
  itemCount: number;
  weightCounts: Record<number, number>;
}> {
  const env = loadEnv();
  const storeName = (env.stores as Record<string, string>)[market];
  const blob = getBlobClient(storeName);
  
  log.pricing.info(`loading index`, { market });
  const index = await blob.getJSON<IndexItem[]>(Keys.market.index(market)) || [];
  log.pricing.info(`loaded items`, { market, count: index.length });
  
  // Collect all pricing data
  const summaryItems: Record<string, PricingSummaryItem> = {};
  const weightBuckets: Record<number, WeightPricingItem[]> = {};
  
  // Initialize weight buckets
  for (const bp of WEIGHT_BREAKPOINTS) {
    weightBuckets[bp.grams] = [];
  }
  
  for (const item of index) {
    const refNum = String(item.refNum || item.id || '');
    if (!refNum) continue;
    
    const category = item.c || item.category || 'Unknown';
    const variants = item.v || item.variants || [];
    
    // Skip if not a gram-based category
    if (!isGramBasedCategory(category)) {
      summaryItems[refNum] = {
        ppgMin: null,
        ppgMax: null,
        weights: [],
        unit: 'item',
        cat: category,
      };
      continue;
    }
    
    // Parse all variants and calculate ppg
    const gramVariants: Array<{
      d: string;
      qty: number;
      usd: number;
      ppg: number;
      weight: number | null;
    }> = [];
    
    for (const v of variants) {
      const desc = v.dEn || v.d || '';
      const usd = v.usd ?? v.price ?? 0;
      if (!desc || usd <= 0) continue;
      
      const parsed = parseQuantity(desc);
      if (!parsed || parsed.unit !== 'g' || parsed.qty <= 0) continue;
      
      const ppg = usd / parsed.qty;
      const matchedWeight = matchWeightBreakpoint(parsed.qty);
      
      gramVariants.push({
        d: desc,
        qty: parsed.qty,
        usd,
        ppg,
        weight: matchedWeight,
      });
      
      // Add to weight bucket if matched
      if (matchedWeight !== null) {
        weightBuckets[matchedWeight].push({
          id: refNum,
          usd,
          ppg,
          cat: category,
          d: desc,
        });
      }
    }
    
    if (gramVariants.length === 0) {
      summaryItems[refNum] = {
        ppgMin: null,
        ppgMax: null,
        weights: [],
        unit: 'g',
        cat: category,
      };
      continue;
    }
    
    // Calculate min/max ppg and available weights
    const ppgValues = gramVariants.map(v => v.ppg);
    const weights = [...new Set(gramVariants.map(v => v.weight).filter((w): w is number => w !== null))];
    
    summaryItems[refNum] = {
      ppgMin: Math.min(...ppgValues),
      ppgMax: Math.max(...ppgValues),
      weights: weights.sort((a, b) => a - b),
      unit: 'g',
      cat: category,
    };
  }
  
  // Sort items by ppg for summary
  const itemsWithPpg = Object.entries(summaryItems)
    .filter(([, data]) => data.ppgMin !== null)
    .map(([id, data]) => ({ id, ppg: data.ppgMin! }));
  
  const sortedByPpgAsc = itemsWithPpg
    .sort((a, b) => a.ppg - b.ppg)
    .map(x => x.id);
  
  const sortedByPpgDesc = [...sortedByPpgAsc].reverse();
  
  // Build summary
  const summary: PricingSummary = {
    updatedAt: new Date().toISOString(),
    itemCount: Object.keys(summaryItems).length,
    items: summaryItems,
    sortedByPpgAsc,
    sortedByPpgDesc,
  };
  
  // Write summary
  await blob.putJSON(Keys.market.aggregates.pricingSummary(), summary);
  log.pricing.info(`wrote summary`, { market, items: summary.itemCount, withPpg: sortedByPpgAsc.length });
  
  // Write weight files
  const weightCounts: Record<number, number> = {};
  for (const bp of WEIGHT_BREAKPOINTS) {
    const items = weightBuckets[bp.grams];
    // Sort by ppg ascending (cheapest first)
    items.sort((a, b) => a.ppg - b.ppg);
    
    const weightFile: WeightPricingFile = {
      weight: bp.grams,
      tolerance: bp.tolerance,
      updatedAt: new Date().toISOString(),
      itemCount: items.length,
      items,
    };
    
    await blob.putJSON(Keys.market.aggregates.pricingByWeight(bp.grams), weightFile);
    weightCounts[bp.grams] = items.length;
    log.pricing.info(`wrote weight file`, { market, weight: `${bp.grams}g`, items: items.length });
  }
  
  return {
    itemCount: index.length,
    weightCounts,
  };
}

/**
 * Run pricing stage for all specified markets
 */
export async function runPricing(markets: MarketCode[]): Promise<void> {
  log.pricing.info(`starting pricing stage`, { markets: markets.join(',') });
  const t0 = Date.now();
  
  const results: Record<string, { itemCount: number; weightCounts: Record<number, number> }> = {};
  
  for (const market of markets) {
    try {
      const result = await processPricingForMarket(market);
      results[market] = result;
    } catch (err: any) {
      log.pricing.error(`failed`, { market, error: err?.message || String(err) });
    }
  }
  
  const totalItems = Object.values(results).reduce((sum, r) => sum + r.itemCount, 0);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  
  log.pricing.info(`completed`, { 
    markets: Object.keys(results).length, 
    totalItems, 
    elapsed: `${elapsed}s` 
  });
}
