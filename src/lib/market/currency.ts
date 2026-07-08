/**
 * Server-side currency conversion for SSR price rendering.
 *
 * Item prices are stored in USD. Client components convert via the
 * exchange-rate atoms (store/atoms.ts) fed by /api/exchange-rates, but
 * server-rendered pages (item detail) must do the same conversion or they
 * print raw USD numbers behind local currency symbols. The market → code
 * mapping here mirrors `marketNativeCurrency` in store/atoms.ts exactly.
 *
 * Rates come from the same upstream as /api/exchange-rates
 * (open.er-api.com, USD base) and are cached with the "config" profile.
 * When rates are unavailable the caller falls back to USD amounts with
 * "$" — never a wrong symbol on an unconverted number.
 */

import { cacheLife } from "next/cache";
import type { MarketCode } from "@/lib/market/market";

export type CurrencyCode = "USD" | "GBP" | "EUR" | "CZK" | "PLN";

/**
 * Market → native ISO 4217 currency code.
 * Mirrors `marketNativeCurrency` in store/atoms.ts — keep in sync.
 */
export const MARKET_CURRENCY_CODE: Record<MarketCode, CurrencyCode> = {
  GB: "GBP",
  IE: "EUR",
  DE: "EUR",
  FR: "EUR",
  PT: "EUR",
  IT: "EUR",
  ES: "EUR",
  GR: "EUR",
  CZ: "CZK",
  PL: "PLN",
};

/** Mirrors CURRENCY_SYMBOLS in store/atoms.ts. */
const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  CZK: "Kč",
  PLN: "zł",
};

/**
 * USD-base rates, cached server-side. Throws on upstream failure —
 * errors are not cached, so the next render retries instead of pinning
 * a failed lookup for the whole "config" window.
 */
async function fetchUsdRates(): Promise<Partial<Record<CurrencyCode, number>>> {
  "use cache";
  cacheLife("config");

  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) {
    throw new Error(`Exchange rate fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { rates?: Record<string, unknown> };
  const upstream = data?.rates;
  if (!upstream || typeof upstream !== "object") {
    throw new Error("Invalid exchange rate data");
  }

  const rates: Partial<Record<CurrencyCode, number>> = {};
  for (const code of Object.keys(CURRENCY_SYMBOLS) as CurrencyCode[]) {
    const rate = upstream[code];
    if (typeof rate === "number" && rate > 0) rates[code] = rate;
  }
  return rates;
}

export interface ServerCurrency {
  /** ISO 4217 code — use for structured-data priceCurrency (never a symbol). */
  code: CurrencyCode;
  symbol: string;
  /** Multiplier converting stored USD amounts → display currency. */
  rate: number;
}

/**
 * Resolve the display currency for a market with a live USD→native rate.
 * Falls back to USD ("$", rate 1) when the rate is unavailable, matching
 * the "never print a wrong symbol" rule for server-rendered prices.
 */
export async function getServerCurrency(
  market: MarketCode,
): Promise<ServerCurrency> {
  const code = MARKET_CURRENCY_CODE[market];
  if (code === "USD") return { code: "USD", symbol: "$", rate: 1 };

  try {
    const rates = await fetchUsdRates();
    const rate = rates[code];
    if (typeof rate === "number" && rate > 0) {
      return { code, symbol: CURRENCY_SYMBOLS[code], rate };
    }
  } catch {
    // Fall through to the USD fallback below.
  }
  return { code: "USD", symbol: "$", rate: 1 };
}
