"use client";

/**
 * Jotai atoms for BiggyIndex v2.
 *
 * Conventions:
 * - All atoms suffixed with `Atom`
 * - atomWithStorage for persisted preferences
 * - Derived read-only atoms for filtered/sorted views
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { HomeFeedReview, Item, Seller, SortDir, SortKey } from "@/lib/types";
import { parseVariant } from "@/lib/variants";

// ─── Photo review modal payload ─────────────────────────────────

/**
 * Payload for the home-page photo review modal. Mirrors the home-feed review
 * shape because that's the data source — the modal just needs to display
 * seller/item context, the text, and the full-size images.
 */
export type PhotoReviewModalPayload = HomeFeedReview;

// ─── Core data ──────────────────────────────────────────────────

const itemsBaseAtom = atom<Item[]>([]);
export const itemsAtom = atom<Item[]>((get) => get(itemsBaseAtom));

/** Normalize `at` values: ensure every attribute is an array of title-cased strings */
function normalizeAttributes(item: Item): Item {
  if (!item.at) return item;
  const normalized: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(item.at)) {
    if (val == null) continue;
    if (Array.isArray(val)) {
      normalized[key] = val.map(titleCase);
    } else if (typeof val === "string") {
      normalized[key] = [titleCase(val)];
    } else if (typeof val === "boolean") {
      if (val) normalized[key] = ["Yes"];
    } else if (typeof val === "number") {
      normalized[key] = [String(val)];
    }
  }
  return { ...item, at: normalized };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export const setItemsAtom = atom<null, [Item[]], void>(
  null,
  (_get, set, items) => {
    set(itemsBaseAtom, items.map(normalizeAttributes));
  },
);

// ─── Sellers ────────────────────────────────────────────────────

const sellersBaseAtom = atom<Seller[]>([]);
export const sellersAtom = atom<Seller[]>((get) => get(sellersBaseAtom));

export const setSellersAtom = atom<null, [Seller[]], void>(
  null,
  (_get, set, sellers) => {
    set(sellersBaseAtom, sellers);
  },
);

/** O(1) seller lookup by numeric ID (as string) */
export const sellersMapAtom = atom<Map<string, Seller>>((get) => {
  const sellers = get(sellersAtom);
  const map = new Map<string, Seller>();
  for (const s of sellers) map.set(String(s.id), s);
  return map;
});

export const isLoadingAtom = atom<boolean>(true);

/** True once URL params have been applied to filter atoms */
export const urlSyncDoneAtom = atom<boolean>(false);

/** True once DataLoader has mounted on the current page */
export const dataLoaderActiveAtom = atom<boolean>(false);



// ─── Theme ──────────────────────────────────────────────────────

/** Dark mode toggle — persisted via atomWithStorage */
export const darkModeAtom = atomWithStorage<boolean>("darkMode", false);

// ─── Settings ───────────────────────────────────────────────────

export const settingsModalOpenAtom = atom<boolean>(false);

/** Mobile menu open state */
export const mobileMenuOpenAtom = atom<boolean>(false);

/** Currently open seller modal — null = closed, string = seller ID */
export const sellerModalIdAtom = atom<string | null>(null);

/** Currently expanded item refNum — null = closed, string = refNum */
export const expandedRefNumAtom = atom<string | null>(null);

/** When opening an item overlay, jump to and highlight this review id if it
    exists in the item's reviews list. Transient (not URL-synced). Consumers
    should clear it once the jump has been performed. */
export const focusReviewIdAtom = atom<number | null>(null);

/** Photo review modal — null = closed, else the photo review being viewed. */
export const photoReviewModalAtom = atom<PhotoReviewModalPayload | null>(null);

export const highResImagesAtom = atomWithStorage<boolean>("highResImages", false);

/** Force display of English originals (item name, description, shipping, variants)
 *  instead of the translated text. Only relevant on non-GB markets. */
export const forceEnglishAtom = atomWithStorage<boolean>("forceEnglish", false);

