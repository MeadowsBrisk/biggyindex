"use client";

import { useAtomValue } from "jotai";
import { useSyncExternalStore } from "react";
import type { ServerCurrency } from "@/lib/market/currency";
import {
  currencyDisplayAtom,
  displayCurrencyOverrideAtom,
  exchangeRatesAtom,
} from "@/store/atoms";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Server-resolved currency until the user's override has a loaded rate, so the
 * first client render matches the SSR prices.
 */
export function useDisplayCurrency(server: ServerCurrency): {
  symbol: string;
  rate: number;
} {
  const chosen = useAtomValue(currencyDisplayAtom);
  const override = useAtomValue(displayCurrencyOverrideAtom);
  const rates = useAtomValue(exchangeRatesAtom);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (!mounted || override == null || override === server.code) return server;
  const overrideRate = rates[override];
  const rateReady =
    override === "USD" ||
    (typeof overrideRate === "number" && overrideRate > 0);
  return rateReady ? chosen : server;
}
