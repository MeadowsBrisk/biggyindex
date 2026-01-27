"use client";
import { useCallback } from "react";
import { formatMoney, type DisplayCurrency } from '@/lib/pricing/priceDisplay';

// Re-export from shared module - SINGLE SOURCE OF TRUTH
// This ensures all parseQuantity logic is maintained in one place
export {
  parseQuantity,
  normalizeCountLabel,
  detectImplicitUnit,
  isGramBasedCategory,
  matchWeightBreakpoint,
  GRAM_BASED_CATEGORIES,
  WEIGHT_BREAKPOINTS,
  type ParsedQuantity,
} from '@/lib/pricing/parseQuantity';

import { parseQuantity } from '@/lib/pricing/parseQuantity';

/**
 * Calculate per-unit price suffix like " (£10/g)" or " ($10/g)".
 * Pure function - can be used without the hook.
 * @param unitLabels - Optional map of canonical unit → display label (for i18n)
 */
export function perUnitSuffix(
  description: string | null | undefined,
  priceAmount: number | null | undefined,
  currency: DisplayCurrency = 'GBP',
  unitLabels?: Record<string, string>
): string | null {
  if (priceAmount == null || !isFinite(priceAmount)) return null;
  const parsed = parseQuantity(description);
  if (!parsed || !(parsed.qty > 0)) return null;
  const { unit, qty } = parsed;
  // If it's exactly 1 item, skip showing a redundant per-item price
  if (unit === 'item' && qty === 1) return null;
  const per = priceAmount / qty;
  if (!isFinite(per)) return null;
  const money = formatMoney(per, currency, { decimals: 2 });
  const displayUnit = unitLabels?.[unit] ?? unit;
  return ` (${money}/${displayUnit})`;
}

/**
 * Hook wrapper for perUnitSuffix with i18n support.
 * Pass unitLabels from useTranslations('Units').raw('') or similar.
 */
export function usePerUnitLabel(unitLabels?: Record<string, string>) {
  const perUnitSuffixFn = useCallback(
    (description: string | null | undefined, priceAmount: number | null | undefined, currency: DisplayCurrency = 'GBP') =>
      perUnitSuffix(description, priceAmount, currency, unitLabels),
    [unitLabels]
  );

  return { perUnitSuffix: perUnitSuffixFn };
}
