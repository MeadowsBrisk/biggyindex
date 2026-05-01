import type { ItemIndex } from "@/lib/browse/item-index";
import { bucketGrams, getItemBrowseMeta } from "@/lib/browse/item-index";
import { shipFromLabel } from "@/lib/shipFrom";
import type { Item, SortDir, SortKey } from "@/lib/types";

export interface BrowseFilters {
  category: string;
  subcategories: string[];
  query: string;
  selectedSellers: string[];
  hiddenSellers: string[];
  priceRange: { min: number; max: number };
  bookmarksOnly: boolean;
  bookmarks: Set<string> | null;
  attrFilters: Record<string, string[]>;
  selectedShipFrom: string[];
  excludedShipFrom: string[];
  freeShippingOnly: boolean;
  selectedWeights: number[];
}

export interface BrowseSnapshotInput {
  items: Item[];
  itemIndex?: ItemIndex;
  filters: BrowseFilters;
  sortKey: SortKey;
  sortDir: SortDir;
  includeShipping: boolean;
}

export interface SellerFacet {
  id: string;
  name: string;
  count: number;
}

export interface CountFacet {
  value: string;
  label: string;
  count: number;
}

export interface WeightFacet {
  grams: number;
  label: string;
  count: number;
}

export interface BrowseSnapshot {
  filteredItems: Item[];
  sortedItems: Item[];
  categoryCounts: Record<string, number>;
  availableSubcategories: { name: string; count: number }[];
  filteredSellers: SellerFacet[];
  availableSellers: SellerFacet[];
  availableShipFrom: CountFacet[];
  availableWeights: WeightFacet[];
  attrOptionCounts: Record<string, Record<string, number>>;
}

export interface BrowseResults {
  filteredItems: Item[];
  sortedItems: Item[];
}

interface FilterOptions {
  skipCategory?: boolean;
  skipSubcategory?: boolean;
  skipSellers?: boolean;
  skipShipFrom?: boolean;
  skipFreeShipping?: boolean;
  skipWeights?: boolean;
  skipAttrs?: boolean | string;
}

export function buildBrowseSnapshot(
  input: BrowseSnapshotInput,
  results = buildBrowseResults(input),
): BrowseSnapshot {
  return {
    filteredItems: results.filteredItems,
    sortedItems: results.sortedItems,
    categoryCounts: buildCategoryCounts(
      input.items,
      input.filters,
      input.itemIndex,
    ),
    availableSubcategories: buildAvailableSubcategories(
      input.items,
      input.filters,
      input.itemIndex,
    ),
    filteredSellers: buildFilteredSellers(
      input.items,
      input.filters,
      input.itemIndex,
    ),
    availableSellers: buildAvailableSellers(input.items, input.itemIndex),
    availableShipFrom: buildAvailableShipFrom(
      input.items,
      input.filters,
      input.itemIndex,
    ),
    availableWeights: buildAvailableWeights(
      input.items,
      input.filters,
      input.itemIndex,
    ),
    attrOptionCounts: buildAttrOptionCounts(
      input.items,
      input.filters,
      input.itemIndex,
    ),
  };
}

export function buildBrowseResults(input: BrowseSnapshotInput): BrowseResults {
  const filteredItems = applyFilters(
    input.items,
    input.filters,
    {},
    input.itemIndex,
  );
  return {
    filteredItems,
    sortedItems: sortItems(
      filteredItems,
      input.sortKey,
      input.sortDir,
      input.includeShipping,
      input.filters.selectedWeights,
      input.itemIndex,
    ),
  };
}