/** Pause animated GIFs — show static first frame instead */
export const pauseGifsAtom = atomWithStorage<boolean>("pauseGifs", false);

/** Thumbnail aspect ratio for item cards */
export type ThumbnailAspect = "square" | "4:3" | "3:2";
export const thumbnailAspectAtom = atomWithStorage<ThumbnailAspect>("thumbnailAspect", "square");

/** Accent color swatch — 'green' is default, others are easter-egg options */
export type AccentColor = "green" | "blue" | "purple" | "amber" | "rose" | "custom";
export const accentColorAtom = atomWithStorage<AccentColor>("accentColor", "green");
export const customAccentHexAtom = atomWithStorage<string>("customAccentHex", "#6366f1");

// ─── Filters ────────────────────────────────────────────────────

export const searchQueryAtom = atom<string>("");
export const categoryAtom = atom<string>("All");
export const subcategoryAtom = atom<string[]>([]);
export const selectedSellersAtom = atom<string[]>([]);
/** Hidden sellers — persisted list, items from these sellers are always hidden */
export const hiddenSellersAtom = atomWithStorage<string[]>("hiddenSellers", []);
/** Toggle a seller in the hidden list */
export const toggleHiddenSellerAtom = atom<null, [string], void>(null, (_get, set, sellerId: string) => {
  set(hiddenSellersAtom, (current) =>
    current.includes(sellerId) ? current.filter((id) => id !== sellerId) : [...current, sellerId],
  );
});
export const priceRangeAtom = atom<{ min: number; max: number }>({
  min: 0,
  max: Infinity,
});

/** Computed min/max USD prices across all loaded items (for slider bounds) */
export const priceBoundsAtom = atom<{ min: number; max: number }>((get) => {
  const items = get(itemsAtom);
  let lo = Infinity;
  let hi = 0;
  for (const it of items) {
    if (typeof it.uMin === "number" && it.uMin > 0) lo = Math.min(lo, it.uMin);
    if (typeof it.uMax === "number") hi = Math.max(hi, it.uMax);
    else if (typeof it.uMin === "number") hi = Math.max(hi, it.uMin);
  }
  if (!Number.isFinite(lo)) lo = 0;
  return { min: Math.floor(lo), max: Math.ceil(hi) };
});

/** v2 attribute-based filters: { filterKey: ['selected', 'values'] } */
export const attrFiltersAtom = atom<Record<string, string[]>>({});

/** Ships-from include filter (e.g. ["united kingdom"]) */
export const selectedShipFromAtom = atom<string[]>([]);
/** Ships-from exclude filter */
export const excludedShipFromAtom = atom<string[]>([]);
/** Free shipping only toggle */
export const freeShippingOnlyAtom = atom<boolean>(false);
/** Selected weight tiers in grams (e.g. [3.5, 7, 14, 28]) */
export const selectedWeightsAtom = atom<number[]>([]);

/** When true, add shipping cost to displayed item prices */
export const includeShippingAtom = atom<boolean>(false);

// ─── Pin / sticky filters ───────────────────────────────────────

/** When pinned, "Clear filters" won't reset selected sellers */
export const pinnedSellersAtom = atomWithStorage<boolean>("pinnedSellers", false);
/** When pinned, "Clear filters" won't reset ships-from filters */
export const pinnedShipFromAtom = atomWithStorage<boolean>("pinnedShipFrom", false);

/** Write atom: clear all non-pinned filters */
export const clearFiltersAtom = atom<null, [], void>(null, (get, set) => {
  set(searchQueryAtom, "");
  set(categoryAtom, "All");
  set(subcategoryAtom, []);
  set(priceRangeAtom, { min: 0, max: Infinity });
  set(attrFiltersAtom, {});
  set(freeShippingOnlyAtom, false);
  set(selectedWeightsAtom, []);
  set(bookmarksOnlyAtom, false);
  // Only clear if not pinned
  if (!get(pinnedSellersAtom)) set(selectedSellersAtom, []);
  if (!get(pinnedShipFromAtom)) {
    set(selectedShipFromAtom, []);
    set(excludedShipFromAtom, []);
  }
});

