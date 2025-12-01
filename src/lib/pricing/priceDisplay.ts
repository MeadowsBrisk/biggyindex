import { convertToGBP } from '@/hooks/useExchangeRates';

export type DisplayCurrency = 'GBP' | 'USD' | 'EUR';
export type ExchangeRates = Record<string, number> | null | undefined; // GBP-based: rates.USD = USD per GBP

// Currency symbol from display code
export function currencySymbol(displayCurrency: DisplayCurrency = 'GBP'): string {
  if (displayCurrency === 'USD') return '$';
  if (displayCurrency === 'EUR') return '€';
  return '£';
}

// Convert an amount expressed in USD into the chosen display currency (number or null if not ready)
export function convertUSDToDisplay(amountUSD: number | null | undefined, displayCurrency: DisplayCurrency, rates: ExchangeRates): number | null {
  if (typeof amountUSD !== 'number' || !isFinite(amountUSD)) return null;
  if (displayCurrency === 'USD') return amountUSD;
  // Convert USD -> GBP first
  const gbp = convertToGBP(amountUSD, 'USD', rates as any);
  if (typeof gbp !== 'number' || !isFinite(gbp)) return null;
  if (displayCurrency === 'GBP') return gbp;
  if (displayCurrency === 'EUR') {
    const eurRate = (rates as any)?.EUR;
    if (typeof eurRate === 'number' && eurRate > 0) return gbp * eurRate;
    return null;
  }
  // Fallback: treat like GBP
  return gbp;
}

// Format a numeric amount with currency symbol and fixed decimals
export function formatMoney(amount: number, displayCurrency: DisplayCurrency = 'GBP', { decimals = 2 }: { decimals?: number } = {}): string {
  if (typeof amount !== 'number' || !isFinite(amount)) return '';
  const sym = currencySymbol(displayCurrency);
  let str = amount.toFixed(decimals);
  // Trim trailing .00 for cleaner display (keep other fractional parts like .50)
  if (decimals > 0 && /\.0+$/.test(str)) str = str.replace(/\.0+$/, '');
  return `${sym}${str}`;
}

// Format a USD-denominated amount in the chosen display currency, optionally treating zero as free
export function formatUSD(
  amountUSD: number | null | undefined,
  displayCurrency: DisplayCurrency,
  rates: ExchangeRates,
  { zeroIsFree = false, freeLabel = 'free', decimals = 2, ceilNonUSD = true }: { zeroIsFree?: boolean; freeLabel?: string; decimals?: number; ceilNonUSD?: boolean } = {}
): string {
  if (typeof amountUSD !== 'number' || !isFinite(amountUSD)) return '';
  if (zeroIsFree && amountUSD === 0) return freeLabel;
  const amt = convertUSDToDisplay(amountUSD, displayCurrency, rates);
  if (amt == null) return '';
  // Rounding policy: USD keeps cents; GBP/EUR round up to whole units by default
  if (displayCurrency === 'USD') {
    return formatMoney(amt, 'USD', { decimals });
  }
  if (!ceilNonUSD) {
    return formatMoney(amt, displayCurrency, { decimals });
  }
  // Default: ceil to integer with epsilon to avoid floating errors
  const rounded = Math.ceil(amt - 1e-9);
  return formatMoney(rounded, displayCurrency, { decimals: 0 });
}

// Format a range from USD min/max into chosen currency, optionally labeling zero as free
export function formatUSDRange(
  minUSD: number | null | undefined,
  maxUSD: number | null | undefined,
  displayCurrency: DisplayCurrency,
  rates: ExchangeRates,
  { zeroIsFree = false, freeLabel = 'free', decimals = 2, ceilNonUSD = true }: { zeroIsFree?: boolean; freeLabel?: string; decimals?: number; ceilNonUSD?: boolean } = {}
): string {
  const vals: number[] = [];
  if (typeof minUSD === 'number' && isFinite(minUSD)) vals.push(minUSD);
  if (typeof maxUSD === 'number' && isFinite(maxUSD)) vals.push(maxUSD);
  if (vals.length === 0) return '';
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  if (zeroIsFree && mn === 0 && mx === 0) return freeLabel;
  const a0 = convertUSDToDisplay(mn, displayCurrency, rates);
  const b0 = convertUSDToDisplay(mx, displayCurrency, rates);
  if (a0 == null || b0 == null) return '';
  if (displayCurrency === 'USD') {
    const a = Math.min(a0, b0);
    const b = Math.max(a0, b0);
    return a === b ? formatMoney(a, 'USD', { decimals }) : `${formatMoney(a, 'USD', { decimals })} - ${formatMoney(b, 'USD', { decimals })}`;
  }
  // GBP/EUR: either keep cents or ceil to whole units
  if (!ceilNonUSD) {
    const a = Math.min(a0, b0);
    const b = Math.max(a0, b0);
    return a === b ? formatMoney(a, displayCurrency, { decimals }) : `${formatMoney(a, displayCurrency, { decimals })} - ${formatMoney(b, displayCurrency, { decimals })}`;
  }
  const a = Math.ceil(Math.min(a0, b0) - 1e-9);
  const b = Math.ceil(Math.max(a0, b0) - 1e-9);
  return a === b ? formatMoney(a, displayCurrency, { decimals: 0 }) : `${formatMoney(a, displayCurrency, { decimals: 0 })} - ${formatMoney(b, displayCurrency, { decimals: 0 })}`;
}

