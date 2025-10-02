import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { votesAtom, reconcileLocalEndorsementsAtom } from "./votesAtoms"; // new import for endorsements sorting and reconciliation
import { convertToGBP } from "@/hooks/useExchangeRates"; // added for currency conversion
import { normalizeShipFromCode } from "@/lib/countries";
// Define FX rates atom (base GBP) so downstream atoms can read it
export const exchangeRatesAtom = atom(null);
// Helper: display rounding (ceil) with tiny epsilon to avoid float artifacts
const toDisplayGBP = (v) => (typeof v === 'number' && isFinite(v) ? Math.ceil(v - 1e-9) : v);

// Internal writable atom for the full items list
const itemsBaseAtom = atom([]);

// Internal writable atom holding the full unfiltered (all categories) dataset once fetched
const allItemsBaseAtom = atom([]);

// Public read-only atom exposed to components
export const itemsAtom = atom((get) => get(itemsBaseAtom));
export const allItemsAtom = atom((get) => get(allItemsBaseAtom));
export const isLoadingAtom = atom(false);

// Write-only atom to set items from the page
export const setItemsAtom = atom(null, (get, set, newItems) => {
  const arr = Array.isArray(newItems) ? newItems : [];
  // Precompute numeric timestamps once to avoid repeated Date parsing inside sort cycles
  for (const it of arr) {
    if (it && it.firstSeenAt && it.firstSeenAtMs == null) {
      const t = Date.parse(it.firstSeenAt);
      if (!isNaN(t)) it.firstSeenAtMs = t; else it.firstSeenAtMs = 0;
    }
    if (it && it.lastUpdatedAt && it.lastUpdatedAtMs == null) {
      const t2 = Date.parse(it.lastUpdatedAt);
      if (!isNaN(t2)) it.lastUpdatedAtMs = t2; else it.lastUpdatedAtMs = it.firstSeenAtMs || 0;
    }
  }
  set(itemsBaseAtom, arr);
  // Seed votesAtom with embedded endorsementCount values (no network) for items lacking a vote entry
  const votes = { ...(get(votesAtom) || {}) };
  let changed = false;
  for (const it of arr) {
    if (!it || it.id == null) continue;
    const id = String(it.id);
    if (votes[id] == null && typeof it.endorsementCount === 'number') {
      votes[id] = it.endorsementCount;
      changed = true;
    }
  }
  if (changed) {
    set(votesAtom, votes);
    // Ensure local endorsements (if any) applied over snapshot baseline
    set(reconcileLocalEndorsementsAtom);
  }
});

// Write-only atom to set all items (unfiltered, all categories) from the page
export const setAllItemsAtom = atom(null, (get, set, newItems) => {
  if (!Array.isArray(newItems)) return;
  set(allItemsBaseAtom, newItems);
});

// Selected category ("All" means no category filtering)
// Move selectedSubcategoriesAtom before categoryAtom so category's setter can reset it
export const selectedSubcategoriesAtom = atom([]); // array of strings

// Shipping origin filter (two-letter codes like 'uk','us') persisted across sessions
export const selectedShipFromAtom = atomWithStorage("shipFrom", []); // array of codes
// Free shipping only toggle (persisted). When enabled we include ONLY items explicitly detected as free (cost 0) and exclude unknown/paid.
export const freeShippingOnlyAtom = atomWithStorage("freeShippingOnly", false);
export const shipFromPinnedAtom = atomWithStorage("filterPinnedShipFrom", false);

const _categoryAtom = atom("All");
export const categoryAtom = atom(
  (get) => get(_categoryAtom),
  (get, set, newCategory) => {
    set(_categoryAtom, newCategory);
    // reset selected subcategories when category changes
    set(selectedSubcategoriesAtom, []);
    // reset price range to full bounds on category change (use null sentinels)
    if (!get(priceFilterPinnedAtom)) {
      set(priceRangeAtom, { min: null, max: null });
      set(priceRangeUserSetAtom, false); // auto reset user-set flag
    }
  }
);

// Search query string
export const searchQueryAtom = atom("");

// Include tips items toggle (default off)
// Tips are always excluded in filters

// Excluded sellers by name (case-insensitive compare in filter)
export const excludedSellersAtom = atomWithStorage("excludedSellers", []);
export const includedSellersAtom = atomWithStorage("includedSellers", []);
export const excludedSellersPinnedAtom = atomWithStorage("filterPinnedExcluded", false);
export const includedSellersPinnedAtom = atomWithStorage("filterPinnedIncluded", false);

// Manifest data (categories and price bounds) loaded at runtime
export const manifestAtom = atom({ totalItems: 0, minPrice: null, maxPrice: null, categories: {} });

