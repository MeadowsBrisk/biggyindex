import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { votesAtom, reconcileLocalEndorsementsAtom } from "./votesAtoms"; // endorsements sorting and reconciliation
import { convertToGBP } from "@/hooks/useExchangeRates"; // FX conversion helper
import { normalizeShipFromCode } from "@/lib/countries";

// --- Types (pragmatic, focused on fields used across the app) ---
export type ExchangeRates = Record<string, number> | null;
export type Item = any; // Keep broad for now; normalization ensures fields exist where used
export type Manifest = { totalItems: number; minPrice: number | null; maxPrice: number | null; categories: Record<string, { count?: number } | undefined> };
export type PriceRange = { min: number | null; max: number | null };
export type NormalizedPriceRange = { min: number; max: number; boundMin: number; boundMax: number };
export type BasketEntry = {
  id: string | number | null;
  refNum: string | number | null;
  variantId: string | number | null;
  variantDesc: string;
  name: string;
  sellerName: string;
  qty: number;
  priceUSD: number | null;
  shippingUsd: number | null;
  includeShip: boolean;
  priceGBP: number | null; // legacy
  imageUrl: string | null;
  sl: string | null;
  addedAt: number;
};

// Define FX rates atom (base GBP) so downstream atoms can read it
export const exchangeRatesAtom = atom<ExchangeRates>(null);

// Helper: display rounding (ceil) with tiny epsilon to avoid float artifacts
const toDisplayGBP = (v: any): number => (typeof v === 'number' && isFinite(v) ? Math.ceil(v - 1e-9) : v);

// Internal writable atom for the full items list
const itemsBaseAtom = atom<Item[]>([]);

// Internal writable atom holding the full unfiltered (all categories) dataset once fetched
const allItemsBaseAtom = atom<Item[]>([]);

// Public read-only atom exposed to components
export const itemsAtom = atom<Item[]>((get) => get(itemsBaseAtom));
export const allItemsAtom = atom<Item[]>((get) => get(allItemsBaseAtom));
export const isLoadingAtom = atom<boolean>(false);

// Write-only atom to set items from the page
export const setItemsAtom = atom<null, [any], void>(null, (get: any, set: any, newItems: any) => {
  const src: any[] = Array.isArray(newItems) ? newItems : [];
  // Normalize compact schema -> UI schema expected by components/atoms
  const arr: Item[] = src.map((raw: any) => {
    if (!raw || typeof raw !== 'object') return raw;
    const it: any = { ...raw };
    // Identity
    it.id = raw.id != null ? raw.id : raw.refNum ?? raw.ref ?? raw.refnum ?? null;
    it.refNum = it.refNum || (it.id != null ? String(it.id) : null);
    // Names & media
    it.name = raw.n ?? raw.name ?? it.name;
    it.description = raw.d ?? raw.description ?? it.description ?? '';
    const img = raw.i ?? raw.image ?? null;
    const imgs = Array.isArray(raw.is) ? raw.is : (img ? [img] : []);
    if (img && !imgs.includes(img)) imgs.unshift(img);
    it.image = img || null;
    it.images = imgs;
    it.imageUrl = img || null;
    it.imageUrls = imgs;
    // Seller
    it.sellerId = raw.sid ?? it.sellerId ?? null;
    it.sellerName = raw.sn ?? it.sellerName ?? null;
    // Category
    it.category = raw.c ?? it.category ?? null;
    it.subcategories = Array.isArray(raw.sc) ? raw.sc : (Array.isArray(it.subcategories) ? it.subcategories : []);
    // Shipping origin
    it.shipsFrom = raw.sf ?? it.shipsFrom ?? null;
    // Hotness
    it.hotness = raw.h ?? it.hotness ?? null;
    // Timestamps
    it.firstSeenAt = raw.fsa ?? it.firstSeenAt ?? null;
    it.lastUpdatedAt = raw.lua ?? it.lastUpdatedAt ?? null;
    it.lastUpdateReason = raw.lur ?? it.lastUpdateReason ?? null;
    // Endorsements
    it.endorsementCount = typeof raw.ec === 'number' ? raw.ec : (it.endorsementCount ?? null);
    // Share link passthrough
    it.share = raw.sl ?? it.share ?? null;
    // Pricing: store as USD base by default; atoms convert to GBP for filters/sorting
    const uMin = raw.uMin;
    const uMax = raw.uMax;
    it.baseCurrency = it.baseCurrency || 'USD';
    if (typeof uMin === 'number') it.priceMin = uMin;
    if (typeof uMax === 'number') it.priceMax = uMax;
    // Variants mapping
    if (Array.isArray(raw.v)) {
      it.variants = raw.v.map((v: any) => ({
        id: v.vid ?? v.id ?? null,
        description: v.d ?? v.description ?? null,
        priceUSD: typeof v.usd === 'number' ? v.usd : (typeof v.priceUSD === 'number' ? v.priceUSD : null),
        baseAmount: typeof v.usd === 'number' ? v.usd : (typeof v.baseAmount === 'number' ? v.baseAmount : null),
      }));
    }
    // Shipping summary mapping for free shipping filter
    if (raw.sh && typeof raw.sh === 'object') {
      const sh = raw.sh;
      const min = typeof sh.min === 'number' ? sh.min : null;
      const isFree = sh.free === 1 || sh.free === true || min === 0;
      if (isFree) it.minShip = 0; else if (min != null) it.minShip = min;
      it.shippingPriceRange = { min: min != null ? min : (isFree ? 0 : null), max: typeof sh.max === 'number' ? sh.max : null };
      it.shipping = { shippingPriceRange: it.shippingPriceRange };
    }
    // Precompute numeric timestamps once to avoid repeated Date parsing
    if (it.firstSeenAt && it.firstSeenAtMs == null) {
      const t = Date.parse(it.firstSeenAt);
      it.firstSeenAtMs = !isNaN(t) ? t : 0;
    }
    if (it.lastUpdatedAt && it.lastUpdatedAtMs == null) {
      const t2 = Date.parse(it.lastUpdatedAt);
      it.lastUpdatedAtMs = !isNaN(t2) ? t2 : (it.firstSeenAtMs || 0);
    }
    return it;
  });
  set(itemsBaseAtom, arr);
  // Seed votesAtom with embedded endorsementCount values (no network) for items lacking a vote entry
  const votes = { ...(get(votesAtom) || {}) } as Record<string, number>;
  let changed = false;
  for (const it of arr as any[]) {
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
    set(reconcileLocalEndorsementsAtom as any);
  }
});

