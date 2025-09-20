import { useEffect, useState } from 'react';

// Simple shared cache with basic TTL to avoid many network calls & layout thrash
let cachedRates = null;
let cachedAt = 0;
let inFlight = null;
const TTL = 60 * 60 * 1000; // 1 hour

function fetchRates() {
  if (cachedRates && Date.now() - cachedAt < TTL) return Promise.resolve(cachedRates);
  if (inFlight) return inFlight;
  inFlight = fetch('https://open.er-api.com/v6/latest/GBP')
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
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
const _prefetch = fetchRates();

export function useExchangeRates() {
  const [rates, setRates] = useState(() => {
    if (cachedRates && Date.now() - cachedAt < TTL) return cachedRates;
    return null;
  });
  useEffect(() => {
    if (rates) return; // already have fresh
    let cancelled = false;
    fetchRates().then(r => { if (!cancelled && r) setRates(r); });
    return () => { cancelled = true; };
  }, [rates]);
  return rates;
}

export function convertToGBP(amount, currency, rates) {
  if (typeof amount !== 'number' || !isFinite(amount)) return null;
  if (!currency) return null;
  if (currency === 'GBP') return amount;
  if (!rates || !rates[currency]) return null;
  // API gives base GBP, rates[currency] = currency value per GBP? Actually API latest/GBP: rates maps currency->rate (1 GBP = X currency). So to convert amount in foreign currency to GBP: gbp = amount / rate.
  const rate = rates[currency];
  if (typeof rate !== 'number' || rate === 0) return null;
  return amount / rate;
}