// Price range filter; initialize to full bounds; components should clamp
export const priceRangeAtom = atom({ min: 0, max: Infinity });
// New atom tracking whether user explicitly adjusted price range (vs automatic category clamp)
export const priceRangeUserSetAtom = atom(false);
export const priceFilterPinnedAtom = atomWithStorage("filterPinnedPrice", false);

// Normalized price range (clamped to current bounds; fallback to bounds on invalid persisted values)
export const normalizedPriceRangeAtom = atom((get) => {
  const raw = get(priceRangeAtom) || {}; // {min,max}
  const { min: boundMin, max: boundMax } = get(priceBoundsAtom);
  let minVal = Number.isFinite(raw.min) ? raw.min : boundMin;
  let maxVal = Number.isFinite(raw.max) ? raw.max : boundMax;
  // Clamp
  if (minVal < boundMin) minVal = boundMin;
  if (minVal > boundMax) minVal = boundMin; // out of range -> reset
  if (maxVal > boundMax) maxVal = boundMax;
  if (maxVal < boundMin) maxVal = boundMax; // out of range -> reset
  if (minVal > maxVal) { // invalid inverted range -> full bounds
    minVal = boundMin;
    maxVal = boundMax;
  }
  return { min: minVal, max: maxVal, boundMin, boundMax };
});

// Derived bounds from items (fallback to manifest bounds if available)
export const priceBoundsAtom = atom((get) => {
  const rates = get(exchangeRatesAtom);
  const allFull = get(allItemsAtom);
  const source = (Array.isArray(allFull) && allFull.length > 0) ? allFull : get(itemsAtom);
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const it of source) {
    if (!it) continue;
    const currency = it.baseCurrency || 'USD';
    let pMin = it.priceMin;
    let pMax = it.priceMax;
    if (typeof pMin === 'number') {
      const conv = currency === 'GBP' ? pMin : (rates && rates['USD'] && currency === 'USD' ? pMin / rates['USD'] : convertToGBP(pMin, currency, rates));
      if (typeof conv === 'number' && isFinite(conv)) pMin = toDisplayGBP(conv);
    }
    if (typeof pMax === 'number') {
      const conv = currency === 'GBP' ? pMax : (rates && rates['USD'] && currency === 'USD' ? pMax / rates['USD'] : convertToGBP(pMax, currency, rates));
      if (typeof conv === 'number' && isFinite(conv)) pMax = toDisplayGBP(conv);
    }
    if (pMin != null) min = Math.min(min, pMin);
    if (pMax != null) max = Math.max(max, pMax);
  }
  if (!isFinite(min) || !isFinite(max) || min === Number.POSITIVE_INFINITY) {
    const mf = get(manifestAtom);
    min = mf.minPrice ?? 0;
    max = mf.maxPrice ?? 0;
  }
  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 0;
  return { min: toDisplayGBP(min), max: toDisplayGBP(max) };
});

// Available shipping origins derived from current dataset (global; not category-scoped)
export const shipFromOptionsAtom = atom((get) => {
  const allFull = get(allItemsAtom);
  const source = (Array.isArray(allFull) && allFull.length > 0) ? allFull : get(itemsAtom);
  const set = new Set();
  for (const it of (source || [])) {
    const code = it && typeof it.shipsFrom === 'string' ? normalizeShipFromCode(it.shipsFrom) : null;
    if (code) set.add(code);
  }
  return Array.from(set).sort();
});

// Dynamic active bounds (category + subcategory scoped)
export const activePriceBoundsAtom = atom((get) => {
  const rates = get(exchangeRatesAtom);
  const all = get(itemsAtom);
  const cat = get(categoryAtom);
  const subs = get(selectedSubcategoriesAtom) || [];
  if (!Array.isArray(all) || all.length === 0) return get(priceBoundsAtom);
  let scoped = cat && cat !== 'All' ? all.filter(i => i.category === cat) : all;
  if (subs.length > 0) scoped = scoped.filter(i => Array.isArray(i.subcategories) && i.subcategories.some(s => subs.includes(s)));
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const it of scoped) {
    if (!it) continue;
    const currency = it.baseCurrency || 'USD';
    let pMin = it.priceMin;
    let pMax = it.priceMax;
    if (typeof pMin === 'number') {
      const conv = currency === 'GBP' ? pMin : (rates && rates['USD'] && currency === 'USD' ? pMin / rates['USD'] : convertToGBP(pMin, currency, rates));
      if (typeof conv === 'number' && isFinite(conv)) pMin = toDisplayGBP(conv);
    }
    if (typeof pMax === 'number') {
      const conv = currency === 'GBP' ? pMax : (rates && rates['USD'] && currency === 'USD' ? pMax / rates['USD'] : convertToGBP(pMax, currency, rates));
      if (typeof conv === 'number' && isFinite(conv)) pMax = toDisplayGBP(conv);
    }
    if (typeof pMin === 'number') min = Math.min(min, pMin);
    if (typeof pMax === 'number') max = Math.max(max, pMax);
  }
  if (min === Number.POSITIVE_INFINITY || max === 0 || min > max) return get(priceBoundsAtom);
  return { min: toDisplayGBP(min), max: toDisplayGBP(max) };
});