// Write-only atom to set all items (unfiltered, all categories) from the page
export const setAllItemsAtom = atom<null, [any], void>(null, (get: any, set: any, newItems: any) => {
  if (!Array.isArray(newItems)) return;
  // Reuse normalization from setItemsAtom
  const normalize = (raw: any) => {
    if (!raw || typeof raw !== 'object') return raw;
    const it: any = { ...raw };
    it.id = raw.id != null ? raw.id : raw.refNum ?? raw.ref ?? raw.refnum ?? null;
    it.refNum = it.refNum || (it.id != null ? String(it.id) : null);
    it.name = raw.n ?? raw.name ?? it.name;
    it.description = raw.d ?? raw.description ?? it.description ?? '';
    const img = raw.i ?? raw.image ?? null;
    const imgs = Array.isArray(raw.is) ? raw.is : (img ? [img] : []);
    if (img && !imgs.includes(img)) imgs.unshift(img);
    it.image = img || null;
    it.images = imgs;
    it.imageUrl = img || null;
    it.imageUrls = imgs;
    it.sellerId = raw.sid ?? it.sellerId ?? null;
    it.sellerName = raw.sn ?? it.sellerName ?? null;
    it.category = raw.c ?? it.category ?? null;
    it.subcategories = Array.isArray(raw.sc) ? raw.sc : (Array.isArray(it.subcategories) ? it.subcategories : []);
    it.shipsFrom = raw.sf ?? it.shipsFrom ?? null;
    it.hotness = raw.h ?? it.hotness ?? null;
    it.firstSeenAt = raw.fsa ?? it.firstSeenAt ?? null;
    it.lastUpdatedAt = raw.lua ?? it.lastUpdatedAt ?? null;
    it.lastUpdateReason = raw.lur ?? it.lastUpdateReason ?? null;
    it.endorsementCount = typeof raw.ec === 'number' ? raw.ec : (it.endorsementCount ?? null);
    it.share = raw.sl ?? it.share ?? null;
    const uMin = raw.uMin; const uMax = raw.uMax;
    it.baseCurrency = it.baseCurrency || 'USD';
    if (typeof uMin === 'number') it.priceMin = uMin;
    if (typeof uMax === 'number') it.priceMax = uMax;
    if (Array.isArray(raw.v)) {
      it.variants = raw.v.map((v: any) => ({
        id: v.vid ?? v.id ?? null,
        description: v.d ?? v.description ?? null,
        priceUSD: typeof v.usd === 'number' ? v.usd : (typeof v.priceUSD === 'number' ? v.priceUSD : null),
        baseAmount: typeof v.usd === 'number' ? v.usd : (typeof v.baseAmount === 'number' ? v.baseAmount : null),
      }));
    }
    if (raw.sh && typeof raw.sh === 'object') {
      const sh = raw.sh;
      const min = typeof sh.min === 'number' ? sh.min : null;
      const isFree = sh.free === 1 || sh.free === true || min === 0;
      if (isFree) it.minShip = 0; else if (min != null) it.minShip = min;
      it.shippingPriceRange = { min: min != null ? min : (isFree ? 0 : null), max: typeof sh.max === 'number' ? sh.max : null };
      it.shipping = { shippingPriceRange: it.shippingPriceRange };
    }
    if (it.firstSeenAt && it.firstSeenAtMs == null) {
      const t = Date.parse(it.firstSeenAt);
      it.firstSeenAtMs = !isNaN(t) ? t : 0;
    }
    if (it.lastUpdatedAt && it.lastUpdatedAtMs == null) {
      const t2 = Date.parse(it.lastUpdatedAt);
      it.lastUpdatedAtMs = !isNaN(t2) ? t2 : (it.firstSeenAtMs || 0);
    }
    return it;
  };
  set(allItemsBaseAtom, newItems.map(normalize));
});

