"use client";
import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { exchangeRatesAtom } from '@/store/atoms';
import { useExchangeRates } from '@/hooks/useExchangeRates';

/**
 * Hydrates the exchange rates atom with fetched rates.
 * Should be mounted once at the app level.
 */
export default function FXHydrator(): null {
  const setRates = useSetAtom(exchangeRatesAtom);
  const rates = useExchangeRates();
  
  useEffect(() => {
    if (rates) setRates(rates);
  }, [rates, setRates]);
  
  return null;
}
