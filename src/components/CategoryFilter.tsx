"use client";
import { useAtom, useAtomValue } from "jotai";
import { manifestAtom, categoryAtom, selectedSubcategoriesAtom, excludedSubcategoriesAtom, favouritesOnlyAtom, categoryLiveCountsAtom, shipFromOptionsAtom, selectedShipFromAtom, freeShippingOnlyAtom, subcategoryLiveCountsAtom, favouritesAtom, shipFromPinnedAtom, includedSellersAtom } from "@/store/atoms";
import cn from "@/app/cn";
import React, { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { countryLabel } from '@/lib/countries';
import FilterPinButton from "@/components/FilterPinButton";
import { catKeyForManifest, subKeyForManifest, translateSubLabel } from '@/lib/taxonomyLabels';
import { useRouter } from 'next/router';

export default function CategoryFilter() {
  const router = useRouter();
  const tCats = useTranslations('Categories');
  const tSidebar = useTranslations('Sidebar');
  const tCountries = useTranslations('Countries');
  const [manifest] = useAtom(manifestAtom as any) as [any, any];
  const [category, setCategory] = useAtom(categoryAtom as any) as [string, (v: any) => void];
  const [favouritesOnly, setFavouritesOnly] = useAtom(favouritesOnlyAtom as any) as [boolean, (v: any) => void];
  const favourites = useAtomValue(favouritesAtom as any) || [] as any[];
  const [selectedSubs, setSelectedSubs] = useAtom(selectedSubcategoriesAtom as any) as [string[], (v: any) => void];
  const [excludedSubs, setExcludedSubs] = useAtom(excludedSubcategoriesAtom as any) as [string[], (v: any) => void];
  const liveCounts = useAtomValue(categoryLiveCountsAtom as any) as any;
  const liveSubCounts = useAtomValue(subcategoryLiveCountsAtom as any) as Record<string, number> | undefined;
  const shipFromOptions = useAtomValue(shipFromOptionsAtom as any) as string[];
  const [selectedShips, setSelectedShips] = useAtom(selectedShipFromAtom as any) as [string[], (v: any) => void];
  const [freeShipOnly, setFreeShipOnly] = useAtom(freeShippingOnlyAtom as any) as [boolean, (v: any) => void];
  const [shipPinned, setShipPinned] = useAtom(shipFromPinnedAtom as any) as [boolean, (v: any) => void];
  const includedSellers = useAtomValue(includedSellersAtom as any) as string[] || [];

  const desiredOrder = ["Flower","Hash","Edibles","Concentrates","Vapes","Tincture","Psychedelics"]; // preferred ordering
  const rawCats = Object.keys(manifest.categories || {}).filter((c: string) => c !== 'Tips');
  const ordered = [
    ...desiredOrder.filter(c => rawCats.includes(c)),
    ...rawCats.filter(c => !desiredOrder.includes(c)).sort()
  ];

  // Stable counts: always use liveCounts (fallback to manifest if missing) independent of current category selection
  const categoryCounts = useMemo(() => {
    const out: any = {};
    const usingFallback = !liveCounts || typeof liveCounts.__total !== 'number' || liveCounts.__total === 0;
    for (const cat of rawCats) {
      const live = liveCounts ? liveCounts[cat] : null;
      const manifestCount = manifest.categories?.[cat]?.count || 0;
      // Prefer manifest counts when liveCounts are not ready yet
      if (usingFallback) {
        out[cat] = manifestCount;
      } else if ((Array.isArray(selectedShips) && selectedShips.length > 0) || freeShipOnly || includedSellers.length > 0) {
        out[cat] = typeof live === 'number' ? live : 0;
      } else {
        out[cat] = typeof live === 'number' ? live : manifestCount;
      }
    }
    out.__total = (!usingFallback && typeof liveCounts.__total === 'number') ? liveCounts.__total : (manifest.totalItems || 0);
    return out;
  }, [rawCats, liveCounts, manifest, selectedShips, freeShipOnly, includedSellers]);

  // Hide empty categories (count === 0) and keep preferred ordering
  const categories = useMemo(() => {
    return ordered.filter(cat => (categoryCounts[cat] || 0) > 0);
  }, [ordered, categoryCounts]);


  // Order shipping options: UK, US, MULTI, UNDECLARED, then others alphabetically
  const orderedShipOptions = useMemo(() => {
    const opts = Array.isArray(shipFromOptions) ? [...shipFromOptions] : [];
    const priority = ['uk', 'us', 'multi', 'und'];
    return opts.sort((a, b) => {
      const ia = priority.indexOf(a);
      const ib = priority.indexOf(b);
      if (ia !== -1 || ib !== -1) {
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      }
      return String(a).localeCompare(String(b));
    });
  }, [shipFromOptions]);

  const toggleFavouriteOnly = () => setFavouritesOnly((v: any) => !v);
  const onSelectCategory = useCallback((cat: string) => { setCategory(cat); }, [setCategory]);
  const onKeyCategory = (e: React.KeyboardEvent<HTMLButtonElement>, cat: string) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectCategory(cat); } };
  
  // Detect touch device
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);
  React.useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Desktop: left-click toggle include, right-click toggle exclude
  // Mobile: cycle through states (neutral → included → excluded → neutral)
  const onToggleSub = (sub: string, e?: React.MouseEvent) => {
    const isIncluded = selectedSubs.includes(sub);
    const isExcluded = excludedSubs.includes(sub);
    
    // Right-click: toggle exclude (desktop) or handle as context menu
    if (e && e.button === 2) {
      e.preventDefault();
      if (isExcluded) {
        // Already excluded, remove exclusion
        setExcludedSubs(excludedSubs.filter(s => s !== sub));
      } else {
        // Not excluded, add to excluded (and remove from included if present)
        if (isIncluded) setSelectedSubs(selectedSubs.filter(s => s !== sub));
        setExcludedSubs([...excludedSubs, sub]);
      }
      return;
    }
    
    // Left-click behavior depends on device
    if (isTouchDevice) {
      // Mobile: cycle through all three states
      if (!isIncluded && !isExcluded) {
        setSelectedSubs([...selectedSubs, sub]);
      } else if (isIncluded) {
        setSelectedSubs(selectedSubs.filter(s => s !== sub));
        setExcludedSubs([...excludedSubs, sub]);
      } else {
        setExcludedSubs(excludedSubs.filter(s => s !== sub));
      }
    } else {
      // Desktop: simple toggle include/exclude on left-click
      if (isExcluded) {
        // If excluded, just clear exclusion
        setExcludedSubs(excludedSubs.filter(s => s !== sub));
      } else if (isIncluded) {
        // If included, toggle off
        setSelectedSubs(selectedSubs.filter(s => s !== sub));
      } else {
        // If neutral, include it
        setSelectedSubs([...selectedSubs, sub]);
      }
    }
  };
  
  const onKeySub = (e: React.KeyboardEvent<HTMLButtonElement>, sub: string) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSub(sub); } };
  const clearSubs = () => {
    setSelectedSubs([]);
    setExcludedSubs([]);
  };

  const showShipPin = shipPinned || (Array.isArray(selectedShips) && selectedShips.length > 0) || freeShipOnly;

  return (
    <div className="space-y-4">
      {/* Favourites toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{(() => {
          const n = Array.isArray(favourites) ? favourites.length : 0;
          return n > 0 ? `${tSidebar('favouritesOnly')} (${n})` : tSidebar('favouritesOnly');
        })()}</span>
        <button
          type="button"
          onClick={toggleFavouriteOnly}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50",
            favouritesOnly ? "bg-yellow-500" : "bg-gray-300 dark:bg-gray-700"
          )}
          aria-pressed={favouritesOnly}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
              favouritesOnly ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>

      {/* Categories */}
      <div>
  {/*<div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Categories</div>*/}
  <div role="radiogroup" aria-label={tSidebar('category')} className="flex flex-wrap gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={category === 'All'}
            onClick={() => onSelectCategory('All')}
            onKeyDown={(e) => onKeyCategory(e as any, 'All')}
            className={cn(
              "px-3 py-1 rounded-full text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500/50",
              category === 'All'
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            )}
          >
            {(() => { try { return tSidebar('all'); } catch { return 'All'; } })()}
            {categoryCounts.__total ? <span className="ml-1 text-xs opacity-70">{categoryCounts.__total}</span> : null}
          </button>
          {categories.map(cat => {
            const active = category === cat;
            const subKeys = Object.keys(manifest.categories?.[cat]?.subcategories || {});
            const countVal = categoryCounts[cat];
            const showCount = typeof countVal === 'number' && countVal > 0; // always show when >0 now
            return (
              <button
                key={cat}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelectCategory(cat)}
                onKeyDown={(e) => onKeyCategory(e as any, cat)}
                className={cn(
                  "px-3 py-1 rounded-full text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors",
                  active ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                {(() => { try { return tCats(catKeyForManifest(cat)); } catch { return cat; } })()}
                {showCount ? <span className="ml-1 text-xs opacity-70">{countVal}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subcategories */}
      {category && category !== 'All' && (() => {
        const subObj = manifest.categories?.[category]?.subcategories || {};
        const subKeys = Object.keys(subObj);
        if (subKeys.length === 0) return null; // hide section entirely when no subcategories
        // Filter subcategories: when seller filter is active, only show those with live counts > 0
        const hasActiveFilters = (Array.isArray(selectedShips) && selectedShips.length > 0) || freeShipOnly || includedSellers.length > 0;
        const visibleSubKeys = hasActiveFilters
          ? subKeys.filter(sub => (liveSubCounts && typeof (liveSubCounts as any)[sub] === 'number' && (liveSubCounts as any)[sub] > 0))
          : subKeys;
        if (visibleSubKeys.length === 0) return null; // hide section if no visible subcategories
        return (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">{tSidebar('subcategories')}</div>
              {(selectedSubs.length > 0 || excludedSubs.length > 0) && (
                <button type="button" onClick={clearSubs} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{tSidebar('clear')}</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleSubKeys.map(sub => {
                const isIncluded = selectedSubs.includes(sub);
                const isExcluded = excludedSubs.includes(sub);
                const count = (liveSubCounts && typeof (liveSubCounts as any)[sub] === 'number') ? (liveSubCounts as any)[sub] : (subObj[sub] || 0);
                const parentKey = catKeyForManifest(category);
                const subKey = subKeyForManifest(sub);
                const label = translateSubLabel(tCats as any, parentKey, subKey) || sub;
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={(e) => onToggleSub(sub, e as any)}
                    onContextMenu={(e) => { e.preventDefault(); onToggleSub(sub, e as any); }}
                    onKeyDown={(e) => onKeySub(e as any, sub)}
                    aria-pressed={isIncluded || isExcluded}
                    aria-label={isExcluded ? `Excluded: ${label}` : isIncluded ? `Included: ${label}` : label}
                    title={
                      isExcluded 
                        ? "Right-click to remove exclusion" 
                        : isIncluded 
                          ? "Click to deselect • Right-click to exclude"
                          : "Click to include • Right-click to exclude"
                    }
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs focus:outline-none focus:ring-2 transition-colors select-none",
                      isIncluded && "bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500/50",
                      isExcluded && "bg-gradient-to-br from-orange-500 to-orange-600 dark:from-orange-700 dark:to-orange-800 text-white hover:from-orange-600 hover:to-orange-700 dark:hover:from-orange-800 dark:hover:to-orange-900 focus:ring-orange-500/50 line-through",
                      !isIncluded && !isExcluded && "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:ring-blue-500/50"
                    )}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Ships from */}
      {Array.isArray(shipFromOptions) && shipFromOptions.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">{tSidebar('shipsFrom')}</div>
            <div className="flex items-center gap-2">
              {selectedShips.length > 0 && (
                <button type="button" onClick={() => setSelectedShips([])} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{tSidebar('clear')}</button>
              )}
              {showShipPin && (
                <FilterPinButton pinned={shipPinned} onToggle={() => setShipPinned(!shipPinned)} label="shipping filters" />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {orderedShipOptions.map(code => {
              const active = selectedShips.includes(code);
              const label = (() => { try { return tCountries(code); } catch { return countryLabel(code); } })();
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSelectedShips((curr: string[]) => curr.includes(code) ? curr.filter(c => c !== code) : [...curr, code])}
                  aria-pressed={active}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                    active ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {/* Free shipping toggle */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{tSidebar('freeShippingOnly')}</span>
            <button
              type="button"
              onClick={() => setFreeShipOnly((v: any) => !v)}
              className={cn(
                "relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                freeShipOnly ? "bg-green-500" : "bg-gray-300 dark:bg-gray-700"
              )}
              aria-pressed={freeShipOnly}
              aria-label={tSidebar('freeShippingOnly')}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  freeShipOnly ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
