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
 * Module-level fetch cache: the browse dataset is fetched once per URL (the
 * URL embeds a data version, see /api/browse) and shared across every page
 * that mounts a DataLoader — re-navigating to /browse reuses the in-memory
 * promise instead of refetching. Version-pinned URLs are also browser-cached
 * immutably, so even a fresh tab pays zero bytes until the data changes.
 */
let browseCache: { url: string; promise: Promise<Item[]> } | null = null;

function fetchBrowseData(url: string): Promise<Item[]> {
  if (browseCache?.url !== url) {
    const promise = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`browse data fetch failed: ${res.status}`);
      return res.json() as Promise<Item[]>;
    });
    // Drop failed fetches from the cache so a later mount retries instead
    // of being pinned to the rejection forever.
    promise.catch(() => {
      if (browseCache?.promise === promise) browseCache = null;
    });
    browseCache = { url, promise };
  }
  return browseCache.promise;
}

/**
 * Client component that hydrates items into the Jotai store.
 *
 * Filter/config state arrives as props; the item dataset is fetched from
 * /api/browse (browser-cached immutably per data version) rather than being
 * serialized into the RSC payload — keeps ~900KB out of every browse
 * document.
 */
export function DataLoader({
  dataUrl,
  sellers,
  routeCategory,
  currencySymbol,
}: {
  dataUrl: string;
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

  // Kick the dataset fetch off during render (idempotent via module cache)
  // so it races hydration instead of waiting for the mount effect.
  if (typeof window !== "undefined") {
    fetchBrowseData(dataUrl);
  }

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
    if (currencySymbol) setCurrencySymbol(currencySymbol);

    // Items arrive async from /api/browse. On a same-version re-navigation
    // the cached promise resolves in a microtask; the store may also still
    // hold items from the previous visit, which ItemGrid keeps showing
    // until the fresh set lands. Loading must flip false even on failure —
    // ItemGrid's seed/skeleton state waits on it. Nothing full-screen ever
    // gates on this fetch (the old HydrationGate veil is gone).
    let cancelled = false;
    fetchBrowseData(dataUrl)
      .then((items) => {
        if (cancelled) return;
        setItems(items);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[DataLoader] browse data fetch failed", error);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      setDataLoaderActive(false);
    };
  }, [
    dataUrl,
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
