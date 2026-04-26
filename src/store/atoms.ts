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
import {
  buildBrowseResults,
  buildBrowseSnapshot,
} from "@/lib/browse/filter-engine";
import { buildItemIndex } from "@/lib/browse/item-index";
import type {
  HomeFeedReview,
  Item,
  Seller,
  SortDir,
  SortKey,
} from "@/lib/types";

export { bucketGrams } from "@/lib/browse/item-index";

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
export const itemIndexAtom = atom((get) => buildItemIndex(get(itemsAtom)));

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

const readStorageOnClientInit = { getOnInit: true } as const;

/** Dark mode toggle — persisted via atomWithStorage */
export const darkModeAtom = atomWithStorage<boolean>(
  "darkMode",
  false,
  undefined,
  readStorageOnClientInit,
);

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

export const highResImagesAtom = atomWithStorage<boolean>(
  "highResImages",
  false,
);

/** Force display of English originals (item name, description, shipping, variants)
 *  instead of the translated text. Only relevant on non-GB markets. */
export const forceEnglishAtom = atomWithStorage<boolean>("forceEnglish", false);

/** Pause animated GIFs — show static first frame instead */
export const pauseGifsAtom = atomWithStorage<boolean>("pauseGifs", false);

/** Thumbnail aspect ratio for item cards */
export type ThumbnailAspect = "square" | "4:3" | "3:2";
export const thumbnailAspectAtom = atomWithStorage<ThumbnailAspect>(
  "thumbnailAspect",
  "square",
);

/** Item card density: 'comfortable' (default spacing) or 'compact'
 *  (shorter image, 1-line description, tighter paddings). Respects the
 *  user's thumbnailAspect choice — compact just scales it down. */
export type ViewMode = "comfortable" | "compact";
export const viewModeAtom = atomWithStorage<ViewMode>(
  "viewMode",
  "comfortable",
);

/** Accent color swatch — 'green' is default, others are easter-egg options */
export type AccentColor =
  | "green"
  | "blue"
  | "purple"
  | "amber"
  | "rose"
  | "custom";
export const accentColorAtom = atomWithStorage<AccentColor>(
  "accentColor",
  "green",
);
export const customAccentHexAtom = atomWithStorage<string>(
  "customAccentHex",
  "#6366f1",
);

// ─── Filters ────────────────────────────────────────────────────

export const searchQueryAtom = atom<string>("");
export const deferredSearchQueryAtom = atom<string>("");
export const categoryAtom = atom<string>("All");
export const subcategoryAtom = atom<string[]>([]);
export const selectedSellersAtom = atom<string[]>([]);
/** Hidden sellers — persisted list, items from these sellers are always hidden */
export const hiddenSellersAtom = atomWithStorage<string[]>("hiddenSellers", []);
/** Toggle a seller in the hidden list */
export const toggleHiddenSellerAtom = atom<null, [string], void>(
  null,
  (_get, set, sellerId: string) => {
    set(hiddenSellersAtom, (current) =>
      current.includes(sellerId)
        ? current.filter((id) => id !== sellerId)
        : [...current, sellerId],
    );
  },
);
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
export const pinnedSellersAtom = atomWithStorage<boolean>(
  "pinnedSellers",
  false,
);
/** When pinned, "Clear filters" won't reset ships-from filters */
export const pinnedShipFromAtom = atomWithStorage<boolean>(
  "pinnedShipFrom",
  false,
);