function applyFilters(
  items: Item[],
  filters: BrowseFilters,
  options: FilterOptions = {},
  itemIndex?: ItemIndex,
): Item[] {
  const category = options.skipCategory ? "All" : filters.category;
  const subcategories = options.skipSubcategory ? [] : filters.subcategories;
  const subcategorySet =
    subcategories.length > 0 ? new Set(subcategories) : null;
  const query = filters.query.toLowerCase().trim();
  const sellers = options.skipSellers ? [] : filters.selectedSellers;
  const sellersSet = sellers.length > 0 ? new Set(sellers) : null;
  const attrs = options.skipAttrs === true ? {} : filters.attrFilters;
  const skipAttrKey =
    typeof options.skipAttrs === "string" ? options.skipAttrs : null;
  const attrEntries = Object.entries(attrs)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => [key, new Set(values)] as const);
  const shipInclude = options.skipShipFrom ? [] : filters.selectedShipFrom;
  const shipIncludeSet = shipInclude.length > 0 ? new Set(shipInclude) : null;
  const shipExclude = options.skipShipFrom ? [] : filters.excludedShipFrom;
  const shipExcludeSet = shipExclude.length > 0 ? new Set(shipExclude) : null;
  const freeOnly = options.skipFreeShipping ? false : filters.freeShippingOnly;
  const weights = options.skipWeights ? [] : filters.selectedWeights;
  const weightsSet = weights.length > 0 ? new Set(weights) : null;
  const hiddenSellersSet =
    filters.hiddenSellers.length > 0 ? new Set(filters.hiddenSellers) : null;

  return items.filter((item) => {
    const meta = getItemBrowseMeta(itemIndex, item);

    if (
      filters.bookmarksOnly &&
      filters.bookmarks &&
      !filters.bookmarks.has(meta.bookmarkKey)
    ) {
      return false;
    }

    if (category !== "All" && item.c !== category) return false;

    if (
      subcategorySet &&
      (!item.sc ||
        !item.sc.some((subcategory) => subcategorySet.has(subcategory)))
    ) {
      return false;
    }

    if (query) {
      if (!meta.searchText.includes(query)) return false;
    }

    if (sellersSet && !sellersSet.has(meta.sellerId)) return false;
    if (hiddenSellersSet?.has(meta.sellerId)) return false;

    if (typeof item.uMin === "number" && item.uMin > filters.priceRange.max) {
      return false;
    }
    if (typeof item.uMax === "number" && item.uMax < filters.priceRange.min) {
      return false;
    }

    if (shipIncludeSet && !shipIncludeSet.has(meta.shipFrom)) return false;
    if (shipExcludeSet?.has(meta.shipFrom)) return false;
    if (freeOnly && !item.sh?.free) return false;

    if (weightsSet) {
      const hasMatchingWeight = [...meta.weightBuckets].some((bucket) =>
        weightsSet.has(bucket),
      );
      if (!hasMatchingWeight) return false;
    }

    for (const [key, values] of attrEntries) {
      if (key === skipAttrKey) continue;

      const itemValue = item.at?.[key];
      if (!itemValue) return false;

      if (Array.isArray(itemValue)) {
        if (!itemValue.some((value) => values.has(value))) return false;
      } else if (!values.has(String(itemValue))) {
        return false;
      }
    }

    return true;
  });
}

function sortItems(
  items: Item[],
  sortKey: SortKey,
  sortDir: SortDir,
  includeShipping: boolean,
  selectedWeights: number[],
  itemIndex?: ItemIndex,
): Item[] {
  const selectedWeightBuckets =
    sortKey === "ppg" && selectedWeights.length > 0
      ? new Set(selectedWeights)
      : null;

  return [...items].sort((first, second) => {
    let comparison = 0;

    switch (sortKey) {
      case "hottest":
        comparison = (first.h ?? 0) - (second.h ?? 0);
        break;
      case "newest":
        comparison = (first.fsa ?? "").localeCompare(second.fsa ?? "");
        break;
      case "updated":
        comparison = (first.lua ?? "").localeCompare(second.lua ?? "");
        break;
      case "price":
        comparison =
          (first.uMin ?? 0) +
          itemShipCost(first, includeShipping) -
          ((second.uMin ?? 0) + itemShipCost(second, includeShipping));
        break;
      case "name":
        comparison = first.n.localeCompare(second.n);
        break;
      case "ppg": {
        const firstPpg = cheapestPpg(
          first,
          itemShipCost(first, includeShipping),
          itemIndex,
          selectedWeightBuckets,
        );
        const secondPpg = cheapestPpg(
          second,
          itemShipCost(second, includeShipping),
          itemIndex,
          selectedWeightBuckets,
        );

        if (firstPpg === Infinity && secondPpg === Infinity) {
          comparison = 0;
          break;
        }
        if (firstPpg === Infinity) return 1;
        if (secondPpg === Infinity) return -1;

        comparison = firstPpg - secondPpg;
        break;
      }
      default:
        comparison = 0;
    }

    return sortDir === "desc" ? -comparison : comparison;
  });
}

function cheapestPpg(
  item: Item,
  shipCost: number,
  itemIndex?: ItemIndex,
  selectedWeightBuckets?: Set<number> | null,
): number {
  const meta = getItemBrowseMeta(itemIndex, item);
  if (meta.ppgVariants.length === 0) return Infinity;

  let bestPrice = Infinity;
  for (const variant of meta.ppgVariants) {
    if (
      selectedWeightBuckets &&
      !selectedWeightBuckets.has(bucketGrams(variant.grams))
    ) {
      continue;
    }

    const pricePerGram = (variant.usd + shipCost) / variant.grams;
    if (pricePerGram < bestPrice) bestPrice = pricePerGram;
  }

  return bestPrice;
}

function itemShipCost(item: Item, includeShipping: boolean): number {
  if (!includeShipping) return 0;
  if (item.sh?.free) return 0;
  return typeof item.sh?.min === "number" ? item.sh.min : 0;
}

function buildCategoryCounts(
  items: Item[],
  filters: BrowseFilters,
  itemIndex?: ItemIndex,
): Record<string, number> {
  const categoryItems = applyFilters(
    items,
    filters,
    {
      skipCategory: true,
      skipSubcategory: true,
    },
    itemIndex,
  );
  const counts: Record<string, number> = { All: categoryItems.length };

  for (const item of categoryItems) {
    if (item.c) counts[item.c] = (counts[item.c] ?? 0) + 1;
  }

  return counts;
}

