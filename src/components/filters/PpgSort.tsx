"use client";
import React, { useEffect, useCallback, useState, useMemo } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { 
  selectedWeightAtom, 
  setPpgDataAtom, 
  categorySupportsPpgAtom,
  sortKeyAtom,
  sortDirAtom,
  prePpgSortStateAtom,
  categoryAtom,
  ppgExpandedAtom,
} from "@/store/atoms";
import { getWeightsForCategory, getWeightLabel, WEIGHT_BREAKPOINTS, type WeightBreakpoint, type WeightPricingFile } from "@/types/pricing";
import cn from "@/lib/core/cn";
import { useRouter } from "next/router";
import { getMarketFromPath } from "@/lib/market/market";
import { useTranslations } from "next-intl";

/**
 * PpgSortButton - Just the currency/g toggle button (header placement)
 */
export function PpgSortButton() {
  const t = useTranslations("Sort");
  const [selectedWeight, setSelectedWeight] = useAtom(selectedWeightAtom);
  const setPpgData = useSetAtom(setPpgDataAtom);
  const supportsPpg = useAtomValue(categorySupportsPpgAtom);
  const category = useAtomValue(categoryAtom);
  const [isExpanded, setIsExpanded] = useAtom(ppgExpandedAtom);
  const prePpgSortState = useAtomValue(prePpgSortStateAtom);
  const setSortKey = useSetAtom(sortKeyAtom);
  const setSortDir = useSetAtom(sortDirAtom);

  const handleToggle = useCallback(() => {
    if (selectedWeight !== null) {
      // Already active - clicking clears it and restores previous sort
      setSelectedWeight(null);
      setPpgData(null, null);
      setIsExpanded(false);
      // Restore previous sort state
      if (prePpgSortState) {
        setSortKey(prePpgSortState.key);
        setSortDir(prePpgSortState.dir);
      }
    } else {
      // Toggle expansion
      setIsExpanded(prev => !prev);
    }
  }, [selectedWeight, setSelectedWeight, setPpgData, setIsExpanded, prePpgSortState, setSortKey, setSortDir]);

  if (!supportsPpg) return null;

  const isActive = selectedWeight !== null;

  // Match SortControls styling
  const baseRing = "focus:outline-none focus:ring-2 focus:ring-blue-500/50";
  const surface = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700";
  const text = "text-gray-800 dark:text-gray-100";
  const interactive = "transition-colors duration-150 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm hover:ring-1 hover:ring-blue-500/20";

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-2.5 h-9 rounded-md text-xs font-medium",
        baseRing,
        isActive
          ? "bg-emerald-600 dark:bg-emerald-700 border border-emerald-700 dark:border-emerald-600 text-white hover:bg-emerald-700 dark:hover:bg-emerald-800"
          : `${surface} ${text} ${interactive}`
      )}
      title={isActive ? t("budget.activeTitle", { weight: selectedWeight }) : t("budget.toggleTitle")}
    >
      <span className="font-semibold">{t("budget.buttonLabel")}</span>
      {isActive && (
        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[11px]">{getWeightLabel(selectedWeight, category)}</span>
      )}
    </button>
  );
}

/**
 * PpgWeightPills - The weight selection pills (underneath placement)
 */