// Favourites
export const favouritesAtom = atomWithStorage("favourites", []); // array of item ids
export const favouritesOnlyAtom = atomWithStorage("favouritesOnly", false);
export const toggleFavouriteAtom = atom(null, (get, set, itemId) => {
  const curr = get(favouritesAtom) || [];
  const exists = curr.includes(itemId);
  const next = exists ? curr.filter((id) => id !== itemId) : [...curr, itemId];
  set(favouritesAtom, next);
});

// Derived filtered items: first by category, then by case-insensitive text match
export const filteredItemsAtom = atom((get) => {
  const rates = get(exchangeRatesAtom);
  const items = get(itemsAtom);
  const category = get(categoryAtom);
  const selectedSubs = get(selectedSubcategoriesAtom);
  const selectedShips = get(selectedShipFromAtom);
  const freeShipOnly = get(freeShippingOnlyAtom);
  const query = get(searchQueryAtom).trim().toLowerCase();
  const excludedSellers = get(excludedSellersAtom).map((s) => s.toLowerCase());
  const includedSellers = get(includedSellersAtom).map((s) => s.toLowerCase());
  const { min: boundMin, max: boundMax } = get(priceBoundsAtom);
  const norm = get(normalizedPriceRangeAtom);
  const minFilter = norm.min;
  const maxFilter = norm.max;
  const favouritesOnly = get(favouritesOnlyAtom);
  const favouriteIds = favouritesOnly ? (get(favouritesAtom) || []) : [];

  let list = category && category !== "All"
    ? items.filter((it) => it.category === category)
    : items;
  if (category && category !== 'All' && Array.isArray(selectedSubs) && selectedSubs.length > 0) {
    list = list.filter((it) => Array.isArray(it.subcategories) && it.subcategories.some((s) => selectedSubs.includes(s)));
  }
  if (Array.isArray(selectedShips) && selectedShips.length > 0) {
    const set = new Set(selectedShips);
    list = list.filter((it) => {
      if (!it || typeof it.shipsFrom !== 'string') return false;
      const code = normalizeShipFromCode(it.shipsFrom);
      return code ? set.has(code) : false;
    });
  }
  if (freeShipOnly) {
    const freeList = [];
    for (const it of list) {
      if (!it) continue;
      const shippingObj = it.shipping;
      let isFree = false;
      if (it.minShip != null) isFree = it.minShip === 0;
      else if (it.shippingPriceRange && it.shippingPriceRange.min != null) isFree = it.shippingPriceRange.min === 0;
      else if (shippingObj && shippingObj.shippingPriceRange && shippingObj.shippingPriceRange.min != null) isFree = shippingObj.shippingPriceRange.min === 0;
      else if (shippingObj && Array.isArray(shippingObj.options)) isFree = shippingObj.options.some(o => o && o.cost === 0);
      if (isFree) freeList.push(it);
    }
    list = freeList; // unknown & paid excluded
  }
  if (includedSellers.length > 0) {
    list = list.filter((it) => includedSellers.includes((it.sellerName || "").toLowerCase()));
  }
  if (favouritesOnly) {
    list = list.filter((it) => favouriteIds.includes(it.id));
  }
  if (excludedSellers.length > 0) list = list.filter((it) => !excludedSellers.includes((it.sellerName || "").toLowerCase()));
  // Price filter in GBP (display rounding)
  list = list.filter((it) => {
    if (it.priceMin == null && it.priceMax == null) {
      return minFilter <= boundMin && maxFilter >= boundMax; // unchanged logic for unknown price
    }
    const currency = it.baseCurrency || 'USD';
    const baseMin = it.priceMin ?? it.priceMax ?? 0;
    const baseMax = it.priceMax ?? it.priceMin ?? 0;
    const convMinRaw = currency === 'GBP' ? baseMin : (rates && rates['USD'] && currency === 'USD' ? baseMin / rates['USD'] : convertToGBP(baseMin, currency, rates));
    const convMaxRaw = currency === 'GBP' ? baseMax : (rates && rates['USD'] && currency === 'USD' ? baseMax / rates['USD'] : convertToGBP(baseMax, currency, rates));
    const convMin = toDisplayGBP(typeof convMinRaw === 'number' ? convMinRaw : baseMin);
    const convMax = toDisplayGBP(typeof convMaxRaw === 'number' ? convMaxRaw : baseMax);
    return convMax >= minFilter && convMin <= maxFilter;
  });

  if (!query) return list;

  return list.filter((it) => {
    const haystack = `${it.name || ""} ${it.description || ""}`.toLowerCase();
    return haystack.includes(query);
  });
});

