import { convertToGBP } from '@/hooks/useExchangeRates';

// Currency symbol from display code
export function currencySymbol(displayCurrency = 'GBP') {
  return displayCurrency === 'USD' ? '$' : '£';
}

// Convert an amount expressed in USD into the chosen display currency (number or null if not ready)
export function convertUSDToDisplay(amountUSD, displayCurrency, rates) {
  if (typeof amountUSD !== 'number' || !isFinite(amountUSD)) return null;
  if (displayCurrency === 'USD') return amountUSD;
  // GBP path
  const gbp = convertToGBP(amountUSD, 'USD', rates);
  return typeof gbp === 'number' && isFinite(gbp) ? gbp : null;
}

// Format a numeric amount with currency symbol and fixed decimals
export function formatMoney(amount, displayCurrency = 'GBP', { decimals = 2 } = {}) {
  if (typeof amount !== 'number' || !isFinite(amount)) return '';
  const sym = currencySymbol(displayCurrency);
  let str = amount.toFixed(decimals);
  // Trim trailing .00 for cleaner display (keep other fractional parts like .50)
  if (decimals > 0 && /\.0+$/.test(str)) {
    str = str.replace(/\.0+$/, '');
  }
  return `${sym}${str}`;
}

// Format a USD-denominated amount in the chosen display currency, optionally treating zero as free
export function formatUSD(amountUSD, displayCurrency, rates, { zeroIsFree = false, freeLabel = 'free', decimals = 2 } = {}) {
  if (typeof amountUSD !== 'number' || !isFinite(amountUSD)) return '';
  if (zeroIsFree && amountUSD === 0) return freeLabel;
  const amt = convertUSDToDisplay(amountUSD, displayCurrency, rates);
  if (amt == null) return '…';
  return formatMoney(amt, displayCurrency, { decimals });
}

// Format a range from USD min/max into chosen currency, optionally labeling zero as free
export function formatUSDRange(minUSD, maxUSD, displayCurrency, rates, { zeroIsFree = false, freeLabel = 'free', decimals = 2 } = {}) {
  const vals = [];
  if (typeof minUSD === 'number' && isFinite(minUSD)) vals.push(minUSD);
  if (typeof maxUSD === 'number' && isFinite(maxUSD)) vals.push(maxUSD);
  if (vals.length === 0) return '';
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  if (zeroIsFree && mn === 0 && mx === 0) return freeLabel;
  const a = convertUSDToDisplay(mn, displayCurrency, rates);
  const b = convertUSDToDisplay(mx, displayCurrency, rates);
  if (a == null || b == null) return '…';
  const fa = formatMoney(a, displayCurrency, { decimals });
  const fb = formatMoney(b, displayCurrency, { decimals });
  return a === b ? fa : `${fa} - ${fb}`;
}