export function PpgWeightPills() {
  const router = useRouter();
  const t = useTranslations("Sort");
  const [selectedWeight, setSelectedWeight] = useAtom(selectedWeightAtom);
  const setPpgData = useSetAtom(setPpgDataAtom);
  const [sortKey, setSortKey] = useAtom(sortKeyAtom);
  const [sortDir, setSortDir] = useAtom(sortDirAtom);
  const setPrePpgSortState = useSetAtom(prePpgSortStateAtom);
  const prePpgSortState = useAtomValue(prePpgSortStateAtom);
  const supportsPpg = useAtomValue(categorySupportsPpgAtom);
  const category = useAtomValue(categoryAtom);
  const [isExpanded, setIsExpanded] = useAtom(ppgExpandedAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [prevCategory, setPrevCategory] = useState<string | null>(null);

  // Get category-specific weight options (Hash has 100g, others don't)
  const weights = useMemo(() => getWeightsForCategory(category), [category]);

  const showPills = isExpanded || selectedWeight !== null;

  // Determine market from path
  const market = useMemo(() => {
    const path = typeof router?.asPath === "string" ? router.asPath : "/";
    return getMarketFromPath(path);
  }, [router?.asPath]);

  // When switching to a category that doesn't support PPG, restore previous sort
  useEffect(() => {
    if (prevCategory !== null && prevCategory !== category) {
      // Category changed
      if (!supportsPpg && selectedWeight !== null) {
        // New category doesn't support PPG - clear and restore
        setSelectedWeight(null);
        setPpgData(null, null);
        setIsExpanded(false);
        if (prePpgSortState) {
          setSortKey(prePpgSortState.key);
          setSortDir(prePpgSortState.dir);
        }
      }
    }
    setPrevCategory(category);
  }, [category, supportsPpg, selectedWeight, setSelectedWeight, setPpgData, setIsExpanded, prePpgSortState, setSortKey, setSortDir, prevCategory]);

  // Auto-collapse after delay if nothing selected
  useEffect(() => {
    if (!isExpanded || selectedWeight !== null) return;
    const timer = setTimeout(() => setIsExpanded(false), 8000);
    return () => clearTimeout(timer);
  }, [isExpanded, selectedWeight, setIsExpanded]);

  const fetchPpgData = useCallback(async (weight: WeightBreakpoint) => {
    try {
      const res = await fetch(`/api/index/pricing/${weight}?mkt=${market}`);
      if (!res.ok) return null;
      return await res.json() as WeightPricingFile;
    } catch {
      return null;
    }
  }, [market]);

  // ── URL param sync ──────────────────────────────────────────────────
  const ppgHydrated = React.useRef(false);

  // Hydrate from ?ppg URL param on mount (e.g. shared link ?ppg=7)
  useEffect(() => {
    if (!router.isReady || ppgHydrated.current) return;
    ppgHydrated.current = true;

    const urlPpg = typeof router.query.ppg === 'string' ? router.query.ppg : null;
    if (!urlPpg) return;

    const parsed = parseFloat(urlPpg);
    if (Number.isNaN(parsed)) return;
    const validWeight = (WEIGHT_BREAKPOINTS as readonly number[]).includes(parsed) ? parsed as WeightBreakpoint : null;
    if (!validWeight) return;

    (async () => {
      const data = await fetchPpgData(validWeight);
      if (data) {
        setPrePpgSortState({ key: sortKey, dir: sortDir });
        setSelectedWeight(validWeight);
        setSortKey('price');
        setSortDir('asc');
        setPpgData(validWeight, data);
        setIsExpanded(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Sync selectedWeight → URL (shallow, no scroll)
  useEffect(() => {
    if (!router.isReady || !ppgHydrated.current) return;

    const currentPpg = typeof router.query.ppg === 'string' ? router.query.ppg : null;
    const targetPpg = selectedWeight !== null ? String(selectedWeight) : null;

    if (targetPpg !== currentPpg) {
      const newQuery: any = { ...router.query };
      if (targetPpg) {
        newQuery.ppg = targetPpg;
      } else {
        delete newQuery.ppg;
      }
      router.replace({ pathname: router.pathname, query: newQuery }, undefined, { shallow: true, scroll: false });
    }
  }, [selectedWeight, router]);

  const handleSelectWeight = useCallback(async (weight: WeightBreakpoint) => {
    if (weight === selectedWeight) {
      // Deselecting - restore previous sort
      setSelectedWeight(null);
      setPpgData(null, null);
      if (prePpgSortState) {
        setSortKey(prePpgSortState.key);
        setSortDir(prePpgSortState.dir);
      }
      return;
    }

    setIsLoading(true);
    
    // Fetch data FIRST before updating state (prevents flash of selected state on failure)
    const data = await fetchPpgData(weight);
    setIsLoading(false);
    
    if (data) {
      // Save current sort state BEFORE switching (only if not already in PPG mode)
      if (selectedWeight === null) {
        setPrePpgSortState({ key: sortKey, dir: sortDir });
      }
      
      setSelectedWeight(weight);
      setSortKey('price');
      setSortDir('asc');
      setPpgData(weight, data);
    }
    // If fetch failed, don't change state at all
  }, [selectedWeight, setSelectedWeight, setPpgData, fetchPpgData, setSortKey, setSortDir, sortKey, sortDir, setPrePpgSortState, prePpgSortState]);

  if (!supportsPpg || !showPills) return null;

  // Match SortControls styling for consistency
  const baseRing = "focus:outline-none focus:ring-2 focus:ring-blue-500/50";
  const surface = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700";
  const text = "text-gray-800 dark:text-gray-100";
  const interactive = "transition-colors duration-150 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm hover:ring-1 hover:ring-blue-500/20";

  return (
    <div className="flex items-center justify-end gap-1.5 flex-wrap mt-4 mb-2">
      <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">{t("budget.label")}</span>
      <div className="relative flex items-center gap-1.5">
        {weights.map((weight) => {
          const isSelected = selectedWeight === weight;
          return (
            <button
              key={weight}
              type="button"
              onClick={() => handleSelectWeight(weight)}
              disabled={isLoading}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded-md",
                baseRing,
                isSelected
                  ? "bg-emerald-600 dark:bg-emerald-700 border border-emerald-700 dark:border-emerald-600 text-white hover:bg-emerald-700 dark:hover:bg-emerald-800"
                  : `${surface} ${text} ${interactive}`,
                isLoading && "opacity-40 pointer-events-none"
              )}
            >
              {getWeightLabel(weight, category)}
            </button>
          );
        })}
        {/* Loading spinner centered on buttons */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
