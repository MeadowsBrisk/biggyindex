"use client";
import { useEffect, useState } from 'react';

export type ExchangeRates = Record<string, number>;

// Simple shared cache with basic TTL to avoid many network calls & layout thrash
let cachedRates: ExchangeRates | null = null;
let cachedAt = 0;
let inFlight: Promise<ExchangeRates | null> | null = null;
const TTL = 60 * 60 * 1000; // 1 hour

function fetchRates(): Promise<ExchangeRates | null> {
  if (cachedRates && Date.now() - cachedAt < TTL) {
    return Promise.resolve(cachedRates);
  }
  if (inFlight) return inFlight;
  
  inFlight = fetch('https://open.er-api.com/v6/latest/GBP')
    .then(r => (r.ok ? r.json() : null))
    .then((data: { rates?: ExchangeRates } | null) => {
      const rates = data?.rates || null;
      if (rates) {
        cachedRates = rates;
        cachedAt = Date.now();
      }
      return cachedRates;
    })
    .catch(() => cachedRates)
    .finally(() => { inFlight = null; });
  
  return inFlight;
}

// Kick off prefetch immediately on module import (one fetch per refresh)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _prefetch = fetchRates();

/**
 * Hook to fetch and cache exchange rates with GBP as base currency.
 * Returns null while loading, then the rates object.
 */
export function useExchangeRates(): ExchangeRates | null {
  const [rates, setRates] = useState<ExchangeRates | null>(() => {
    if (cachedRates && Date.now() - cachedAt < TTL) return cachedRates;
    return null;
  });
  
  useEffect(() => {
    if (rates) return; // already have fresh
    let cancelled = false;
    fetchRates().then(r => { 
      if (!cancelled && r) setRates(r); 
    });
    return () => { cancelled = true; };
  }, [rates]);
  
  return rates;
}

/**
 * Convert an amount from a given currency to GBP using the provided rates.
 * Returns null if conversion isn't possible.
 */
export function convertToGBP(
  amount: number | null | undefined, 
  currency: string | null | undefined, 
  rates: ExchangeRates | null
): number | null {
  if (typeof amount !== 'number' || !isFinite(amount)) return null;
  if (!currency) return null;
  if (currency === 'GBP') return amount;
  if (!rates || !rates[currency]) return null;
  
  // API gives base GBP: rates[currency] = how many units of currency equal 1 GBP
  // So to convert amount in foreign currency to GBP: gbp = amount / rate
  const rate = rates[currency];
  if (typeof rate !== 'number' || rate === 0) return null;
  
  return amount / rate;
}
