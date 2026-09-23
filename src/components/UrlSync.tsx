"use client";

/**
 * Bidirectional sync between Jotai atoms and URL query parameters via nuqs.
 *
 * URL params:
 *   sort=hottest  dir=asc  q=flower  cat=Flower  sub=Kush
 *   Default sort is hottest desc; explicit sort params override it.
 *   sellers=4772053  xsellers=4772053  pmin=20  pmax=200  ow=u,f
 */

import { useAtom, useAtomValue } from "jotai";
import { useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";
import {
  browseUrlParsers,
  buildBrowseUrlState,
  readBrowseUrlState,
} from "@/lib/urlFilters";
import {
  categoryAtom,
  deferredSearchQueryAtom,
  expandedRefNumAtom,
  isLoadingAtom,
  offWallAtom,
  priceRangeAtom,
  searchQueryAtom,
  sellerSelectionAtom,
  sortDirAtom,
  sortKeyAtom,
  subcategoryAtom,
  urlSyncDoneAtom,
} from "@/store/atoms";

export function UrlSync() {
  const isLoading = useAtomValue(isLoadingAtom);
  const [, setUrlSyncDone] = useAtom(urlSyncDoneAtom);

  const [urlState, setUrlState] = useQueryStates(browseUrlParsers, {
    history: "replace",
    shallow: true,
  });

  const [sortKey, setSortKey] = useAtom(sortKeyAtom);
  const [sortDir, setSortDir] = useAtom(sortDirAtom);
  const [search, setSearch] = useAtom(searchQueryAtom);
  const [, setDeferredSearch] = useAtom(deferredSearchQueryAtom);
  const [category, setCategory] = useAtom(categoryAtom);
  const [subcategory, setSubcategory] = useAtom(subcategoryAtom);
  const [sellerSelection, setSellerSelection] = useAtom(sellerSelectionAtom);
  const [priceRange, setPriceRange] = useAtom(priceRangeAtom);
  const [offWall, setOffWall] = useAtom(offWallAtom);
  const expandedRefNum = useAtomValue(expandedRefNumAtom);

  const hydratedRef = useRef(false);
  const suppressSyncRef = useRef(false);

  // ── Phase 1: URL → Atoms (on mount) ──
  useEffect(() => {
    if (isLoading || hydratedRef.current) return;

    suppressSyncRef.current = true;
    const parsed = readBrowseUrlState(urlState);

    if (parsed.sortKey) setSortKey(parsed.sortKey);
    if (parsed.sortDir) setSortDir(parsed.sortDir);
    if (parsed.search != null) {
      setSearch(parsed.search);
      setDeferredSearch(parsed.search);
    }
    if (parsed.category != null) setCategory(parsed.category);
    if (parsed.subcategories) setSubcategory(parsed.subcategories);
    if (parsed.sellers) {
      setSellerSelection({
        selected: parsed.sellers,
        excluded: [],
        all: false,
      });
    } else if (parsed.excludedSellers) {
      setSellerSelection({
        selected: [],
        excluded: parsed.excludedSellers,
        all: true,
      });
    }
    if (parsed.priceRange) setPriceRange(parsed.priceRange);
    if (parsed.offWall) setOffWall(parsed.offWall);

    hydratedRef.current = true;
    setUrlSyncDone(true);

    requestAnimationFrame(() => {
      suppressSyncRef.current = false;
    });
  }, [
    isLoading,
    urlState,
    setSortKey,
    setSortDir,
    setSearch,
    setDeferredSearch,
    setCategory,
    setSubcategory,
    setSellerSelection,
    setPriceRange,
    setOffWall,
    setUrlSyncDone,
  ]);

  // ── Phase 2: Atoms → URL (on user interaction) ──
  useEffect(() => {
    if (!hydratedRef.current || suppressSyncRef.current) return;
    // Don't overwrite the URL while the item detail overlay is open
    if (expandedRefNum) return;

    setUrlState(
      buildBrowseUrlState({
        sortKey,
        sortDir,
        search,
        category,
        subcategories: subcategory,
        sellers: sellerSelection.selected,
        excludedSellers: sellerSelection.excluded,
        priceRange,
        offWall,
      }),
    );
  }, [
    sortKey,
    sortDir,
    search,
    category,
    subcategory,
    sellerSelection,
    priceRange,
    offWall,
    expandedRefNum,
    setUrlState,
  ]);

  return null;
}