// Theme persistence via localStorage
export const themeAtom = atomWithStorage("theme", "light");
export const darkModeAtom = atomWithStorage("darkMode", false);
export const pauseGifsAtom = atomWithStorage("pauseGifs", false);

// Persist user preference for including shipping in variant price calculations
export const includeShippingPrefAtom = atomWithStorage("includeShippingPref", false);

// Display currency preference: 'GBP' (default) or 'USD'
export const displayCurrencyAtom = atomWithStorage("displayCurrency", "GBP");

// Expanded item (detail overlay) - prefer refNum identity (string)
export const expandedRefNumAtom = atom(null); // string | null
// Legacy alias (will deprecate) for any early code referencing id-based expansion
export const expandedItemIdAtom = expandedRefNumAtom;
// Seller overlay (numeric id)
export const expandedSellerIdAtom = atom(null);
// Overlay z-index coordination: track stacking history
export const topOverlayAtom = atom([]);
export const pushOverlayAtom = atom(null, (get, set, layer) => {
  const stack = [...(get(topOverlayAtom) || [])];
  const next = stack.filter((item) => item !== layer);
  next.push(layer);
  set(topOverlayAtom, next);
});
export const popOverlayAtom = atom(null, (get, set, layer) => {
  const stack = [...(get(topOverlayAtom) || [])].filter((item) => item !== layer);
  set(topOverlayAtom, stack);
});
export const topOverlayTopAtom = atom((get) => {
  const stack = get(topOverlayAtom);
  return stack.length ? stack[stack.length - 1] : 'none';
});

// Sorting
export const sortKeyAtom = atomWithStorage("sortKey", "hotness"); // hotness | firstSeen | name | reviewsCount | reviewsRating | price | endorsements | arrival
export const sortDirAtom = atomWithStorage("sortDir", "desc"); // asc | desc

export const sortedItemsAtom = atom((get) => {
  const rates = get(exchangeRatesAtom);
  const items = get(filteredItemsAtom);
  const key = get(sortKeyAtom);
  const dir = get(sortDirAtom);
  const factor = dir === "desc" ? -1 : 1;
  const toNumber = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const votes = key === 'endorsements' ? get(votesAtom) : null; // only read when needed
  const sorted = [...items].sort((a, b) => {
    if (key === "firstSeen") {
      const at = a.firstSeenAtMs || 0;
      const bt = b.firstSeenAtMs || 0;
      return factor * (at - bt);
    }
    if (key === "lastUpdated") {
      const at = a.lastUpdatedAtMs || a.firstSeenAtMs || 0;
      const bt = b.lastUpdatedAtMs || b.firstSeenAtMs || 0;
      return factor * (at - bt);
    }
    if (key === "hotness") {
      const av = toNumber(a.hotness) ?? -Infinity;
      const bv = toNumber(b.hotness) ?? -Infinity;
      return factor * (av - bv);
    }
    if (key === 'endorsements') {
      const av = votes ? (votes[String(a.id)] ?? a.endorsementCount ?? -Infinity) : (a.endorsementCount ?? -Infinity);
      const bv = votes ? (votes[String(b.id)] ?? b.endorsementCount ?? -Infinity) : (b.endorsementCount ?? -Infinity);
      return factor * (av - bv);
    }
    if (key === 'arrival') {
      const av = toNumber(a.reviewStats?.averageDaysToArrive) ?? Infinity;
      const bv = toNumber(b.reviewStats?.averageDaysToArrive) ?? Infinity;
      return factor * (av - bv);
    }
    if (key === "name") {
      return factor * (a.name || "").localeCompare(b.name || "");
    }
    if (key === "reviewsCount") {
      const av = toNumber(a.reviewStats?.numberOfReviews) ?? -Infinity;
      const bv = toNumber(b.reviewStats?.numberOfReviews) ?? -Infinity;
      return factor * (av - bv);
    }
    if (key === "reviewsRating") {
      const av = toNumber(a.reviewStats?.averageRating) ?? -Infinity;
      const bv = toNumber(b.reviewStats?.averageRating) ?? -Infinity;
      return factor * (av - bv);
    }
    if (key === "price") {
      const currencyA = a.baseCurrency || 'USD';
      const currencyB = b.baseCurrency || 'USD';
      const rawA = toNumber(a.priceMin) ?? toNumber(a.priceMax) ?? (dir === "asc" ? Infinity : -Infinity);
      const rawB = toNumber(b.priceMin) ?? toNumber(b.priceMax) ?? (dir === "asc" ? Infinity : -Infinity);
      const convARaw = currencyA === 'GBP' ? rawA : (rates && rates['USD'] && currencyA === 'USD' ? rawA / rates['USD'] : convertToGBP(rawA, currencyA, rates));
      const convBRaw = currencyB === 'GBP' ? rawB : (rates && rates['USD'] && currencyB === 'USD' ? rawB / rates['USD'] : convertToGBP(rawB, currencyB, rates));
      const aMin = toDisplayGBP(typeof convARaw === 'number' ? convARaw : rawA);
      const bMin = toDisplayGBP(typeof convBRaw === 'number' ? convBRaw : rawB);
      if (aMin === bMin) return 0;
      return dir === "asc" ? (aMin < bMin ? -1 : 1) : (aMin > bMin ? -1 : 1);
    }
    return 0;
  });
  return sorted;
});

