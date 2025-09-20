"use client";
import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { exchangeRatesAtom } from '@/store/atoms';
import { useExchangeRates } from '@/hooks/useExchangeRates';

export default function FXHydrator() {
  const setRates = useSetAtom(exchangeRatesAtom);
  const rates = useExchangeRates();
  useEffect(() => {
    if (rates) setRates(rates);
  }, [rates, setRates]);
  return null;
}

