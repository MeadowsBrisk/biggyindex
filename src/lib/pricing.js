import { convertToGBP } from '@/hooks/useExchangeRates';

// Round to display convention (ceil with epsilon) used across site
export function roundDisplayGBP(v) {
  if (v == null || !isFinite(v)) return null;
  if (v === 0) return 0; // preserve free
  return Math.ceil(v - 1e-9);
}

// Format a single GBP amount already in base units
export function formatSingleGBP(amount) {
  if (amount === 0) return '£0'; // we rarely show 0 except shipping edge; keep explicit
  const r = roundDisplayGBP(amount);
  if (r == null) return '';
  return `£${r}`;
}

// Compute GBP min/max from a list of USD (or mixed currency if future expansion) amounts.
// current assumption: all values passed are USD unless flagged otherwise.
export function computeUsdListGBPRange(values, rates) {
  if (!Array.isArray(values) || values.length === 0) return { min: null, max: null, ready: true };
  let min = Infinity, max = 0;
  let needsRates = false;
  for (const raw of values) {
    if (typeof raw !== 'number' || !isFinite(raw)) continue;
    if (raw === 0) { // treat zero as GBP 0 even if rates absent
      min = Math.min(min, 0);
      max = Math.max(max, 0);
      continue;
    }
    const gbp = convertToGBP(raw, 'USD', rates);
    if (gbp == null) { needsRates = true; continue; }
    if (gbp < min) min = gbp;
    if (gbp > max) max = gbp;
  }
  if (min === Infinity || max === 0 && min !== 0) {
    // no convertible values yet
    return { min: null, max: null, ready: !needsRates };
  }
  // If we skipped some due to missing rates and no zero free values present, not ready
  if (needsRates && (min !== 0)) return { min: null, max: null, ready: false };
  return { min, max, ready: !needsRates || min === 0 };
}

export function formatGBPRange(min, max, { freeLabel = 'free' } = {}) {
  if (min == null && max == null) return '';
  if (min == null) min = max;
  if (max == null) max = min;
  const rMin = roundDisplayGBP(min);
  const rMax = roundDisplayGBP(max);
  if (rMin == null || rMax == null) return '';
  const a = rMin === 0 ? freeLabel : `£${rMin}`;
  const b = rMax === 0 ? freeLabel : `£${rMax}`;
  if (rMin === rMax) return a;
  return `${a} - ${b}`;
}

// Helper for shipping display taking USD min/max and producing formatted label or '' while waiting.
export function formatUsdShippingRange(minShip, maxShip, rates, { freeLabel='free' } = {}) {
  if (minShip == null && maxShip == null) return '';
  if (typeof minShip !== 'number' || !isFinite(minShip)) minShip = null;
  if (typeof maxShip !== 'number' || !isFinite(maxShip)) maxShip = null;
  if (minShip == null && maxShip == null) return '';
  const values = [];
  if (minShip != null) values.push(minShip);
  if (maxShip != null && maxShip !== minShip) values.push(maxShip);
  const { min, max, ready } = computeUsdListGBPRange(values, rates);
  if (!ready) {
    // Fallback: show raw USD numbers (treated as GBP temporarily) so user at least sees shipping cost immediately.
    // Once rates load, component re-renders with converted values.
    if (values.length === 0) return '';
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    return formatGBPRange(rawMin, rawMax, { freeLabel });
  }
  if (min == null && max == null) return '';
  return formatGBPRange(min, max, { freeLabel });
}