// Convert an amount expressed in GBP into the chosen display currency (number or null if not ready)
export function convertGBPToDisplay(amountGBP: number | null | undefined, displayCurrency: DisplayCurrency, rates: ExchangeRates): number | null {
  if (typeof amountGBP !== 'number' || !isFinite(amountGBP)) return null;
  if (displayCurrency === 'GBP') return amountGBP;
  if (displayCurrency === 'USD') {
    const r = (rates as any)?.USD;
    if (typeof r === 'number' && r > 0) return amountGBP * r;
    return null;
  }
  if (displayCurrency === 'EUR') {
    const r = (rates as any)?.EUR;
    if (typeof r === 'number' && r > 0) return amountGBP * r;
    return null;
  }
  return amountGBP;
}

// Format a GBP-denominated amount in the chosen display currency
export function formatGBP(
  amountGBP: number | null | undefined,
  displayCurrency: DisplayCurrency,
  rates: ExchangeRates,
  { zeroIsFree = false, freeLabel = 'free', decimals = 2 }: { zeroIsFree?: boolean; freeLabel?: string; decimals?: number } = {}
): string {
  if (typeof amountGBP !== 'number' || !isFinite(amountGBP)) return '';
  if (zeroIsFree && amountGBP === 0) return freeLabel;
  if (displayCurrency === 'GBP') return formatMoney(amountGBP, 'GBP', { decimals });
  const amt = convertGBPToDisplay(amountGBP, displayCurrency, rates);
  if (amt == null) return '';
  return formatMoney(amt, displayCurrency, { decimals });
}

// ============================================================================
// Legacy GBP-centric helpers (merged from pricing.ts for backward compatibility)
// ============================================================================

// Round to display convention (ceil with epsilon) used across site
export function roundDisplayGBP(v: number | null | undefined): number | null {
  if (v == null || !isFinite(v as number)) return null;
  if (v === 0) return 0; // preserve free
  return Math.ceil((v as number) - 1e-9);
}

// Format a single GBP amount already in base units
export function formatSingleGBP(amount: number | null | undefined): string {
  if (amount === 0) return '£0';
  const r = roundDisplayGBP(amount as number);
  if (r == null) return '';
  return `£${r}`;
}

// Compute GBP min/max from a list of USD amounts
export function computeUsdListGBPRange(values: Array<number | null | undefined>, rates: ExchangeRates) {
  if (!Array.isArray(values) || values.length === 0) return { min: null as number | null, max: null as number | null, ready: true };
  let min = Infinity, max = 0;
  let needsRates = false;
  for (const raw of values) {
    if (typeof raw !== 'number' || !isFinite(raw)) continue;
    if (raw === 0) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
      continue;
    }
    const gbp = convertToGBP(raw, 'USD', rates as any);
    if (gbp == null) { needsRates = true; continue; }
    if (gbp < min) min = gbp;
    if (gbp > max) max = gbp;
  }
  if (min === Infinity || (max === 0 && min !== 0)) {
    return { min: null as number | null, max: null as number | null, ready: !needsRates };
  }
  if (needsRates && (min !== 0)) return { min: null as number | null, max: null as number | null, ready: false };
  return { min, max, ready: !needsRates || min === 0 };
}

// Format a GBP range (legacy helper)
export function formatGBPRange(min: number | null | undefined, max: number | null | undefined, { freeLabel = 'free' }: { freeLabel?: string } = {}) {
  if (min == null && max == null) return '';
  if (min == null) min = max as number | null | undefined;
  if (max == null) max = min as number | null | undefined;
  const rMin = roundDisplayGBP(min as number);
  const rMax = roundDisplayGBP(max as number);
  if (rMin == null || rMax == null) return '';
  const a = rMin === 0 ? freeLabel : `£${rMin}`;
  const b = rMax === 0 ? freeLabel : `£${rMax}`;
  if (rMin === rMax) return a;
  return `${a} - ${b}`;
}

// Helper for shipping display taking USD min/max and producing formatted label
export function formatUsdShippingRange(minShip: number | null | undefined, maxShip: number | null | undefined, rates: ExchangeRates, { freeLabel = 'free' }: { freeLabel?: string } = {}) {
  if (minShip == null && maxShip == null) return '';
  if (typeof minShip !== 'number' || !isFinite(minShip)) minShip = null;
  if (typeof maxShip !== 'number' || !isFinite(maxShip)) maxShip = null;
  if (minShip == null && maxShip == null) return '';
  const values: number[] = [];
  if (minShip != null) values.push(minShip);
  if (maxShip != null && maxShip !== minShip) values.push(maxShip);
  const { min, max, ready } = computeUsdListGBPRange(values, rates);
  if (!ready) {
    if (values.length === 0) return '';
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    return formatGBPRange(rawMin, rawMax, { freeLabel });
  }
  if (min == null && max == null) return '';
  return formatGBPRange(min as number, max as number, { freeLabel });
}

