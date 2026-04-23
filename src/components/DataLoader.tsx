"use client";

import { useEffect } from "react";
import { useSetAtom } from "jotai";
import {
  setItemsAtom,
  setSellersAtom,
  isLoadingAtom,
  urlSyncDoneAtom,
  dataLoaderActiveAtom,
  categoryAtom,
  subcategoryAtom,
  searchQueryAtom,
  selectedSellersAtom,
  attrFiltersAtom,
  currencySymbolAtom,
} from "@/store/atoms";
import { UrlSync } from "@/components/UrlSync";
import type { Item, Seller } from "@/lib/types";

/**
 * Client component that hydrates items into the Jotai store.
 * Receives pre-loaded data as props from the server component.
 * Matches food-agg DataLoader pattern.
 */
export function DataLoader({
  items,
  sellers,
  routeCategory,
  currencySymbol,
}: {
  items: Item[];
  sellers?: Seller[];
  routeCategory?: string | null;
  currencySymbol?: string;
}) {
  const setItems = useSetAtom(setItemsAtom);
  const setSellerData = useSetAtom(setSellersAtom);
  const setLoading = useSetAtom(isLoadingAtom);
  const setUrlSyncDone = useSetAtom(urlSyncDoneAtom);
  const setDataLoaderActive = useSetAtom(dataLoaderActiveAtom);
  const setCategory = useSetAtom(categoryAtom);
  const setSubcategory = useSetAtom(subcategoryAtom);
  const setSearch = useSetAtom(searchQueryAtom);
  const setSelectedSellers = useSetAtom(selectedSellersAtom);
  const setAttrFilters = useSetAtom(attrFiltersAtom);
  const setCurrencySymbol = useSetAtom(currencySymbolAtom);

  useEffect(() => {
    // Signal that this page uses DataLoader so HydrationGate waits for hydration
    setDataLoaderActive(true);

    // Reset URL sync status so HydrationGate waits for UrlSync to re-apply URL params
    setUrlSyncDone(false);

    // Reset filters on every page navigation to prevent stale state.
    // But honor URL params that UrlSync will hydrate from (cat/sub/q/sellers) —
    // otherwise we race: DataLoader writes "All" first, UrlSync restores later,
    // and the intermediate paint + Phase 2 might clobber the URL back to /browse.
    const sp =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const urlCat = sp?.get("cat");
    const urlSub = sp?.get("sub");
    const urlQ = sp?.get("q");
    const urlSellers = sp?.get("sellers");

    setSearch(urlQ ?? "");
    setSubcategory(urlSub ? urlSub.split(",").filter(Boolean) : []);
    setSelectedSellers(
      urlSellers ? urlSellers.split(",").filter(Boolean) : [],
    );
    setAttrFilters({});

    // Set the route category, falling back to URL ?cat=, then "All".
    const rc = routeCategory ?? urlCat ?? null;
    setCategory(rc ?? "All");

    // Set sellers BEFORE items so seller map is ready
    if (sellers) setSellerData(sellers);
    setItems(items);
    if (currencySymbol) setCurrencySymbol(currencySymbol);
    setLoading(false);
  }, [
    items,
    sellers,
    routeCategory,
    currencySymbol,
    setItems,
    setSellerData,
    setLoading,
    setUrlSyncDone,
    setDataLoaderActive,
    setCategory,
    setSubcategory,
    setSearch,
    setSelectedSellers,
    setAttrFilters,
    setCurrencySymbol,
  ]);

  return <UrlSync />;
}