// Selected category and subcategories
export const selectedSubcategoriesAtom = atom<string[]>([]);
export const excludedSubcategoriesAtom = atom<string[]>([]);

// Shipping origin filter (two-letter codes like 'uk','us') persisted across sessions
export const selectedShipFromAtom = atomWithStorage<string[]>("shipFrom", []);
// Free shipping only toggle (persisted). When enabled we include ONLY items explicitly detected as free (cost 0) and exclude unknown/paid.
export const freeShippingOnlyAtom = atomWithStorage<boolean>("freeShippingOnly", false);
export const shipFromPinnedAtom = atomWithStorage<boolean>("filterPinnedShipFrom", false);

const _categoryAtom = atom<string>("All");
export const categoryAtom = atom<string, [string], void>(
  (get) => get(_categoryAtom),
  (get: any, set: any, newCategory: string) => {
    set(_categoryAtom, newCategory);
    // reset selected and excluded subcategories when category changes
    set(selectedSubcategoriesAtom, []);
    set(excludedSubcategoriesAtom, []);
    // reset price range to full bounds on category change (use null sentinels)
    if (!get(priceFilterPinnedAtom)) {
      set(priceRangeAtom, { min: null, max: null });
      set(priceRangeUserSetAtom, false); // auto reset user-set flag
    }
  }
);

// Search query string
export const searchQueryAtom = atom<string>("");

// Excluded/included sellers by name (case-insensitive)
export const excludedSellersAtom = atomWithStorage<string[]>("excludedSellers", []);
export const includedSellersAtom = atomWithStorage<string[]>("includedSellers", []);
export const excludedSellersPinnedAtom = atomWithStorage<boolean>("filterPinnedExcluded", false);
export const includedSellersPinnedAtom = atomWithStorage<boolean>("filterPinnedIncluded", false);

// Manifest data (categories and price bounds) loaded at runtime
export const manifestAtom = atom<Manifest>({ totalItems: 0, minPrice: null, maxPrice: null, categories: {} });

// Price range filter
export const priceRangeAtom = atom<PriceRange>({ min: 0, max: Infinity });
export const priceRangeUserSetAtom = atom<boolean>(false);
export const priceFilterPinnedAtom = atomWithStorage<boolean>("filterPinnedPrice", false);

// Derived bounds from items (fallback to manifest bounds if available)
export const priceBoundsAtom = atom<{ min: number; max: number }>((get: any) => {
  const rates = get(exchangeRatesAtom) as ExchangeRates;
  const allFull = get(allItemsAtom) as Item[];
  const source: Item[] = (Array.isArray(allFull) && allFull.length > 0) ? allFull : get(itemsAtom);
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const it of source) {
    if (!it) continue;
    const currency = it.baseCurrency || 'USD';
    let pMin = it.priceMin;
    let pMax = it.priceMax;
    if (typeof pMin === 'number') {
      const conv = currency === 'GBP' ? pMin : (rates && rates['USD'] && currency === 'USD' ? pMin / (rates as any)['USD'] : convertToGBP(pMin, currency, rates as any));
      if (typeof conv === 'number' && isFinite(conv)) pMin = toDisplayGBP(conv);
    }
    if (typeof pMax === 'number') {
      const conv = currency === 'GBP' ? pMax : (rates && rates['USD'] && currency === 'USD' ? pMax / (rates as any)['USD'] : convertToGBP(pMax, currency, rates as any));
      if (typeof conv === 'number' && isFinite(conv)) pMax = toDisplayGBP(conv);
    }
    if (pMin != null) min = Math.min(min, pMin);
    if (pMax != null) max = Math.max(max, pMax);
  }
  if (!isFinite(min) || !isFinite(max) || min === Number.POSITIVE_INFINITY) {
    const mf = get(manifestAtom) as Manifest;
    min = (mf.minPrice ?? 0) as number;
    max = (mf.maxPrice ?? 0) as number;
  }
  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 0;
  return { min: toDisplayGBP(min), max: toDisplayGBP(max) };
});

