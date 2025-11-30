import { formatUSD, formatUSDRange, convertUSDToDisplay, type DisplayCurrency, type ExchangeRates } from '@/lib/priceDisplay';

// Compute displayed USD amount for a variant given shipping allocation rules
export function displayedUSDForVariant(baseUsd: number | null | undefined, shippingUsd: number | null | undefined, includeShipping: boolean, selectedVariantIds: Set<string | number> | null | undefined, variantId: string | number) {
  if (typeof baseUsd !== 'number' || !isFinite(baseUsd)) return null;
  let amount = baseUsd;
  if (includeShipping && typeof shippingUsd === 'number' && isFinite(shippingUsd)) {
    const count = selectedVariantIds && typeof (selectedVariantIds as any).size === 'number' ? (selectedVariantIds as any).size : 0;
    if (count === 0) amount += shippingUsd;
    else if ((selectedVariantIds as any).has(variantId)) amount += (shippingUsd / count);
  }
  return amount;
}

// Compute displayed amount in the target currency ('USD' or 'GBP')
export function displayedAmount({ baseUsd, currency = 'GBP', rates, shippingUsd, includeShipping, selectedVariantIds, variantId }: { baseUsd: number | null | undefined; currency?: DisplayCurrency; rates: ExchangeRates; shippingUsd: number | null | undefined; includeShipping: boolean; selectedVariantIds: Set<string | number> | null | undefined; variantId: string | number }) {
  if (currency === 'USD') {
    return displayedUSDForVariant(baseUsd, shippingUsd, includeShipping, selectedVariantIds, variantId);
  }
  // Generic path for GBP/EUR using GBP-based rates
  const base = convertUSDToDisplay(baseUsd as any, currency, rates);
  if (typeof base !== 'number' || !isFinite(base)) return null;
  let amount = base;
  if (includeShipping && typeof shippingUsd === 'number' && isFinite(shippingUsd)) {
    const ship = shippingUsd === 0 ? 0 : convertUSDToDisplay(shippingUsd, currency, rates);
    if (typeof ship === 'number' && isFinite(ship)) {
      const count = selectedVariantIds && typeof (selectedVariantIds as any).size === 'number' ? (selectedVariantIds as any).size : 0;
      if (count === 0) amount += ship;
      else if ((selectedVariantIds as any).has(variantId)) amount += (ship / count);
    }
  }
  return amount;
}

// Compute range text for the current currency using displayed amounts
// Uses minified keys (usd, vid)
export function variantRangeText({ variants, displayCurrency = 'GBP', rates, shippingUsd, includeShipping, selectedVariantIds }:{ variants: Array<{ id?: string|number; vid?: string|number; baseAmount?: number|null; usd?: number|null }>|null|undefined; displayCurrency?: DisplayCurrency; rates: ExchangeRates; shippingUsd: number | null | undefined; includeShipping: boolean; selectedVariantIds: Set<string|number> | null | undefined }): string {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  // Compute range in USD first, then format with chosen currency via formatUSDRange
  const amountsUSD: number[] = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i] as any;
    const vid = v.vid ?? v.id ?? i;
    const baseUsd = (typeof v.usd === 'number' && isFinite(v.usd)) ? v.usd : null;
    if (baseUsd == null) continue;
    const amtUsd = displayedUSDForVariant(baseUsd, shippingUsd as any, includeShipping, selectedVariantIds as any, vid);
    if (typeof amtUsd === 'number' && isFinite(amtUsd)) amountsUSD.push(amtUsd);
  }
  if (amountsUSD.length === 0) return '';
  const minUSD = Math.min(...amountsUSD);
  const maxUSD = Math.max(...amountsUSD);
  return formatUSDRange(minUSD, maxUSD, displayCurrency, rates, { decimals: 2 });
}

// Format a single displayed amount into text for the UI
export function formatDisplayedAmount({ baseUsd, displayCurrency = 'GBP', rates, shippingUsd, includeShipping, selectedVariantIds, variantId }:{ baseUsd: number|null|undefined; displayCurrency?: DisplayCurrency; rates: ExchangeRates; shippingUsd: number|null|undefined; includeShipping: boolean; selectedVariantIds: Set<string|number>|null|undefined; variantId: string|number }): string {
  // Compute and format generically via USD base
  const amtUSD = displayedUSDForVariant(baseUsd, shippingUsd, includeShipping, selectedVariantIds as any, variantId);
  if (amtUSD == null) return '…';
  // For exact variant prices in overlay/selectors, keep cents for non-USD
  return formatUSD(amtUSD, displayCurrency, rates, { decimals: 2, ceilNonUSD: false });
}