// Endorsements initial ready state
export const endorsementsInitialReadyAtom = atom((get) => {
  const sortKey = get(sortKeyAtom);
  if (sortKey !== 'endorsements') return true;
  const items = get(filteredItemsAtom) || [];
  const votes = get(votesAtom) || {};
  for (const it of items) {
    const id = String(it.id);
    if (votes[id] == null && typeof it.endorsementCount !== 'number') return false;
  }
  return true;
});

// --- Sidebar utility atoms (active filter count + reset) ---
export const activeFiltersCountAtom = atom((get) => {
  const category = get(categoryAtom);
  const subs = get(selectedSubcategoriesAtom) || [];
  const query = (get(searchQueryAtom) || '').trim();
  const favOnly = !!get(favouritesOnlyAtom);
  const included = get(includedSellersAtom) || [];
  const excluded = get(excludedSellersAtom) || [];
  const norm = get(normalizedPriceRangeAtom);
  const userSetPrice = get(priceRangeUserSetAtom);
  const freeShipOnly = get(freeShippingOnlyAtom);
  const selectedShips = get(selectedShipFromAtom) || [];
  const shipPinned = !!get(shipFromPinnedAtom);
  const pricePinned = !!get(priceFilterPinnedAtom);
  const includePinned = !!get(includedSellersPinnedAtom);
  const excludePinned = !!get(excludedSellersPinnedAtom);
  const minActive = userSetPrice && norm.min > norm.boundMin;
  const maxActive = userSetPrice && norm.max < norm.boundMax;
  let count = 0;
  if (category && category !== 'All') count++;
  if (subs.length > 0) count++;
  if (query) count++;
  if (favOnly) count++;
  if (included.length > 0 && !includePinned) count++;
  if (excluded.length > 0 && !excludePinned) count++;
  if ((minActive || maxActive) && !pricePinned) count++;
  if ((freeShipOnly || (Array.isArray(selectedShips) && selectedShips.length > 0)) && !shipPinned) count++;
  return count;
});

export const resetFiltersAtom = atom(null, (get, set) => {
  const bounds = get(priceBoundsAtom); // capture current (may be narrow until new items load)
  const shipPinned = get(shipFromPinnedAtom);
  const pricePinned = get(priceFilterPinnedAtom);
  const includePinned = get(includedSellersPinnedAtom);
  const excludePinned = get(excludedSellersPinnedAtom);
  set(categoryAtom, 'All');
  set(selectedSubcategoriesAtom, []);
  set(searchQueryAtom, '');
  if (!includePinned) set(includedSellersAtom, []);
  if (!excludePinned) set(excludedSellersAtom, []);
  set(favouritesOnlyAtom, false);
  if (!shipPinned) {
    set(selectedShipFromAtom, []);
    set(freeShippingOnlyAtom, false);
  }
  // Use null sentinels so UI + filters interpret as "full range" and auto-expand when global data arrives
  if (!pricePinned) {
    set(priceRangeAtom, { min: null, max: null });
    set(priceRangeUserSetAtom, false);
  }
});

// Thumbnail aspect ratio
export const thumbnailAspectAtom = atomWithStorage("thumbAspect", "landscape"); // landscape | square | portrait