// ─── Sort ───────────────────────────────────────────────────────

export const sortKeyAtom = atomWithStorage<SortKey>("sortKey", "hottest");
export const sortDirAtom = atomWithStorage<SortDir>("sortDir", "desc");

// ─── Layout ─────────────────────────────────────────────────────

/** Filter panel open state — persisted so it remembers between sessions */
export const filterPanelOpenAtom = atomWithStorage<boolean>(
  "filterPanelOpen",
  true,
);

/** Persisted open/closed state for filter panel accordion sections */
export const sectionOpenAtom = atomWithStorage<Record<string, boolean>>("sectionOpen", {});

/** Footer sentinel visibility — drives header/toolbar hide on scroll-to-bottom */
export const footerVisibleAtom = atom<boolean>(false);

// ─── Hydration gate ─────────────────────────────────────────────

/** True once the client has mounted and atomWithStorage has had one rAF */
export const clientReadyAtom = atom<boolean>(false);

/** True after HydrationGate has fully faded out */
export const gateCompleteAtom = atom<boolean>(false);

/** Composite: ready when data is loaded + URL synced (or no DataLoader active) */
export const isHydratedAtom = atom<boolean>((get) => {
  if (!get(clientReadyAtom)) return false;
  if (!get(dataLoaderActiveAtom)) return true;
  return !get(isLoadingAtom) && get(urlSyncDoneAtom);
});

// ─── Market ─────────────────────────────────────────────────────

export const marketAtom = atomWithStorage<string>("market", "GB");
export const currencySymbolAtom = atom<string>("£");

// ─── Display currency ───────────────────────────────────────────

/** User-selected display currency — persisted */
export type DisplayCurrency = "GBP" | "USD" | "EUR";
export const displayCurrencyAtom = atomWithStorage<DisplayCurrency>("displayCurrency", "GBP");

/** Live exchange rates: { GBP: 0.79, EUR: 0.92, ... } keyed from USD base */
export const exchangeRatesAtom = atom<Record<string, number>>({});

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
};

/**
 * Derived: { symbol, rate } for use in components.
 * `rate` converts USD (storage unit) → display currency.
 * Usage: `usdPrice * rate` gives display-currency value.
 */
export const currencyDisplayAtom = atom((get) => {
  const dc = get(displayCurrencyAtom);
  if (dc === "USD") return { symbol: "$", rate: 1 };

  const rates = get(exchangeRatesAtom);
  const rate = rates[dc];
  return {
    symbol: CURRENCY_SYMBOLS[dc] ?? dc,
    rate: typeof rate === "number" && rate > 0 ? rate : 1,
  };
});

// ─── Bookmarks ──────────────────────────────────────────────────

export const bookmarksAtom = atomWithStorage<string[]>("bookmarks", []);
export const bookmarksOnlyAtom = atom<boolean>(false);

/** O(1) bookmark lookup by refNum or id */
export const bookmarksSetAtom = atom<Set<string>>((get) => new Set(get(bookmarksAtom)));

/** Toggle bookmark: add if absent, remove if present */
export const toggleBookmarkAtom = atom<null, [string], void>(null, (_get, set, itemId: string) => {
  set(bookmarksAtom, (current) =>
    current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
  );
});

// ─── Shared filter helper (reused by dimension-specific atoms) ──

interface FilterOpts {
  skipCategory?: boolean;
  skipSubcategory?: boolean;
  skipSellers?: boolean;
  skipShipFrom?: boolean;
  skipFreeShipping?: boolean;
  skipWeights?: boolean;
  skipAttrs?: boolean | string; // true = skip all, string = skip one key
}

