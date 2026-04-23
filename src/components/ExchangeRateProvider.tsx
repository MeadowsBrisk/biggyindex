"use client";

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { exchangeRatesAtom } from "@/store/atoms";

/**
 * Fetches live exchange rates and populates the Jotai atom.
 * Renders nothing — mount once near app root.
 *
 * Fetches from our own API route (which proxies open.er-api.com with edge caching).
 * Falls back to hardcoded rates if fetch fails.
 */

const FALLBACK_RATES: Record<string, number> = {
  GBP: 0.79,
  EUR: 0.92,
  USD: 1,
};

export function ExchangeRateProvider() {
  const setRates = useSetAtom(exchangeRatesAtom);

  useEffect(() => {
    let cancelled = false;

    async function fetchRates() {
      try {
        const res = await fetch("/api/exchange-rates");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled && data?.rates) {
          setRates(data.rates);
        }
      } catch {
        if (!cancelled) {
          setRates(FALLBACK_RATES);
        }
      }
    }

    fetchRates();
    return () => {
      cancelled = true;
    };
  }, [setRates]);

  return null;
}
