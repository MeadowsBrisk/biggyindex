/**
 * Types for price-per-gram pricing aggregates
 */

export interface PricingSummaryItem {
  ppgMin: number | null;       // Lowest price-per-gram
  ppgMax: number | null;       // Highest price-per-gram
  weights: number[];           // Available weight breakpoints [1, 3.5, 7, 14, 28]
  unit: 'g' | 'ml' | 'item' | 'mixed';
  cat: string;                 // Category
}

export interface PricingSummary {
  updatedAt: string;
  itemCount: number;
  items: Record<string, PricingSummaryItem>;  // refNum → pricing data
  sortedByPpgAsc: string[];    // Item IDs sorted by ppgMin ascending
  sortedByPpgDesc: string[];   // Item IDs sorted by ppgMax descending
}

export interface WeightPricingItem {
  id: string;                  // refNum
  usd: number;                 // Variant price in USD
  ppg: number;                 // Price per gram
  cat: string;                 // Category
  d: string;                   // Variant description
}

export interface WeightPricingFile {
  weight: number;              // 1, 3.5, 7, 14, 28
  tolerance: number;
  updatedAt: string;
  itemCount: number;
  items: WeightPricingItem[];  // Sorted by ppg ascending
}

// Valid weight breakpoints (all categories)
export const WEIGHT_BREAKPOINTS = [1, 3.5, 7, 14, 28, 50, 100] as const;
export type WeightBreakpoint = typeof WEIGHT_BREAKPOINTS[number];

// Flower weights (oz labels for 28g only)
export const FLOWER_WEIGHTS: readonly WeightBreakpoint[] = [1, 3.5, 7, 14, 28];

// Concentrates weights (grams only, smaller amounts)
export const CONCENTRATES_WEIGHTS: readonly WeightBreakpoint[] = [1, 3.5, 7, 14, 28];

// Hash includes 50g and 100g bulk options
export const HASH_WEIGHTS: readonly WeightBreakpoint[] = [1, 3.5, 7, 14, 28, 50, 100];

// Get weights for a specific category
export function getWeightsForCategory(category: string): readonly WeightBreakpoint[] {
  if (category === 'Hash') return HASH_WEIGHTS;
  if (category === 'Concentrates') return CONCENTRATES_WEIGHTS;
  return FLOWER_WEIGHTS;
}

// Labels - category-specific via getWeightLabel()
export const WEIGHT_LABELS_GRAMS: Record<WeightBreakpoint, string> = {
  1: '1g',
  3.5: '3.5g',
  7: '7g',
  14: '14g',
  28: '28g',
  50: '50g',
  100: '100g',
};

// Flower uses oz for 28g
export const WEIGHT_LABELS_FLOWER: Record<WeightBreakpoint, string> = {
  1: '1g',
  3.5: '3.5g',
  7: '7g',
  14: '14g',
  28: '28g/1oz',
  50: '50g',
  100: '100g',
};

// Get label for weight based on category
export function getWeightLabel(weight: WeightBreakpoint, category: string): string {
  if (category === 'Flower') return WEIGHT_LABELS_FLOWER[weight];
  return WEIGHT_LABELS_GRAMS[weight];
}

// Legacy - keep for backwards compat
export const WEIGHT_LABELS = WEIGHT_LABELS_GRAMS;

// Categories that support ppg sorting
export const PPG_CATEGORIES = ['Flower', 'Hash', 'Concentrates'] as const;
export type PpgCategory = typeof PPG_CATEGORIES[number];

export function isPpgCategory(category: string): category is PpgCategory {
  return (PPG_CATEGORIES as readonly string[]).includes(category);
}