// Dynamic per-category counts reflecting current global filters (excluding category/subcategory filters)
export const categoryLiveCountsAtom = atom((get) => {
  const rates = get(exchangeRatesAtom);
  const allItemsFull = get(allItemsAtom);
  const itemsSource = Array.isArray(allItemsFull) && allItemsFull.length > 0 ? allItemsFull : get(itemsAtom);
  const manifest = get(manifestAtom);
  const selectedShips = get(selectedShipFromAtom);
  const freeShipOnly = get(freeShippingOnlyAtom);
  const shipPinned = get(shipFromPinnedAtom);
  const query = (get(searchQueryAtom) || '').trim().toLowerCase();
  const favouritesOnly = get(favouritesOnlyAtom);
  const favouriteIds = favouritesOnly ? (get(favouritesAtom) || []) : [];
  const excludedSellers = (get(excludedSellersAtom) || []).map(s => s.toLowerCase());
  const includedSellers = (get(includedSellersAtom) || []).map(s => s.toLowerCase());
  const norm = get(normalizedPriceRangeAtom);
  const { boundMin, boundMax } = norm;
  const minFilter = norm.min;
  const maxFilter = norm.max;
  if ((!Array.isArray(allItemsFull) || allItemsFull.length === 0) && manifest && manifest.totalItems && manifest.totalItems > (itemsSource?.length || 0) && (!Array.isArray(selectedShips) || selectedShips.length === 0) && !freeShipOnly) {
    const counts = { __total: manifest.totalItems };
    for (const [cat, info] of Object.entries(manifest.categories || {})) {
      if (cat === 'Tips') continue;
      counts[cat] = info?.count || 0;
    }
    return counts;
  }
  if (!Array.isArray(itemsSource) || itemsSource.length === 0) return { __total: 0 };
  let list = itemsSource.filter(it => !!it);
  if (Array.isArray(selectedShips) && selectedShips.length > 0) {
    const set = new Set(selectedShips);
    list = list.filter(it => {
      if (!it || typeof it.shipsFrom !== 'string') return false;
      const code = normalizeShipFromCode(it.shipsFrom);
      return code ? set.has(code) : false;
    });
  }
  if (freeShipOnly) {
    const freeList = [];
    for (const it of list) {
      if (!it) continue;
      const shippingObj = it.shipping;
      let isFree = false;
      if (it.minShip != null) isFree = it.minShip === 0;
      else if (it.shippingPriceRange && it.shippingPriceRange.min != null) isFree = it.shippingPriceRange.min === 0;
      else if (shippingObj && shippingObj.shippingPriceRange && shippingObj.shippingPriceRange.min != null) isFree = shippingObj.shippingPriceRange.min === 0;
      else if (shippingObj && Array.isArray(shippingObj.options)) isFree = shippingObj.options.some(o => o && o.cost === 0);
      if (isFree) freeList.push(it);
    }
    list = freeList;
  }
  if (includedSellers.length > 0) list = list.filter(it => includedSellers.includes((it.sellerName || '').toLowerCase()));
  if (favouritesOnly) list = list.filter(it => favouriteIds.includes(it.id));
  if (excludedSellers.length > 0) list = list.filter(it => !excludedSellers.includes((it.sellerName || '').toLowerCase()));
  list = list.filter(it => {
    if (it.priceMin == null && it.priceMax == null) {
      return minFilter <= boundMin && maxFilter >= boundMax;
    }
    const currency = it.baseCurrency || 'USD';
    const baseMin = it.priceMin ?? it.priceMax ?? 0;
    const baseMax = it.priceMax ?? it.priceMin ?? 0;
    const convMinRaw = currency === 'GBP' ? baseMin : (rates && rates['USD'] && currency === 'USD' ? baseMin / rates['USD'] : convertToGBP(baseMin, currency, rates));
    const convMaxRaw = currency === 'GBP' ? baseMax : (rates && rates['USD'] && currency === 'USD' ? baseMax / rates['USD'] : convertToGBP(baseMax, currency, rates));
    const convMin = toDisplayGBP(typeof convMinRaw === 'number' ? convMinRaw : baseMin);
    const convMax = toDisplayGBP(typeof convMaxRaw === 'number' ? convMaxRaw : baseMax);
    return convMax >= minFilter && convMin <= maxFilter;
  });
  if (query) {
    list = list.filter(it => {
      const hay = `${it.name || ''} ${it.description || ''}`.toLowerCase();
      return hay.includes(query);
    });
  }
  const counts = {};
  for (const it of list) {
    if (!it.category) continue;
    counts[it.category] = (counts[it.category] || 0) + 1;
  }
  counts.__total = list.length;
  return counts;
});