// Normalized price range (clamped to current bounds; fallback to bounds on invalid persisted values)
export const normalizedPriceRangeAtom = atom<NormalizedPriceRange>((get: any) => {
  const raw = get(priceRangeAtom) || {}; // {min,max}
  const { min: boundMin, max: boundMax } = get(priceBoundsAtom);
  let minVal = Number.isFinite((raw as any).min) ? (raw as any).min : boundMin;
  let maxVal = Number.isFinite((raw as any).max) ? (raw as any).max : boundMax;
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

// Available shipping origins derived from current dataset (global; not category-scoped)
export const shipFromOptionsAtom = atom<string[]>((get: any) => {
  const allFull = get(allItemsAtom) as Item[];
  const source: Item[] = (Array.isArray(allFull) && allFull.length > 0) ? allFull : get(itemsAtom);
  const set = new Set<string>();
  for (const it of (source || [])) {
    const code = it && typeof it.shipsFrom === 'string' ? normalizeShipFromCode(it.shipsFrom) : null;
    if (code) set.add(code);
  }
  return Array.from(set).sort();
});

// Dynamic active bounds (category + subcategory scoped)
export const activePriceBoundsAtom = atom<{ min: number; max: number }>((get: any) => {
  const rates = get(exchangeRatesAtom) as ExchangeRates;
  const all = get(itemsAtom) as Item[];
  const cat = get(categoryAtom) as string;
  const subs = get(selectedSubcategoriesAtom) || [];
  if (!Array.isArray(all) || all.length === 0) return get(priceBoundsAtom);
  let scoped = cat && cat !== 'All' ? all.filter((i: any) => i.category === cat) : all;
  if ((subs as string[]).length > 0) scoped = scoped.filter((i: any) => Array.isArray(i.subcategories) && i.subcategories.some((s: any) => (subs as string[]).includes(s)));
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const it of scoped) {
    if (!it) continue;
    const currency = it.baseCurrency || 'USD';
    let pMin = it.priceMin;
    let pMax = it.priceMax;
    if (typeof pMin === 'number') {
      const conv = currency === 'GBP' ? pMin : (rates && (rates as any)['USD'] && currency === 'USD' ? pMin / (rates as any)['USD'] : convertToGBP(pMin, currency, rates as any));
      if (typeof conv === 'number' && isFinite(conv)) pMin = toDisplayGBP(conv);
    }
    if (typeof pMax === 'number') {
      const conv = currency === 'GBP' ? pMax : (rates && (rates as any)['USD'] && currency === 'USD' ? pMax / (rates as any)['USD'] : convertToGBP(pMax, currency, rates as any));
      if (typeof conv === 'number' && isFinite(conv)) pMax = toDisplayGBP(conv);
    }
    if (typeof pMin === 'number') min = Math.min(min, pMin);
    if (typeof pMax === 'number') max = Math.max(max, pMax);
  }
  if (min === Number.POSITIVE_INFINITY || max === 0 || min > max) return get(priceBoundsAtom);
  return { min: toDisplayGBP(min), max: toDisplayGBP(max) };
});

// Favourites
export const favouritesAtom = atomWithStorage<string[]>("favourites", []);
export const favouritesOnlyAtom = atomWithStorage<boolean>("favouritesOnly", false);
export const toggleFavouriteAtom = atom<null, [any], void>(null, (get: any, set: any, itemId: any) => {
  const curr: any[] = get(favouritesAtom) || [];
  const exists = curr.includes(itemId);
  const next = exists ? curr.filter((id) => id !== itemId) : [...curr, itemId];
  set(favouritesAtom, next);
});

// Derived filtered items
export const filteredItemsAtom = atom<Item[]>((get: any) => {
  const rates = get(exchangeRatesAtom) as ExchangeRates;
  const items = get(itemsAtom) as Item[];
  const category = get(categoryAtom) as string;
  const selectedSubs = get(selectedSubcategoriesAtom) as string[];
  const selectedShips = get(selectedShipFromAtom) as string[];
  const freeShipOnly = get(freeShippingOnlyAtom) as boolean;
  const query = (get(searchQueryAtom) as string).trim().toLowerCase();
  const excludedSellers = (get(excludedSellersAtom) as string[]).map((s) => s.toLowerCase());
  const includedSellers = (get(includedSellersAtom) as string[]).map((s) => s.toLowerCase());
  const { min: boundMin, max: boundMax } = get(priceBoundsAtom);
  const norm = get(normalizedPriceRangeAtom);
  const minFilter = norm.min;
  const maxFilter = norm.max;
  const favouritesOnly = get(favouritesOnlyAtom) as boolean;
  const favouriteIds = favouritesOnly ? (get(favouritesAtom) as any[] || []) : [];

  const excludedSubs = get(excludedSubcategoriesAtom) as string[];

  let list: any[] = category && category !== "All"
    ? (items || []).filter((it: any) => it.category === category)
    : (items || []);
  if (category && category !== 'All' && Array.isArray(selectedSubs) && selectedSubs.length > 0) {
    list = list.filter((it) => Array.isArray(it.subcategories) && it.subcategories.some((s: any) => selectedSubs.includes(s)));
  }
  // Exclude items with excluded subcategories
  if (category && category !== 'All' && Array.isArray(excludedSubs) && excludedSubs.length > 0) {
    list = list.filter((it) => !Array.isArray(it.subcategories) || !it.subcategories.some((s: any) => excludedSubs.includes(s)));
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
    const freeList: any[] = [];
    for (const it of list) {
      if (!it) continue;
      const shippingObj = it.shipping;
      let isFree = false;
      if (it.minShip != null) isFree = it.minShip === 0;
      else if (it.shippingPriceRange && it.shippingPriceRange.min != null) isFree = it.shippingPriceRange.min === 0;
      else if (shippingObj && shippingObj.shippingPriceRange && shippingObj.shippingPriceRange.min != null) isFree = shippingObj.shippingPriceRange.min === 0;
      else if (shippingObj && Array.isArray(shippingObj.options)) isFree = shippingObj.options.some((o: any) => o && o.cost === 0);
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
    const convMinRaw = currency === 'GBP' ? baseMin : (rates && (rates as any)['USD'] && currency === 'USD' ? baseMin / (rates as any)['USD'] : convertToGBP(baseMin, currency, rates as any));
    const convMaxRaw = currency === 'GBP' ? baseMax : (rates && (rates as any)['USD'] && currency === 'USD' ? baseMax / (rates as any)['USD'] : convertToGBP(baseMax, currency, rates as any));
    const convMin = toDisplayGBP(typeof convMinRaw === 'number' ? convMinRaw : baseMin);
    const convMax = toDisplayGBP(typeof convMaxRaw === 'number' ? convMaxRaw : baseMax);
    return convMax >= minFilter && convMin <= maxFilter;
  });

  if (!query) return list as Item[];

  return (list as any[]).filter((it) => {
    const haystack = `${it.name || ""} ${it.description || ""}`.toLowerCase();
    return haystack.includes(query);
  }) as Item[];
});

// Theme persistence via localStorage
export const themeAtom = atomWithStorage<string>("theme", "light");
export const darkModeAtom = atomWithStorage<boolean>("darkMode", false);
export const pauseGifsAtom = atomWithStorage<boolean>("pauseGifs", false);

// Persist user preference for including shipping in variant price calculations
export const includeShippingPrefAtom = atomWithStorage<boolean>("includeShippingPref", false);

// Display currency preference: 'GBP' (default) or 'USD'
export const displayCurrencyAtom = atomWithStorage<'GBP' | 'USD'>("displayCurrency", "GBP");

// First visit banner dismissal state
export const firstVisitBannerDismissedAtom = atomWithStorage<boolean>("firstVisitBannerDismissed", false);

// Expanded item (detail overlay) - prefer refNum identity (string)
export const expandedRefNumAtom = atom<string | null>(null);
// Legacy alias (will deprecate) for any early code referencing id-based expansion
export const expandedItemIdAtom = expandedRefNumAtom;
// Seller overlay (numeric id)
export const expandedSellerIdAtom = atom<number | string | null>(null);
// Seller analytics modal (boolean)
export const sellerAnalyticsOpenAtom = atom<boolean>(false);
// Latest reviews modal (boolean)
export const latestReviewsModalOpenAtom = atom<boolean>(false);
// Overlay z-index coordination: track stacking history
export const topOverlayAtom = atom<string[]>([]);
export const pushOverlayAtom = atom<null, [string], void>(null, (get: any, set: any, layer: string) => {
  const stack = [...(get(topOverlayAtom) || [])];
  const next = stack.filter((item) => item !== layer);
  next.push(layer);
  set(topOverlayAtom, next);
});
export const popOverlayAtom = atom<null, [string], void>(null, (get: any, set: any, layer: string) => {
  const stack = [...(get(topOverlayAtom) || [])].filter((item) => item !== layer);
  set(topOverlayAtom, stack);
});
export const topOverlayTopAtom = atom<string>((get) => {
  const stack = get(topOverlayAtom);
  return stack.length ? stack[stack.length - 1] : 'none';
});

// Sorting
export type SortKey = 'hotness' | 'firstSeen' | 'lastUpdated' | 'name' | 'reviewsCount' | 'reviewsRating' | 'price' | 'endorsements' | 'arrival';
export type SortDir = 'asc' | 'desc';
export const sortKeyAtom = atomWithStorage<SortKey>("sortKey", "hotness");
export const sortDirAtom = atomWithStorage<SortDir>("sortDir", "desc");

export const sortedItemsAtom = atom<Item[]>((get: any) => {
  const rates = get(exchangeRatesAtom) as ExchangeRates;
  const items = get(filteredItemsAtom) as Item[];
  const key = get(sortKeyAtom) as SortKey;
  const dir = get(sortDirAtom) as SortDir;
  const factor = dir === "desc" ? -1 : 1;
  const toNumber = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const votes = key === 'endorsements' ? (get(votesAtom) as Record<string, number> | null) : null;
  const sorted = [...(items || [])].sort((a: any, b: any) => {
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
      return factor * ((a.name || "").localeCompare(b.name || ""));
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
      const convARaw = currencyA === 'GBP' ? rawA : (rates && (rates as any)['USD'] && currencyA === 'USD' ? (rawA as number) / (rates as any)['USD'] : convertToGBP(rawA, currencyA, rates as any));
      const convBRaw = currencyB === 'GBP' ? rawB : (rates && (rates as any)['USD'] && currencyB === 'USD' ? (rawB as number) / (rates as any)['USD'] : convertToGBP(rawB, currencyB, rates as any));
      const aMin = toDisplayGBP(typeof convARaw === 'number' ? convARaw : (rawA as number));
      const bMin = toDisplayGBP(typeof convBRaw === 'number' ? convBRaw : (rawB as number));
      if (aMin === bMin) return 0;
      return dir === "asc" ? (aMin < bMin ? -1 : 1) : (aMin > bMin ? -1 : 1);
    }
    return 0;
  });
  return sorted as Item[];
});

