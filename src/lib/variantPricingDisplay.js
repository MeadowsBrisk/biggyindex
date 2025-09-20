import { convertToGBP } from '@/hooks/useExchangeRates';
import { formatUSD, formatUSDRange } from '@/lib/priceDisplay';
import { formatGBPRange } from '@/lib/pricing';

// Compute displayed USD amount for a variant given shipping allocation rules
export function displayedUSDForVariant(baseUsd, shippingUsd, includeShipping, selectedVariantIds, variantId) {
  if (typeof baseUsd !== 'number' || !isFinite(baseUsd)) return null;
  let amount = baseUsd;
  if (includeShipping && typeof shippingUsd === 'number' && isFinite(shippingUsd)) {
    const count = selectedVariantIds && typeof selectedVariantIds.size === 'number' ? selectedVariantIds.size : 0;
    if (count === 0) amount += shippingUsd;
    else if (selectedVariantIds.has(variantId)) amount += (shippingUsd / count);
  }
  return amount;
}

// Compute displayed amount in the target currency ('USD' or 'GBP')
export function displayedAmount({ baseUsd, currency = 'GBP', rates, shippingUsd, includeShipping, selectedVariantIds, variantId }) {
  if (currency === 'USD') {
    return displayedUSDForVariant(baseUsd, shippingUsd, includeShipping, selectedVariantIds, variantId);
  }
  // GBP path
  if (typeof baseUsd !== 'number' || !isFinite(baseUsd)) return null;
  const baseGbp = convertToGBP(baseUsd, 'USD', rates);
  if (typeof baseGbp !== 'number' || !isFinite(baseGbp)) return null;
  let amount = baseGbp;
  if (includeShipping && typeof shippingUsd === 'number' && isFinite(shippingUsd)) {
    const shipGbp = shippingUsd === 0 ? 0 : convertToGBP(shippingUsd, 'USD', rates);
    if (typeof shipGbp === 'number' && isFinite(shipGbp)) {
      const count = selectedVariantIds && typeof selectedVariantIds.size === 'number' ? selectedVariantIds.size : 0;
      if (count === 0) amount += shipGbp;
      else if (selectedVariantIds.has(variantId)) amount += (shipGbp / count);
    }
  }
  return amount;
}

// Compute range text for the current currency using displayed amounts
export function variantRangeText({ variants, displayCurrency = 'GBP', rates, shippingUsd, includeShipping, selectedVariantIds }) {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  const amounts = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const vid = v.id || i;
    const baseUsd = (typeof v.baseAmount === 'number' && isFinite(v.baseAmount)) ? v.baseAmount : null;
    if (baseUsd == null) continue;
    const amt = displayedAmount({ baseUsd, currency: displayCurrency, rates, shippingUsd, includeShipping, selectedVariantIds, variantId: vid });
    if (typeof amt === 'number' && isFinite(amt)) amounts.push(amt);
  }
  if (amounts.length === 0) return '';
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  if (displayCurrency === 'USD') return formatUSDRange(min, max, 'USD', rates, { decimals: 2 });
  return formatGBPRange(min, max);
}

// Format a single displayed amount into text for the UI
export function formatDisplayedAmount({ baseUsd, displayCurrency = 'GBP', rates, shippingUsd, includeShipping, selectedVariantIds, variantId }) {
  const amt = displayedAmount({ baseUsd, currency: displayCurrency, rates, shippingUsd, includeShipping, selectedVariantIds, variantId });
  if (amt == null) return '…';
  if (displayCurrency === 'USD') return formatUSD(amt, 'USD', rates, { decimals: 2 });
  return `£${amt.toFixed(2).replace(/\.00$/, '')}`;
}
