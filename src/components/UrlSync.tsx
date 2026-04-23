"use client";

/**
 * Bidirectional sync between Jotai atoms and URL query parameters via nuqs.
 *
 * URL params:
 *   sort=hottest  dir=asc  q=flower  cat=Flower  sub=Kush
 *   sellers=4772053  pmin=20  pmax=200
 */

import { useEffect, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  useQueryStates,
  parseAsString,
  parseAsArrayOf,
  parseAsInteger,
} from "nuqs";
import type { SortKey, SortDir } from "@/lib/types";
import {
  sortKeyAtom,
  sortDirAtom,
  searchQueryAtom,
  categoryAtom,
  subcategoryAtom,
  selectedSellersAtom,
  priceRangeAtom,
  isLoadingAtom,
  urlSyncDoneAtom,
  expandedRefNumAtom,
} from "@/store/atoms";

const VALID_SORT_KEYS = new Set<string>([
  "hottest",
  "newest",
  "updated",
  "price",
  "ppg",
  "name",
]);

const parsers = {
  sort: parseAsString,
  dir: parseAsString,
  q: parseAsString,
  cat: parseAsString,
  sub: parseAsArrayOf(parseAsString, ","),
  sellers: parseAsArrayOf(parseAsString, ","),
  pmin: parseAsInteger,
  pmax: parseAsInteger,
};

export function UrlSync() {
  const isLoading = useAtomValue(isLoadingAtom);
  const [, setUrlSyncDone] = useAtom(urlSyncDoneAtom);

  const [urlState, setUrlState] = useQueryStates(parsers, {
    history: "replace",
    shallow: true,
  });

  const [sortKey, setSortKey] = useAtom(sortKeyAtom);
  const [sortDir, setSortDir] = useAtom(sortDirAtom);
  const [search, setSearch] = useAtom(searchQueryAtom);
  const [category, setCategory] = useAtom(categoryAtom);
  const [subcategory, setSubcategory] = useAtom(subcategoryAtom);
  const [sellers, setSellers] = useAtom(selectedSellersAtom);
  const [priceRange, setPriceRange] = useAtom(priceRangeAtom);
  const expandedRefNum = useAtomValue(expandedRefNumAtom);

  const hydratedRef = useRef(false);
  const suppressSyncRef = useRef(false);

  // ── Phase 1: URL → Atoms (on mount) ──
  useEffect(() => {
    if (isLoading) return;

    suppressSyncRef.current = true;

    if (urlState.sort && VALID_SORT_KEYS.has(urlState.sort)) {
      setSortKey(urlState.sort as SortKey);
    }
    if (urlState.dir === "asc" || urlState.dir === "desc") {
      setSortDir(urlState.dir as SortDir);
    }
    if (urlState.q != null) setSearch(urlState.q);
    if (urlState.cat != null) setCategory(urlState.cat);
    if (urlState.sub != null && urlState.sub.length > 0) {
      setSubcategory(urlState.sub.filter(Boolean) as string[]);
    }
    if (urlState.sellers != null && urlState.sellers.length > 0) {
      setSellers(urlState.sellers.filter(Boolean) as string[]);
    }
    if (urlState.pmin != null || urlState.pmax != null) {
      setPriceRange({
        min: urlState.pmin ?? 0,
        max: urlState.pmax ?? Infinity,
      });
    }

    hydratedRef.current = true;
    setUrlSyncDone(true);

    requestAnimationFrame(() => {
      suppressSyncRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // ── Phase 2: Atoms → URL (on user interaction) ──
  useEffect(() => {
    if (!hydratedRef.current || suppressSyncRef.current) return;
    // Don't overwrite the URL while the item detail overlay is open
    if (expandedRefNum) return;

    setUrlState({
      sort: sortKey !== "hottest" ? sortKey : null,
      dir: sortDir !== "desc" ? sortDir : null,
      q: search || null,
      cat: category !== "All" ? category : null,
      sub: subcategory.length > 0 ? subcategory : null,
      sellers: sellers.length > 0 ? sellers : null,
      pmin: priceRange.min > 0 ? priceRange.min : null,
      pmax: priceRange.max < Infinity ? priceRange.max : null,
    });
  }, [
    sortKey,
    sortDir,
    search,
    category,
    subcategory,
    sellers,
    priceRange,
    expandedRefNum,
    setUrlState,
  ]);

  return null;
}