// Endorsements initial ready state
export const endorsementsInitialReadyAtom = atom<boolean>((get: any) => {
  const sortKey = get(sortKeyAtom) as SortKey;
  if (sortKey !== 'endorsements') return true;
  const items = (get(filteredItemsAtom) || []) as any[];
  const votes = (get(votesAtom) || {}) as Record<string, number>;
  for (const it of items) {
    const id = String(it.id);
    if (votes[id] == null && typeof it.endorsementCount !== 'number') return false;
  }
  return true;
});

// --- Sidebar utility atoms (active filter count + reset) ---
export const activeFiltersCountAtom = atom<number>((get: any) => {
  const category = get(categoryAtom) as string;
  const subs = (get(selectedSubcategoriesAtom) || []) as string[];
  const query = ((get(searchQueryAtom) || '') as string).trim();
  const favOnly = !!get(favouritesOnlyAtom);
  const included = (get(includedSellersAtom) || []) as string[];
  const excluded = (get(excludedSellersAtom) || []) as string[];
  const norm = get(normalizedPriceRangeAtom);
  const userSetPrice = get(priceRangeUserSetAtom);
  const freeShipOnly = get(freeShippingOnlyAtom);
  const selectedShips = (get(selectedShipFromAtom) || []) as string[];
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

export const resetFiltersAtom = atom<null, [], void>(null, (get: any, set: any) => {
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
export const thumbnailAspectAtom = atomWithStorage<'landscape' | 'standard' | 'portrait'>("thumbAspect", "landscape");

// Accordion expanded/collapsed state
export const priceAccordionOpenAtom = atomWithStorage<boolean>("accordionPriceOpen", true);
export const sellersAccordionOpenAtom = atomWithStorage<boolean>("accordionSellersOpen", true);

// Dynamic per-category counts reflecting current global filters (excluding category/subcategory filters)
export const categoryLiveCountsAtom = atom<Record<string, number>>((get: any) => {
  const rates = get(exchangeRatesAtom) as ExchangeRates;
  const allItemsFull = get(allItemsAtom) as Item[];
  const itemsSource: Item[] = Array.isArray(allItemsFull) && allItemsFull.length > 0 ? allItemsFull : get(itemsAtom);
  const manifest = get(manifestAtom) as Manifest;
  const selectedShips = get(selectedShipFromAtom) as string[];
  const freeShipOnly = get(freeShippingOnlyAtom) as boolean;
  const shipPinned = get(shipFromPinnedAtom) as boolean;
  const query = ((get(searchQueryAtom) || '') as string).trim().toLowerCase();
  const favouritesOnly = get(favouritesOnlyAtom) as boolean;
  const favouriteIds = favouritesOnly ? (get(favouritesAtom) as any[] || []) : [];
  const excludedSellers = (get(excludedSellersAtom) || []).map((s: string) => s.toLowerCase());
  const includedSellers = (get(includedSellersAtom) || []).map((s: string) => s.toLowerCase());
  const norm = get(normalizedPriceRangeAtom);
  const { boundMin, boundMax } = norm;
  const minFilter = norm.min;
  const maxFilter = norm.max;
  if ((!Array.isArray(allItemsFull) || allItemsFull.length === 0) && manifest && (manifest as any).totalItems && (manifest as any).totalItems > ((itemsSource as any[])?.length || 0) && (!Array.isArray(selectedShips) || selectedShips.length === 0) && !freeShipOnly && includedSellers.length === 0) {
    const counts: Record<string, number> = { __total: (manifest as any).totalItems } as any;
    for (const [cat, info] of Object.entries((manifest.categories || {}))) {
      if (cat === 'Tips') continue;
      counts[cat] = (info as any)?.count || 0;
    }
    return counts;
  }
  if (!Array.isArray(itemsSource) || itemsSource.length === 0) return { __total: 0 } as any;
  let list = (itemsSource as any[]).filter(it => !!it);
  if (Array.isArray(selectedShips) && selectedShips.length > 0) {
    const set = new Set(selectedShips);
    list = list.filter(it => {
      if (!it || typeof it.shipsFrom !== 'string') return false;
      const code = normalizeShipFromCode(it.shipsFrom);
      return code ? set.has(code) : false;
    });
  }
  if (freeShipOnly) {
    const freeList: any[] = [];
    for (const it of list) {
      if (!it) continue;
      const shippingObj = it.shipping;
      let isFree = false;
      if (it.minShip != null) isFree = it.minShip === 0;
      else if (it.shippingPriceRange && it.shippingPriceRange.min != null) isFree = it.shippingPriceRange.min === 0;
      else if (shippingObj && shippingObj.shippingPriceRange && shippingObj.shippingPriceRange.min != null) isFree = shippingObj.shippingPriceRange.min === 0;
      else if (shippingObj && Array.isArray(shippingObj.options)) isFree = shippingObj.options.some((o: any) => o && o.cost === 0);
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
    const convMinRaw = currency === 'GBP' ? baseMin : (rates && (rates as any)['USD'] && currency === 'USD' ? baseMin / (rates as any)['USD'] : convertToGBP(baseMin, currency, rates as any));
    const convMaxRaw = currency === 'GBP' ? baseMax : (rates && (rates as any)['USD'] && currency === 'USD' ? baseMax / (rates as any)['USD'] : convertToGBP(baseMax, currency, rates as any));
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
  const counts: Record<string, number> = {};
  for (const it of list) {
    if (!it.category) continue;
    counts[it.category] = (counts[it.category] || 0) + 1;
  }
  counts.__total = (list as any[]).length;
  return counts;
});

// Live subcategory counts for the currently selected category, respecting filters
export const subcategoryLiveCountsAtom = atom<Record<string, number>>((get: any) => {
  const rates = get(exchangeRatesAtom) as ExchangeRates;
  const allItemsFull = get(allItemsAtom) as Item[];
  const itemsSource: Item[] = Array.isArray(allItemsFull) && allItemsFull.length > 0 ? allItemsFull : get(itemsAtom);
  const selectedShips = get(selectedShipFromAtom) as string[];
  const shipPinned = get(shipFromPinnedAtom) as boolean;
  const freeShipOnly = get(freeShippingOnlyAtom) as boolean;
  const query = ((get(searchQueryAtom) || '') as string).trim().toLowerCase();
  const favouritesOnly = get(favouritesOnlyAtom) as boolean;
  const favouriteIds = favouritesOnly ? (get(favouritesAtom) as any[] || []) : [];
  const excludedSellers = (get(excludedSellersAtom) || []).map((s: string) => s.toLowerCase());
  const includedSellers = (get(includedSellersAtom) || []).map((s: string) => s.toLowerCase());
  const norm = get(normalizedPriceRangeAtom);
  const { boundMin, boundMax } = norm;
  const minFilter = norm.min;
  const maxFilter = norm.max;
  const category = get(categoryAtom) as string;
  const excludedSubs = get(excludedSubcategoriesAtom) as string[];
  if (!category || category === 'All') return {};
  if (!Array.isArray(itemsSource) || itemsSource.length === 0) return {};
  let list = (itemsSource as any[]).filter(it => !!it && it.category === category);
  // Apply excluded subcategories filter to counts
  if (Array.isArray(excludedSubs) && excludedSubs.length > 0) {
    list = list.filter(it => !Array.isArray(it.subcategories) || !it.subcategories.some((s: any) => excludedSubs.includes(s)));
  }
  if (Array.isArray(selectedShips) && selectedShips.length > 0) {
    const set = new Set(selectedShips);
    list = list.filter(it => {
      if (!it || typeof it.shipsFrom !== 'string') return false;
      const code = normalizeShipFromCode(it.shipsFrom);
      return code ? set.has(code) : false;
    });
  }
  if (freeShipOnly) {
    const freeList: any[] = [];
    for (const it of list) {
      if (!it) continue;
      const shippingObj = it.shipping;
      let isFree = false;
      if (it.minShip != null) isFree = it.minShip === 0;
      else if (it.shippingPriceRange && it.shippingPriceRange.min != null) isFree = it.shippingPriceRange.min === 0;
      else if (shippingObj && shippingObj.shippingPriceRange && shippingObj.shippingPriceRange.min != null) isFree = shippingObj.shippingPriceRange.min === 0;
      else if (shippingObj && Array.isArray(shippingObj.options)) isFree = shippingObj.options.some((o: any) => o && o.cost === 0);
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
    const convMinRaw = currency === 'GBP' ? baseMin : (rates && (rates as any)['USD'] && currency === 'USD' ? baseMin / (rates as any)['USD'] : convertToGBP(baseMin, currency, rates as any));
    const convMaxRaw = currency === 'GBP' ? baseMax : (rates && (rates as any)['USD'] && currency === 'USD' ? baseMax / (rates as any)['USD'] : convertToGBP(baseMax, currency, rates as any));
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
  const counts: Record<string, number> = {};
  for (const it of list) {
    const subs = Array.isArray((it as any).subcategories) ? (it as any).subcategories : [];
    for (const s of subs) counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
});

// --- Basket (shopping) state ---
export const basketAtom = atomWithStorage<BasketEntry[]>("basket", []);

// Derived: total item count (sum of quantities)
export const basketCountAtom = atom<number>((get: any) => {
  const items = (get(basketAtom) || []) as BasketEntry[];
  let count = 0;
  for (const it of items) {
    const q = typeof it?.qty === 'number' && isFinite(it.qty) ? it.qty : 0;
    count += q;
  }
  return count;
});

// Derived: total price in GBP
export const basketTotalAtom = atom<number>((get: any) => {
  const items = (get(basketAtom) || []) as BasketEntry[];
  const rates = (get(exchangeRatesAtom) || {}) as ExchangeRates | Record<string, number>;
  const usdRate = typeof (rates as any)['USD'] === 'number' && (rates as any)['USD'] > 0 ? (rates as any)['USD'] : null;
  // Group by sellerName; add shipping once per seller if includeShip flagged on any line
  const buckets = new Map<string, { items: BasketEntry[]; shipUsd: number | null; includeShip: boolean }>();
  for (const it of items) {
    const seller = (it?.sellerName || '').toLowerCase();
    if (!buckets.has(seller)) buckets.set(seller, { items: [], shipUsd: null, includeShip: false });
    const b = buckets.get(seller)!;
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
export const addToBasketAtom = atom<null, [BasketEntry | any], void>(null, (get: any, set: any, payload: any) => {
  const items: BasketEntry[] = Array.isArray(get(basketAtom)) ? [...get(basketAtom)] : [];
  const keyId = String(payload?.id ?? payload?.refNum ?? '')
  const keyVar = String(payload?.variantId ?? '');
  const idx = items.findIndex(it => String(it.id ?? (it as any).refNum ?? '') === keyId && String(it.variantId ?? '') === keyVar);
  if (idx >= 0) {
    const existing = items[idx];
    const nextQty = (typeof existing.qty === 'number' ? existing.qty : 0) + (typeof payload.qty === 'number' ? payload.qty : 1);
    items[idx] = { ...existing, qty: nextQty } as BasketEntry;
  } else {
    const entry: BasketEntry = {
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
      sl: payload?.sl ?? null,
      addedAt: Date.now(),
    };
    items.push(entry);
  }
  set(basketAtom, items);
});

// Action: remove one entry entirely
export const removeFromBasketAtom = atom<null, [{ id: string | number | null; variantId: string | number | null }], void>(null, (get: any, set: any, { id, variantId }: any) => {
  const items: BasketEntry[] = Array.isArray(get(basketAtom)) ? [...get(basketAtom)] : [];
  const keyId = String(id ?? '');
  const keyVar = String(variantId ?? '');
  const next = items.filter(it => !(String(it.id ?? '') === keyId && String(it.variantId ?? '') === keyVar));
  set(basketAtom, next);
});

// Action: set quantity for an entry
export const setBasketQtyAtom = atom<null, [{ id: string | number | null; variantId: string | number | null; qty: number }], void>(null, (get: any, set: any, { id, variantId, qty }: any) => {
  const items: BasketEntry[] = Array.isArray(get(basketAtom)) ? [...get(basketAtom)] : [];
  const keyId = String(id ?? '');
  const keyVar = String(variantId ?? '');
  const i = items.findIndex(it => String(it.id ?? '') === keyId && String(it.variantId ?? '') === keyVar);
  if (i >= 0) {
    const q = Math.max(0, Math.floor(Number(qty) || 0));
    if (q === 0) items.splice(i, 1);
    else items[i] = { ...items[i], qty: q } as BasketEntry;
    set(basketAtom, items);
  }
});

// Action: change the variant for an existing basket line
export const changeBasketVariantAtom = atom<null, [{ id: any; variantId: any; next: any }], void>(null, (get: any, set: any, { id, variantId, next }: any) => {
  const items: BasketEntry[] = Array.isArray(get(basketAtom)) ? [...get(basketAtom)] : [];
  const keyId = String(id ?? '');
  const keyVar = String(variantId ?? '');
  const i = items.findIndex(it => String(it.id ?? (it as any).refNum ?? '') === keyId && String(it.variantId ?? '') === keyVar);
  if (i < 0) return; // nothing to change
  const line = items[i];
  const targetVar = String(next?.variantId ?? '');
  if (!targetVar) return;
  // If another line already uses the target variant for the same item, merge quantities and remove current
  const j = items.findIndex((it, idx) => idx !== i && String(it.id ?? (it as any).refNum ?? '') === keyId && String(it.variantId ?? '') === targetVar);
  if (j >= 0) {
    const q1 = typeof line.qty === 'number' ? line.qty : 1;
    const q2 = typeof items[j].qty === 'number' ? items[j].qty : 1;
    items[j] = { ...items[j], qty: q1 + q2 } as BasketEntry;
    items.splice(i, 1);
    set(basketAtom, items);
    return;
  }
  // Update in place
  items[i] = {
    ...line,
    variantId: next.variantId,
    variantDesc: next.variantDesc ?? line.variantDesc,
    // prefer USD storage, clear GBP legacy if USD provided
    priceUSD: typeof next.priceUSD === 'number' ? next.priceUSD : (typeof next.priceGBP === 'number' ? next.priceGBP : line.priceUSD ?? null),
    priceGBP: typeof next.priceUSD === 'number' ? null : (typeof next.priceGBP === 'number' ? next.priceGBP : line.priceGBP ?? null),
  } as BasketEntry;
  set(basketAtom, items);
});

// Action: clear
export const clearBasketAtom = atom<null, [], void>(null, (get: any, set: any) => set(basketAtom, []));

// --- UI toast ---
export const toastAtom = atom<{ id: number; message: string | null }>({ id: 0, message: null });
export const showToastAtom = atom<null, [string | null], void>(null, (get: any, set: any, message: string | null) => {
  const id = Date.now();
  set(toastAtom, { id, message });
  // auto-clear after 2 seconds
  setTimeout(() => {
    set(toastAtom, (curr: any) => (curr.id === id ? { id: 0, message: null } : curr));
  }, 2000);
});
