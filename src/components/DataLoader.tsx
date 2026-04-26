"use client";

import { useSetAtom } from "jotai";
import { useEffect, useLayoutEffect } from "react";
import { DeferredSearchSync } from "@/components/DeferredSearchSync";
import { UrlSync } from "@/components/UrlSync";
import type { Item, Seller } from "@/lib/types";
import {
  getInitialBrowseFilters,
  parseBrowseUrlFilters,
} from "@/lib/urlFilters";
import {
  attrFiltersAtom,
  categoryAtom,
  currencySymbolAtom,
  dataLoaderActiveAtom,
  deferredSearchQueryAtom,
  isLoadingAtom,
  priceRangeAtom,
  searchQueryAtom,
  selectedSellersAtom,
  setItemsAtom,
  setSellersAtom,
  sortDirAtom,
  sortKeyAtom,
  subcategoryAtom,
  urlSyncDoneAtom,
} from "@/store/atoms";

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  const setDeferredSearch = useSetAtom(deferredSearchQueryAtom);
  const setSelectedSellers = useSetAtom(selectedSellersAtom);
  const setAttrFilters = useSetAtom(attrFiltersAtom);
  const setSortKey = useSetAtom(sortKeyAtom);
  const setSortDir = useSetAtom(sortDirAtom);
  const setPriceRange = useSetAtom(priceRangeAtom);
  const setCurrencySymbol = useSetAtom(currencySymbolAtom);

  useBrowserLayoutEffect(() => {
    // Signal that this page uses DataLoader so transition gating waits for hydration.
    setDataLoaderActive(true);

    // Reset URL sync status so transition gating waits for UrlSync to apply URL params.
    setUrlSyncDone(false);

    // Reset filters on every page navigation to prevent stale state.
    // But honor URL params that UrlSync will hydrate from —
    // otherwise we race: DataLoader writes "All" first, UrlSync restores later,
    // and the intermediate paint + Phase 2 might clobber the URL back to /browse.
    const currentSearch =
      typeof window !== "undefined" ? window.location.search : "";
    const initialFilters = getInitialBrowseFilters(
      currentSearch,
      routeCategory,
    );
    const parsedUrlFilters = parseBrowseUrlFilters(currentSearch);

    setSearch(initialFilters.search);
    setDeferredSearch(initialFilters.search);
    setSubcategory(initialFilters.subcategories);
    setSelectedSellers(initialFilters.sellers);
    setAttrFilters({});

    if (parsedUrlFilters.sortKey) setSortKey(parsedUrlFilters.sortKey);
    if (parsedUrlFilters.sortDir) setSortDir(parsedUrlFilters.sortDir);
    setPriceRange(parsedUrlFilters.priceRange ?? { min: 0, max: Infinity });

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
    setDeferredSearch,
    setSelectedSellers,
    setAttrFilters,
    setSortKey,
    setSortDir,
    setPriceRange,
    setCurrencySymbol,
  ]);

  return (
    <>
      <UrlSync />
      <DeferredSearchSync />
    </>
  );
}