function buildAvailableSubcategories(
  items: Item[],
  filters: BrowseFilters,
  itemIndex?: ItemIndex,
): { name: string; count: number }[] {
  if (filters.category === "All") return [];

  const subcategoryItems = applyFilters(
    items,
    filters,
    {
      skipSubcategory: true,
    },
    itemIndex,
  );
  const counts = new Map<string, number>();

  for (const item of subcategoryItems) {
    if (item.c === filters.category && item.sc) {
      for (const subcategory of item.sc) {
        counts.set(subcategory, (counts.get(subcategory) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((first, second) => second.count - first.count);
}

function buildFilteredSellers(
  items: Item[],
  filters: BrowseFilters,
  itemIndex?: ItemIndex,
): SellerFacet[] {
  const sellerItems = applyFilters(
    items,
    filters,
    { skipSellers: true },
    itemIndex,
  );
  const hiddenSet = new Set(filters.hiddenSellers);
  const sellerMap = new Map<string, { name: string; count: number }>();

  for (const item of sellerItems) {
    if (item.sid == null || !item.sn) continue;
    const sellerId = getItemBrowseMeta(itemIndex, item).sellerId;
    if (hiddenSet.has(sellerId)) continue;

    const entry = sellerMap.get(sellerId);
    if (entry) entry.count++;
    else sellerMap.set(sellerId, { name: item.sn, count: 1 });
  }

  return Array.from(sellerMap.entries())
    .map(([id, { name, count }]) => ({ id, name, count }))
    .sort(
      (first, second) =>
        second.count - first.count || first.name.localeCompare(second.name),
    );
}

function buildAvailableSellers(
  items: Item[],
  itemIndex?: ItemIndex,
): SellerFacet[] {
  const sellerMap = new Map<string, { name: string; count: number }>();

  for (const item of items) {
    if (item.sid != null && item.sn) {
      const id = getItemBrowseMeta(itemIndex, item).sellerId;
      const entry = sellerMap.get(id);
      if (entry) entry.count++;
      else sellerMap.set(id, { name: item.sn, count: 1 });
    }
  }

  return Array.from(sellerMap.entries())
    .map(([id, { name, count }]) => ({ id, name, count }))
    .sort(
      (first, second) =>
        second.count - first.count || first.name.localeCompare(second.name),
    );
}

function buildAvailableShipFrom(
  items: Item[],
  filters: BrowseFilters,
  itemIndex?: ItemIndex,
): CountFacet[] {
  const shipFromItems = applyFilters(
    items,
    filters,
    {
      skipShipFrom: true,
      skipFreeShipping: true,
    },
    itemIndex,
  );
  const counts = new Map<string, number>();

  for (const item of shipFromItems) {
    const shipFrom = getItemBrowseMeta(itemIndex, item).shipFrom;
    if (shipFrom) counts.set(shipFrom, (counts.get(shipFrom) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: shipFromLabel(value),
      count,
    }))
    .sort((first, second) => second.count - first.count);
}

function buildAvailableWeights(
  items: Item[],
  filters: BrowseFilters,
  itemIndex?: ItemIndex,
): WeightFacet[] {
  const weightItems = applyFilters(
    items,
    filters,
    { skipWeights: true },
    itemIndex,
  );
  const counts = new Map<number, number>();

  for (const item of weightItems) {
    const meta = getItemBrowseMeta(itemIndex, item);
    for (const bucket of meta.weightBuckets) {
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([grams, count]) => ({
      grams,
      label: `${grams}g`,
      count,
    }))
    .sort((first, second) => first.grams - second.grams);
}

function buildAttrOptionCounts(
  items: Item[],
  filters: BrowseFilters,
  itemIndex?: ItemIndex,
): Record<string, Record<string, number>> {
  const baseItems = applyFilters(
    items,
    filters,
    { skipAttrs: true },
    itemIndex,
  );
  const result: Record<string, Record<string, number>> = {};
  const allKeys = new Set<string>();

  for (const item of baseItems) {
    if (item.at) {
      for (const key of Object.keys(item.at)) allKeys.add(key);
    }
  }

  for (const key of allKeys) {
    const otherKeys = Object.entries(filters.attrFilters).filter(
      ([otherKey, values]) => otherKey !== key && values.length > 0,
    );
    const counts: Record<string, number> = {};

    for (const item of baseItems) {
      let skip = false;

      for (const [otherKey, otherValues] of otherKeys) {
        const itemValue = item.at?.[otherKey];
        if (!itemValue) {
          skip = true;
          break;
        }
        if (Array.isArray(itemValue)) {
          if (!otherValues.some((value) => itemValue.includes(value))) {
            skip = true;
            break;
          }
        } else if (!otherValues.includes(String(itemValue))) {
          skip = true;
          break;
        }
      }

      if (skip) continue;

      const values = item.at?.[key];
      if (values == null) continue;
      if (Array.isArray(values)) {
        for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
      } else if (typeof values === "string") {
        counts[values] = (counts[values] ?? 0) + 1;
      }
    }

    result[key] = counts;
  }

  return result;
}