// Live subcategory counts for the currently selected category, respecting filters
export const subcategoryLiveCountsAtom = atom((get) => {
  const rates = get(exchangeRatesAtom);
  const allItemsFull = get(allItemsAtom);
  const itemsSource = Array.isArray(allItemsFull) && allItemsFull.length > 0 ? allItemsFull : get(itemsAtom);
  const selectedShips = get(selectedShipFromAtom);
  const shipPinned = get(shipFromPinnedAtom);
  const freeShipOnly = get(freeShippingOnlyAtom);
  const query = (get(searchQueryAtom) || '').trim().toLowerCase();
  const favouritesOnly = get(favouritesOnlyAtom);
  const favouriteIds = favouritesOnly ? (get(favouritesAtom) || []) : [];
  const excludedSellers = (get(excludedSellersAtom) || []).map(s => s.toLowerCase());
  const includedSellers = (get(includedSellersAtom) || []).map(s => s.toLowerCase());
  const norm = get(normalizedPriceRangeAtom);
  const { boundMin, boundMax } = norm;
  const minFilter = norm.min;
  const maxFilter = norm.max;
  const category = get(categoryAtom);
  if (!category || category === 'All') return {};
  if (!Array.isArray(itemsSource) || itemsSource.length === 0) return {};
  let list = itemsSource.filter(it => !!it && it.category === category);
  if (Array.isArray(selectedShips) && selectedShips.length > 0) {
    const set = new Set(selectedShips);
    list = list.filter(it => {
      if (!it || typeof it.shipsFrom !== 'string') return false;
      const code = normalizeShipFromCode(it.shipsFrom);
      return code ? set.has(code) : false;
    });
  }
  if (freeShipOnly) {
    const freeList = [];
    for (const it of list) {
      if (!it) continue;
      const shippingObj = it.shipping;
      let isFree = false;
      if (it.minShip != null) isFree = it.minShip === 0;
      else if (it.shippingPriceRange && it.shippingPriceRange.min != null) isFree = it.shippingPriceRange.min === 0;
      else if (shippingObj && shippingObj.shippingPriceRange && shippingObj.shippingPriceRange.min != null) isFree = shippingObj.shippingPriceRange.min === 0;
      else if (shippingObj && Array.isArray(shippingObj.options)) isFree = shippingObj.options.some(o => o && o.cost === 0);
      if (isFree) freeList.push(it);
    }
    list = freeList;
  }
  if (includedSellers.length > 0) list = list.filter(it => includedSellers.includes((it.sellerName || '').toLowerCase()));
  if (favouritesOnly) list = list.filter(it => favouriteIds.includes(it.id));
  if (excludedSellers.length > 0) list = list.filter(it => !excludedSellers.includes((it.sellerName || '').toLowerCase()));
  list = list.filter(it => {
    if (it.priceMin == null && it.priceMax == null) {
      return minFilter <= boundMin && maxFilter >= boundMax;
    }
    const currency = it.baseCurrency || 'USD';
    const baseMin = it.priceMin ?? it.priceMax ?? 0;
    const baseMax = it.priceMax ?? it.priceMin ?? 0;
    const convMinRaw = currency === 'GBP' ? baseMin : (rates && rates['USD'] && currency === 'USD' ? baseMin / rates['USD'] : convertToGBP(baseMin, currency, rates));
    const convMaxRaw = currency === 'GBP' ? baseMax : (rates && rates['USD'] && currency === 'USD' ? baseMax / rates['USD'] : convertToGBP(baseMax, currency, rates));
    const convMin = toDisplayGBP(typeof convMinRaw === 'number' ? convMinRaw : baseMin);
    const convMax = toDisplayGBP(typeof convMaxRaw === 'number' ? convMaxRaw : baseMax);
    return convMax >= minFilter && convMin <= maxFilter;
  });
  if (query) {
    list = list.filter(it => {
      const hay = `${it.name || ''} ${it.description || ''}`.toLowerCase();
      return hay.includes(query);
    });
  }
  const counts = {};
  for (const it of list) {
    const subs = Array.isArray(it.subcategories) ? it.subcategories : [];
    for (const s of subs) counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
});

// --- Basket (shopping) state ---
// Persist basket in localStorage so it survives reloads
export const basketAtom = atomWithStorage("basket", []); // array of {id, refNum, variantId, variantDesc, name, sellerName, qty, priceGBP, imageUrl, biggyLink}

// Derived: total item count (sum of quantities)
export const basketCountAtom = atom((get) => {
  const items = get(basketAtom) || [];
  let count = 0;
  for (const it of items) {
    const q = typeof it?.qty === 'number' && isFinite(it.qty) ? it.qty : 0;
    count += q;
  }
  return count;
});

// Derived: total price in GBP
export const basketTotalAtom = atom((get) => {
  const items = get(basketAtom) || [];
  const rates = get(exchangeRatesAtom) || {};
  const usdRate = typeof rates['USD'] === 'number' && rates['USD'] > 0 ? rates['USD'] : null;
  // Group by sellerName; add shipping once per seller if includeShip flagged on any line
  const buckets = new Map(); // seller -> { items: [], shipUsd: number|null, includeShip: boolean }
  for (const it of items) {
    const seller = (it?.sellerName || '').toLowerCase();
    if (!buckets.has(seller)) buckets.set(seller, { items: [], shipUsd: null, includeShip: false });
    const b = buckets.get(seller);
    b.items.push(it);
    if (it?.includeShip && typeof it?.shippingUsd === 'number') {
      b.includeShip = true;
      // choose a shipping cost to apply once per seller: prefer lowest paid if >0; allow 0
      const s = it.shippingUsd;
      if (b.shipUsd == null) b.shipUsd = s;
      else b.shipUsd = Math.min(b.shipUsd, s);
    }
  }
  let totalGbp = 0;
  for (const [, b] of buckets) {
    let sellerUsd = 0;
    for (const it of b.items) {
      const q = typeof it?.qty === 'number' && isFinite(it.qty) ? it.qty : 0;
      if (typeof it?.priceUSD === 'number') {
        sellerUsd += it.priceUSD * q;
      } else if (typeof it?.priceGBP === 'number') {
        totalGbp += it.priceGBP * q; // legacy lines in GBP added directly
      }
    }
    if (b.includeShip && typeof b.shipUsd === 'number') sellerUsd += b.shipUsd;
    if (sellerUsd > 0) totalGbp += (usdRate ? (sellerUsd / usdRate) : sellerUsd);
  }
  return totalGbp;
});

// Action: add item (merge by id+variantId)
export const addToBasketAtom = atom(null, (get, set, payload) => {
  const items = Array.isArray(get(basketAtom)) ? [...get(basketAtom)] : [];
  const keyId = String(payload?.id ?? payload?.refNum ?? '')
  const keyVar = String(payload?.variantId ?? '');
  const idx = items.findIndex(it => String(it.id ?? it.refNum ?? '') === keyId && String(it.variantId ?? '') === keyVar);
  if (idx >= 0) {
    const existing = items[idx];
    const nextQty = (typeof existing.qty === 'number' ? existing.qty : 0) + (typeof payload.qty === 'number' ? payload.qty : 1);
    items[idx] = { ...existing, qty: nextQty };
  } else {
    const entry = {
      id: payload?.id ?? null,
      refNum: payload?.refNum ?? null,
      variantId: payload?.variantId ?? null,
      variantDesc: payload?.variantDesc ?? '',
      name: payload?.name ?? 'Item',
      sellerName: payload?.sellerName ?? '',
      qty: typeof payload?.qty === 'number' && payload.qty > 0 ? payload.qty : 1,
      // Pricing: prefer USD storage for accuracy
      priceUSD: typeof payload?.priceUSD === 'number' ? payload.priceUSD : (typeof payload?.priceGBP === 'number' ? null : null),
      shippingUsd: typeof payload?.shippingUsd === 'number' ? payload.shippingUsd : null,
      includeShip: !!payload?.includeShip,
      // Legacy fallback for older entries
      priceGBP: typeof payload?.priceGBP === 'number' ? payload.priceGBP : null,
      imageUrl: payload?.imageUrl ?? null,
      biggyLink: payload?.biggyLink ?? null,
      addedAt: Date.now(),
    };
    items.push(entry);
  }
  set(basketAtom, items);
});

// Action: remove one entry entirely
export const removeFromBasketAtom = atom(null, (get, set, { id, variantId }) => {
  const items = Array.isArray(get(basketAtom)) ? [...get(basketAtom)] : [];
  const keyId = String(id ?? '');
  const keyVar = String(variantId ?? '');
  const next = items.filter(it => !(String(it.id ?? '') === keyId && String(it.variantId ?? '') === keyVar));
  set(basketAtom, next);
});

// Action: set quantity for an entry
export const setBasketQtyAtom = atom(null, (get, set, { id, variantId, qty }) => {
  const items = Array.isArray(get(basketAtom)) ? [...get(basketAtom)] : [];
  const keyId = String(id ?? '');
  const keyVar = String(variantId ?? '');
  const i = items.findIndex(it => String(it.id ?? '') === keyId && String(it.variantId ?? '') === keyVar);
  if (i >= 0) {
    const q = Math.max(0, Math.floor(Number(qty) || 0));
    if (q === 0) items.splice(i, 1);
    else items[i] = { ...items[i], qty: q };
    set(basketAtom, items);
  }
});

// Action: clear
export const clearBasketAtom = atom(null, (get, set) => set(basketAtom, []));

// --- UI toast ---
export const toastAtom = atom({ id: 0, message: null });
export const showToastAtom = atom(null, (get, set, message) => {
  const id = Date.now();
  set(toastAtom, { id, message });
  // auto-clear after 2 seconds
  setTimeout(() => {
    set(toastAtom, (curr) => (curr.id === id ? { id: 0, message: null } : curr));
  }, 2000);
});
