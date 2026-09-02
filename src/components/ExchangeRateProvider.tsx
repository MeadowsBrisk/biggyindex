"use client";

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { FALLBACK_USD_RATES } from "@/lib/market/rates";
import { exchangeRatesAtom } from "@/store/atoms";

/**
 * Fetches live exchange rates and populates the Jotai atom.
 * Renders nothing — mount once near app root.
 *
 * Fetches from our own API route (which proxies open.er-api.com with edge caching).
 * Falls back to the shared approximate rates if the fetch fails.
 */

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
          setRates(FALLBACK_USD_RATES);
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
