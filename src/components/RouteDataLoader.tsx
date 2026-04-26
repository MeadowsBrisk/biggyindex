"use client";

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import type { Seller } from "@/lib/types";
import {
  currencySymbolAtom,
  dataLoaderActiveAtom,
  marketAtom,
  setSellersAtom,
} from "@/store/atoms";

interface RouteDataLoaderProps {
  sellers?: Seller[];
  currencySymbol?: string;
  market?: string;
}

export function RouteDataLoader({
  sellers,
  currencySymbol,
  market,
}: RouteDataLoaderProps) {
  const setSellerData = useSetAtom(setSellersAtom);
  const setCurrencySymbol = useSetAtom(currencySymbolAtom);
  const setMarket = useSetAtom(marketAtom);
  const setDataLoaderActive = useSetAtom(dataLoaderActiveAtom);

  useEffect(() => {
    setDataLoaderActive(false);
    if (sellers) setSellerData(sellers);
    if (currencySymbol) setCurrencySymbol(currencySymbol);
    if (market) setMarket(market);
  }, [
    sellers,
    currencySymbol,
    market,
    setSellerData,
    setCurrencySymbol,
    setMarket,
    setDataLoaderActive,
  ]);

  return null;
}
