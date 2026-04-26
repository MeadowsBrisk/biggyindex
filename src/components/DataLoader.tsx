"use client";

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { UrlSync } from "@/components/UrlSync";
import type { Item, Seller } from "@/lib/types";
import { getInitialBrowseFilters } from "@/lib/urlFilters";
import {
  attrFiltersAtom,
  categoryAtom,
  currencySymbolAtom,
  dataLoaderActiveAtom,
  isLoadingAtom,
  searchQueryAtom,
  selectedSellersAtom,
  setItemsAtom,
  setSellersAtom,
  subcategoryAtom,
  urlSyncDoneAtom,
} from "@/store/atoms";

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
    const initialFilters = getInitialBrowseFilters(
      typeof window !== "undefined" ? window.location.search : "",
      routeCategory,
    );

    setSearch(initialFilters.search);
    setSubcategory(initialFilters.subcategories);
    setSelectedSellers(initialFilters.sellers);
    setAttrFilters({});

    // Set the route category, falling back to URL ?cat=, then "All".
    setCategory(initialFilters.category);

    // Set sellers BEFORE items so seller map is ready
    if (sellers) setSellerData(sellers);
    setItems(items);
    if (currencySymbol) setCurrencySymbol(currencySymbol);
    setLoading(false);

    return () => {
      setDataLoaderActive(false);
    };
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