/** Write atom: clear all non-pinned filters */
export const clearFiltersAtom = atom<null, [], void>(null, (get, set) => {
  set(searchQueryAtom, "");
  set(deferredSearchQueryAtom, "");
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

/** Filter panel open state — persisted so it remembers between sessions.
 *  Default `false` so SSR output matches a cold client; otherwise the panel
 *  flashes open on first paint and animates closed once atomWithStorage
 *  hydrates the user's stored `false`. Matches food-aggregator. */
export const filterPanelOpenAtom = atomWithStorage<boolean>(
  "filterPanelOpen",
  false,
  undefined,
  readStorageOnClientInit,
);

/** True once persisted panel layout has been applied for the current page. */
export const filterPanelSettledAtom = atom<boolean>(true);

/** Persisted open/closed state for filter panel accordion sections */
export const sectionOpenAtom = atomWithStorage<Record<string, boolean>>(
  "sectionOpen",
  {},
);

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
export const displayCurrencyAtom = atomWithStorage<DisplayCurrency>(
  "displayCurrency",
  "GBP",
);

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
export const bookmarksSetAtom = atom<Set<string>>(
  (get) => new Set(get(bookmarksAtom)),
);

/** Toggle bookmark: add if absent, remove if present */
export const toggleBookmarkAtom = atom<null, [string], void>(
  null,
  (_get, set, itemId: string) => {
    set(bookmarksAtom, (current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  },
);

// ─── Derived: browse results and facets ────────────────────────

const browseInputAtom = atom((get) => {
  const bookmarksOnly = get(bookmarksOnlyAtom);

  return {
    items: get(itemsAtom),
    itemIndex: get(itemIndexAtom),
    filters: {
      category: get(categoryAtom),
      subcategories: get(subcategoryAtom),
      query: get(deferredSearchQueryAtom),
      selectedSellers: get(selectedSellersAtom),
      hiddenSellers: get(hiddenSellersAtom),
      priceRange: get(priceRangeAtom),
      bookmarksOnly,
      bookmarks: bookmarksOnly ? get(bookmarksSetAtom) : null,
      attrFilters: get(attrFiltersAtom),
      selectedShipFrom: get(selectedShipFromAtom),
      excludedShipFrom: get(excludedShipFromAtom),
      freeShippingOnly: get(freeShippingOnlyAtom),
      selectedWeights: get(selectedWeightsAtom),
    },
    sortKey: get(sortKeyAtom),
    sortDir: get(sortDirAtom),
    includeShipping: get(includeShippingAtom),
  };
});

const browseResultsAtom = atom((get) =>
  buildBrowseResults(get(browseInputAtom)),
);

const browseSnapshotAtom = atom((get) => {
  const input = get(browseInputAtom);
  return buildBrowseSnapshot(input, get(browseResultsAtom));
});

export const filteredItemsAtom = atom<Item[]>(
  (get) => get(browseResultsAtom).filteredItems,
);

export const sortedItemsAtom = atom<Item[]>(
  (get) => get(browseResultsAtom).sortedItems,
);

export const categoryCountsAtom = atom<Record<string, number>>(
  (get) => get(browseSnapshotAtom).categoryCounts,
);

export const availableSubcategoriesAtom = atom<
  { name: string; count: number }[]
>((get) => get(browseSnapshotAtom).availableSubcategories);

export const filteredSellersAtom = atom<
  { id: string; name: string; count: number }[]
>((get) => get(browseSnapshotAtom).filteredSellers);

export const availableSellersAtom = atom<
  { id: string; name: string; count: number }[]
>((get) => {
  const items = get(itemsAtom);
  if (items.length > 0) return get(browseSnapshotAtom).availableSellers;

  return get(sellersAtom).map((seller) => ({
    id: String(seller.id),
    name: seller.name,
    count: seller.itemsCount ?? 0,
  }));
});

export const availableShipFromAtom = atom<
  { value: string; label: string; count: number }[]
>((get) => get(browseSnapshotAtom).availableShipFrom);

export const availableWeightsAtom = atom<
  { grams: number; label: string; count: number }[]
>((get) => get(browseSnapshotAtom).availableWeights);

export const attrOptionCountsAtom = atom<
  Record<string, Record<string, number>>
>((get) => get(browseSnapshotAtom).attrOptionCounts);

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
export const basketShipSelectionAtom = atomWithStorage<
  Record<string, string | null>
>("basketShipSelection", {});

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
      (it) =>
        it.refNum === payload.refNum && it.variantId === payload.variantId,
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