function applyFilters(
  items: Item[],
  get: (a: any) => any,
  opts: FilterOpts = {},
): Item[] {
  const category = opts.skipCategory ? "All" : get(categoryAtom);
  const subcategories: string[] = opts.skipSubcategory ? [] : get(subcategoryAtom);
  const query: string = get(searchQueryAtom).toLowerCase().trim();
  const sellers: string[] = opts.skipSellers ? [] : get(selectedSellersAtom);
  const hiddenSellers: string[] = get(hiddenSellersAtom);
  const priceRange = get(priceRangeAtom);
  const bookmarksOnly: boolean = get(bookmarksOnlyAtom);
  const bookmarks: Set<string> | null = bookmarksOnly ? get(bookmarksSetAtom) : null;
  const attrs: Record<string, string[]> = opts.skipAttrs === true ? {} : get(attrFiltersAtom);
  const skipAttrKey = typeof opts.skipAttrs === "string" ? opts.skipAttrs : null;
  const shipInclude: string[] = opts.skipShipFrom ? [] : get(selectedShipFromAtom);
  const shipExclude: string[] = opts.skipShipFrom ? [] : get(excludedShipFromAtom);
  const freeOnly: boolean = opts.skipFreeShipping ? false : get(freeShippingOnlyAtom);
  const weights: number[] = opts.skipWeights ? [] : get(selectedWeightsAtom);

  return items.filter((item) => {
    if (bookmarks && !bookmarks.has(item.refNum ? String(item.refNum) : String(item.id)))
      return false;
    if (category !== "All" && item.c !== category) return false;
    if (subcategories.length > 0 && (!item.sc || !subcategories.some((s) => item.sc!.includes(s)))) return false;
    if (query) {
      const hay = `${item.n} ${item.d ?? ""} ${item.sn ?? ""}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    const sid = item.sid != null ? String(item.sid) : "";
    if (sellers.length > 0 && !sellers.includes(sid)) return false;
    if (hiddenSellers.length > 0 && hiddenSellers.includes(sid)) return false;
    if (typeof item.uMin === "number" && item.uMin > priceRange.max) return false;
    if (typeof item.uMax === "number" && item.uMax < priceRange.min) return false;
    const sf = (item.sf ?? "").toLowerCase();
    if (shipInclude.length > 0 && !shipInclude.includes(sf)) return false;
    if (shipExclude.length > 0 && shipExclude.includes(sf)) return false;
    if (freeOnly && !item.sh?.free) return false;
    if (weights.length > 0) {
      if (!item.v || item.v.length === 0) return false;
      const weightsSet = new Set(weights);
      const hasMatch = item.v.some((v) => {
        const p = parseVariant(v);
        return p != null && p.grams != null && weightsSet.has(bucketGrams(p.grams));
      });
      if (!hasMatch) return false;
    }
    for (const [key, vals] of Object.entries(attrs)) {
      if (vals.length === 0) continue;
      if (key === skipAttrKey) continue;
      const itemVal = item.at?.[key];
      if (!itemVal) return false;
      if (Array.isArray(itemVal)) {
        if (!vals.some((v) => itemVal.includes(v))) return false;
      } else {
        if (!vals.includes(String(itemVal))) return false;
      }
    }
    return true;
  });
}

// ─── Derived: filtered items ────────────────────────────────────

export const filteredItemsAtom = atom<Item[]>((get) => {
  return applyFilters(get(itemsAtom), get);
});

// ─── Derived: sorted items ──────────────────────────────────────

/** Cheapest price-per-gram for an item (Infinity if no parseable variant) */
function cheapestPpg(item: Item, shipCost: number): number {
  if (!item.v || item.v.length === 0) return Infinity;
  let best = Infinity;
  for (const v of item.v) {
    const p = parseVariant(v);
    if (p && p.grams != null && p.grams > 0 && v.usd > 0) {
      const ppg = (v.usd + shipCost) / p.grams;
      if (ppg < best) best = ppg;
    }
  }
  return best;
}

/** Get the effective shipping surcharge for an item */
function itemShipCost(item: Item, includeShipping: boolean): number {
  if (!includeShipping) return 0;
  if (item.sh?.free) return 0;
  return typeof item.sh?.min === "number" ? item.sh.min : 0;
}

export const sortedItemsAtom = atom<Item[]>((get) => {
  const items = get(filteredItemsAtom);
  const sortKey = get(sortKeyAtom);
  const sortDir = get(sortDirAtom);
  const includeShipping = get(includeShippingAtom);

  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "hottest":
        cmp = (a.h ?? 0) - (b.h ?? 0);
        break;
      case "newest":
        cmp = (a.fsa ?? "").localeCompare(b.fsa ?? "");
        break;
      case "updated":
        cmp = (a.lua ?? "").localeCompare(b.lua ?? "");
        break;
      case "price":
        cmp = ((a.uMin ?? 0) + itemShipCost(a, includeShipping)) - ((b.uMin ?? 0) + itemShipCost(b, includeShipping));
        break;
      case "name":
        cmp = a.n.localeCompare(b.n);
        break;
      case "ppg": {
        const ppgA = cheapestPpg(a, itemShipCost(a, includeShipping));
        const ppgB = cheapestPpg(b, itemShipCost(b, includeShipping));
        // Nulls/Infinity last
        if (ppgA === Infinity && ppgB === Infinity) { cmp = 0; break; }
        if (ppgA === Infinity) return 1;
        if (ppgB === Infinity) return -1;
        cmp = ppgA - ppgB;
        break;
      }
      default:
        cmp = 0;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });
});

// ─── Derived: category counts ──────────────────────────────────

export const categoryCountsAtom = atom<Record<string, number>>((get) => {
  // Count items matching all filters EXCEPT category/subcategory, so the pill
  // counts reflect what's actually available under the current seller/ships/etc.
  // selection (mirrors how oldbiggyindex and food-agg compute facets).
  const items = applyFilters(get(itemsAtom), get, {
    skipCategory: true,
    skipSubcategory: true,
  });
  const counts: Record<string, number> = { All: items.length };
  for (const item of items) {
    if (item.c) counts[item.c] = (counts[item.c] ?? 0) + 1;
  }
  return counts;
});

// ─── Derived: subcategories for selected category ──────────────

export const availableSubcategoriesAtom = atom<{ name: string; count: number }[]>((get) => {
  const category = get(categoryAtom);
  if (category === "All") return [];
  const items = applyFilters(get(itemsAtom), get, { skipSubcategory: true });
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.c === category && item.sc) {
      for (const s of item.sc) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
});

// ─── Derived: available sellers (from filtered items, excluding seller filter) ─

/**
 * Sellers derived from items that pass ALL filters EXCEPT the seller selection
 * itself. This way the seller list reflects what's actually visible when other
 * filters (ships-from, category, etc.) are active.
 */
export const filteredSellersAtom = atom<{ id: string; name: string; count: number }[]>((get) => {
  const items = applyFilters(get(itemsAtom), get, { skipSellers: true });
  const hiddenSet = new Set(get(hiddenSellersAtom));

  const map = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    if (item.sid == null || !item.sn) continue;
    const sid = String(item.sid);
    if (hiddenSet.has(sid)) continue;
    const entry = map.get(sid);
    if (entry) entry.count++;
    else map.set(sid, { name: item.sn, count: 1 });
  }
  return Array.from(map.entries())
    .map(([id, { name, count }]) => ({ id, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
});

// ─── Derived: available sellers (unfiltered, for Settings modal) ─

export const availableSellersAtom = atom<{ id: string; name: string; count: number }[]>((get) => {
  const items = get(itemsAtom);
  const map = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    if (item.sid != null && item.sn) {
      const id = String(item.sid);
      const entry = map.get(id);
      if (entry) {
        entry.count++;
      } else {
        map.set(id, { name: item.sn, count: 1 });
      }
    }
  }
  return Array.from(map.entries())
    .map(([id, { name, count }]) => ({ id, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
});

// ─── Derived: available ships-from options ─────────────────────

export const availableShipFromAtom = atom<{ value: string; label: string; count: number }[]>((get) => {
  const items = applyFilters(get(itemsAtom), get, { skipShipFrom: true, skipFreeShipping: true });
  const counts = new Map<string, number>();
  for (const item of items) {
    const sf = (item.sf ?? "").toLowerCase();
    if (sf) counts.set(sf, (counts.get(sf) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: value.replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
    }))
    .sort((a, b) => b.count - a.count);
});

// ─── Derived: available weight tiers (bucketed) ───────────────

/** Standard weight tiers — raw gram values snap to the nearest bucket */
const WEIGHT_BUCKETS = [1, 2, 3.5, 5, 7, 10, 14, 28, 56, 112] as const;

export function bucketGrams(g: number): number {
  let best: number = WEIGHT_BUCKETS[0];
  let bestDist = Math.abs(g - best);
  for (let i = 1; i < WEIGHT_BUCKETS.length; i++) {
    const d = Math.abs(g - WEIGHT_BUCKETS[i]);
    if (d < bestDist) { best = WEIGHT_BUCKETS[i]; bestDist = d; }
  }
  return best;
}

export const availableWeightsAtom = atom<{ grams: number; label: string; count: number }[]>((get) => {
  const items = applyFilters(get(itemsAtom), get, { skipWeights: true });
  const counts = new Map<number, number>();
  for (const item of items) {
    if (!item.v) continue;
    const seen = new Set<number>();
    for (const v of item.v) {
      const p = parseVariant(v);
      if (p && p.grams != null && p.grams > 0) {
        const bucket = bucketGrams(p.grams);
        if (!seen.has(bucket)) {
          seen.add(bucket);
          counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
        }
      }
    }
  }
  return Array.from(counts.entries())
    .map(([grams, count]) => ({
      grams,
      label: `${grams}g`,
      count,
    }))
    .sort((a, b) => a.grams - b.grams);
});

// ─── Derived: attribute option counts (food-agg two-pass pattern) ──

/**
 * Pre-filter once without any attr filters, then for each attr key
 * apply only the OTHER attr selections. Avoids re-running the full
 * filter chain per attribute dimension.
 */
export const attrOptionCountsAtom = atom<Record<string, Record<string, number>>>((get) => {
  const baseItems = applyFilters(get(itemsAtom), get, { skipAttrs: true });
  const attrs = get(attrFiltersAtom);

  const result: Record<string, Record<string, number>> = {};

  // Collect all attr keys that appear on items (from the pre-filtered set)
  const allKeys = new Set<string>();
  for (const item of baseItems) {
    if (item.at) {
      for (const k of Object.keys(item.at)) allKeys.add(k);
    }
  }

  for (const key of allKeys) {
    const otherKeys = Object.entries(attrs).filter(
      ([k, vals]) => k !== key && vals.length > 0,
    );

    const counts: Record<string, number> = {};
    for (const item of baseItems) {
      // Check other attr constraints (skip THIS dimension)
      let skip = false;
      for (const [otherKey, otherVals] of otherKeys) {
        const itemVal = item.at?.[otherKey];
        if (!itemVal) { skip = true; break; }
        if (Array.isArray(itemVal)) {
          if (!otherVals.some((v) => itemVal.includes(v))) { skip = true; break; }
        } else {
          if (!otherVals.includes(String(itemVal))) { skip = true; break; }
        }
      }
      if (skip) continue;

      const vals = item.at?.[key];
      if (vals == null) continue;
      if (Array.isArray(vals)) {
        for (const v of vals) counts[v] = (counts[v] ?? 0) + 1;
      } else if (typeof vals === "string") {
        counts[vals] = (counts[vals] ?? 0) + 1;
      }
    }
    result[key] = counts;
  }

  return result;
});

// ─── Derived: active filters count ─────────────────────────────

export const activeFiltersCountAtom = atom<number>((get) => {
  let count = 0;
  if (get(categoryAtom) !== "All") count++;
  count += get(subcategoryAtom).length;
  if (get(searchQueryAtom).trim()) count++;
  if (get(selectedSellersAtom).length > 0) count++;
  if (get(hiddenSellersAtom).length > 0) count++;
  const pr = get(priceRangeAtom);
  if (pr.min > 0 || pr.max < Infinity) count++;
  if (get(selectedShipFromAtom).length > 0) count++;
  if (get(excludedShipFromAtom).length > 0) count++;
  if (get(freeShippingOnlyAtom)) count++;
  if (get(selectedWeightsAtom).length > 0) count++;
  const attrs = get(attrFiltersAtom);
  for (const vals of Object.values(attrs)) {
    if (vals.length > 0) count++;
  }
  return count;
});

// ─── Basket ─────────────────────────────────────────────────────

export interface BasketEntry {
  /** Item refNum (as string) */
  refNum: string;
  /** Variant id (as string, or "" for items without variants) */
  variantId: string;
  /** Variant description, e.g. "3.5g blue sherbert" */
  variantDesc: string;
  /** Item name */
  name: string;
  /** Seller name */
  sellerName: string;
  /** Quantity */
  qty: number;
  /** Price in USD for a single unit */
  priceUSD: number;
  /** Shipping cost in USD (per seller, cheapest) */
  shippingUsd: number | null;
  /** Whether to include shipping in total */
  includeShip: boolean;
  /**
   * Full shipping options available from this seller.
   * Mirrors `MergedDetailBlob.shOpts`. Used in the basket to let the user
   * pick which shipping method to use across items from the same seller.
   */
  shOpts?: { label: string; cost: number }[];
  /** Image URL for display */
  imageUrl: string | null;
  /** Share link */
  sl: string | null;
  /** Timestamp when added */
  addedAt: number;
}

/** Persisted basket entries */
export const basketAtom = atomWithStorage<BasketEntry[]>("basket", []);

/**
 * Per-seller basket shipping selection.
 * Keyed by the lower-cased seller name (the same key used in `Basket.tsx` groups).
 * Value: the label of the selected shipping option — `null` / missing means
 * "no shipping selected" (matches old-biggyindex checkbox OFF). The special
 * sentinel `"__cheapest__"` means "use the cheapest available option".
 */
export const basketShipSelectionAtom = atomWithStorage<Record<string, string | null>>(
  "basketShipSelection",
  {},
);

/** Whether basket drawer is open */
export const basketOpenAtom = atom<boolean>(false);

/** Total item count (sum of quantities) */
export const basketCountAtom = atom<number>((get) => {
  const items = get(basketAtom);
  let count = 0;
  for (const it of items) count += it.qty;
  return count;
});

/** Add item (merge by refNum + variantId) */
export const addToBasketAtom = atom<null, [Omit<BasketEntry, "addedAt">], void>(
  null,
  (get, set, payload) => {
    const items = [...get(basketAtom)];
    const idx = items.findIndex(
      (it) => it.refNum === payload.refNum && it.variantId === payload.variantId,
    );
    if (idx >= 0) {
      items[idx] = { ...items[idx], qty: items[idx].qty + payload.qty };
    } else {
      items.push({ ...payload, addedAt: Date.now() });
    }
    set(basketAtom, items);
  },
);

/** Remove one entry entirely */
export const removeFromBasketAtom = atom<
  null,
  [{ refNum: string; variantId: string }],
  void
>(null, (get, set, { refNum, variantId }) => {
  set(
    basketAtom,
    get(basketAtom).filter(
      (it) => !(it.refNum === refNum && it.variantId === variantId),
    ),
  );
});

/** Set quantity for an entry (0 removes it) */
export const setBasketQtyAtom = atom<
  null,
  [{ refNum: string; variantId: string; qty: number }],
  void
>(null, (get, set, { refNum, variantId, qty }) => {
  const items = [...get(basketAtom)];
  const i = items.findIndex(
    (it) => it.refNum === refNum && it.variantId === variantId,
  );
  if (i < 0) return;
  if (qty <= 0) {
    items.splice(i, 1);
  } else {
    items[i] = { ...items[i], qty };
  }
  set(basketAtom, items);
});

/** Clear all basket entries */
export const clearBasketAtom = atom<null, [], void>(null, (_get, set) =>
  set(basketAtom, []),
);
