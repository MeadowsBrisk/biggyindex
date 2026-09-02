/**
 * Approximate USD-base exchange rates, used when the live lookup is
 * unavailable. Shared by the client provider (ExchangeRateProvider) and the
 * server-side resolver (lib/market/currency.ts) so both sides fall back to
 * the same numbers instead of drifting apart.
 *
 * Deliberately coarse: they only have to keep a price in the right ballpark
 * — and, crucially, in the right currency — until live rates land.
 */
export const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  GBP: 0.79,
  EUR: 0.92,
  CZK: 23,
  PLN: 4,
};
