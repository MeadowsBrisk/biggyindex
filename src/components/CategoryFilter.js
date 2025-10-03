import { useAtom, useAtomValue } from "jotai";
import { manifestAtom, categoryAtom, selectedSubcategoriesAtom, favouritesOnlyAtom, categoryLiveCountsAtom, shipFromOptionsAtom, selectedShipFromAtom, freeShippingOnlyAtom, subcategoryLiveCountsAtom, favouritesAtom, shipFromPinnedAtom, includedSellersAtom } from "@/store/atoms";
import cn from "@/app/cn";
import { useCallback, useMemo } from 'react';
import { countryLabel } from '@/lib/countries';
import FilterPinButton from "@/components/FilterPinButton";

export default function CategoryFilter() {
  const [manifest] = useAtom(manifestAtom);
  const [category, setCategory] = useAtom(categoryAtom);
  const [favouritesOnly, setFavouritesOnly] = useAtom(favouritesOnlyAtom);
  const favourites = useAtomValue(favouritesAtom) || [];
  const [selectedSubs, setSelectedSubs] = useAtom(selectedSubcategoriesAtom);
  const liveCounts = useAtomValue(categoryLiveCountsAtom);
  const liveSubCounts = useAtomValue(subcategoryLiveCountsAtom);
  const shipFromOptions = useAtomValue(shipFromOptionsAtom);
  const [selectedShips, setSelectedShips] = useAtom(selectedShipFromAtom);
  const [freeShipOnly, setFreeShipOnly] = useAtom(freeShippingOnlyAtom);
  const [shipPinned, setShipPinned] = useAtom(shipFromPinnedAtom);
  const includedSellers = useAtomValue(includedSellersAtom) || [];

  const desiredOrder = ["Flower","Hash","Edibles","Concentrates","Vapes","Tincture","Psychedelics"]; // preferred ordering
  const rawCats = Object.keys(manifest.categories || {}).filter(c => c !== 'Tips');
  const ordered = [
    ...desiredOrder.filter(c => rawCats.includes(c)),
    ...rawCats.filter(c => !desiredOrder.includes(c)).sort()
  ];

  // Stable counts: always use liveCounts (fallback to manifest if missing) independent of current category selection
  const categoryCounts = useMemo(() => {
    const out = {};
    for (const cat of rawCats) {
      const live = liveCounts ? liveCounts[cat] : null;
      const manifestCount = manifest.categories?.[cat]?.count || 0;
      // When a shipping filter or seller include filter is active, do not fall back to manifest counts; show 0 when no live count.
      if ((Array.isArray(selectedShips) && selectedShips.length > 0) || freeShipOnly || includedSellers.length > 0) {
        out[cat] = typeof live === 'number' ? live : 0;
      } else {
        out[cat] = typeof live === 'number' ? live : manifestCount;
      }
    }
    out.__total = (liveCounts && typeof liveCounts.__total === 'number') ? liveCounts.__total : (manifest.totalItems || 0);
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

  const toggleFavouriteOnly = () => setFavouritesOnly(v => !v);
  const onSelectCategory = useCallback((cat) => { setCategory(cat); }, [setCategory]);
  const onKeyCategory = (e, cat) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectCategory(cat); } };
  const onToggleSub = (sub) => {
    setSelectedSubs(curr => curr.includes(sub) ? curr.filter(s => s !== sub) : [...curr, sub]);
  };
  const onKeySub = (e, sub) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSub(sub); } };
  const clearSubs = () => setSelectedSubs([]);

  const showShipPin = shipPinned || (Array.isArray(selectedShips) && selectedShips.length > 0) || freeShipOnly;

  return (
    <div className="space-y-4">
      {/* Favourites toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{(() => {
          const n = Array.isArray(favourites) ? favourites.length : 0;
          return n > 0 ? `Favourites only (${n})` : 'Favourites only';
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
        <div role="radiogroup" aria-label="Categories" className="flex flex-wrap gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={category === 'All'}
            onClick={() => onSelectCategory('All')}
            onKeyDown={(e) => onKeyCategory(e, 'All')}
            className={cn(
              "px-3 py-1 rounded-full text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500/50",
              category === 'All'
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            )}
          >
            All{categoryCounts.__total ? <span className="ml-1 text-xs opacity-70">{categoryCounts.__total}</span> : null}
          </button>
          {categories.map(cat => {
            const active = category === cat;
            const subKeys = Object.keys(manifest.categories?.[cat]?.subcategories || {});
            const hasSubs = subKeys.length > 0;
            const countVal = categoryCounts[cat];
            const showCount = typeof countVal === 'number' && countVal > 0; // always show when >0 now
            return (
              <button
                key={cat}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelectCategory(cat)}
                onKeyDown={(e) => onKeyCategory(e, cat)}
                className={cn(
                  "px-3 py-1 rounded-full text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors",
                  active ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                {cat}{showCount ? <span className="ml-1 text-xs opacity-70">{countVal}</span> : null}
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
        return (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Subcategories</div>
              {selectedSubs.length > 0 && (
                <button type="button" onClick={clearSubs} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Clear</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {subKeys.map(sub => {
                const active = selectedSubs.includes(sub);
                const count = (liveSubCounts && typeof liveSubCounts[sub] === 'number') ? liveSubCounts[sub] : (subObj[sub] || 0);
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => onToggleSub(sub)}
                    onKeyDown={(e) => onKeySub(e, sub)}
                    aria-pressed={active}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                      active ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    )}
                  >
                    {sub} ({count})
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
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Ships from</div>
            <div className="flex items-center gap-2">
              {selectedShips.length > 0 && (
                <button type="button" onClick={() => setSelectedShips([])} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Clear</button>
              )}
              {showShipPin && (
                <FilterPinButton pinned={shipPinned} onToggle={() => setShipPinned(!shipPinned)} label="shipping filters" />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {orderedShipOptions.map(code => {
              const active = selectedShips.includes(code);
              const label = countryLabel(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSelectedShips(curr => curr.includes(code) ? curr.filter(c => c !== code) : [...curr, code])}
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
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Free shipping only</span>
            <button
              type="button"
              onClick={() => setFreeShipOnly(v => !v)}
              className={cn(
                "relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                freeShipOnly ? "bg-green-500" : "bg-gray-300 dark:bg-gray-700"
              )}
              aria-pressed={freeShipOnly}
              aria-label="Toggle free shipping only"
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
