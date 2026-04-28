#!/usr/bin/env tsx
import assert from "node:assert/strict";
import type {
  BrowseFilters,
  BrowseSnapshotInput,
} from "../src/lib/browse/filter-engine";
import {
  buildBrowseResults,
  buildBrowseSnapshot,
} from "../src/lib/browse/filter-engine";
import { buildItemIndex } from "../src/lib/browse/item-index";
import type { Item, SortDir, SortKey } from "../src/lib/types";

const items: Item[] = [
  {
    id: "flower-a",
    refNum: "101",
    n: "Gelato flower",
    d: "Sweet hybrid buds",
    sid: 1,
    sn: "Alice",
    c: "Flower",
    sc: ["Gelato"],
    sf: "United Kingdom",
    h: 10,
    uMin: 20,
    uMax: 42,
    fsa: "2024-01-01",
    lua: "2024-02-01",
    sh: { free: true, min: 0 },
    v: [
      { d: "3.5g", usd: 20 },
      { d: "7g", usd: 42 },
    ],
    at: { effect: ["Hybrid"], tier: ["Premium"] },
  },
  {
    id: "flower-b",
    refNum: "102",
    n: "Haze flower",
    d: "Bright sativa",
    sid: 2,
    sn: "Bob",
    c: "Flower",
    sc: ["Haze"],
    sf: "Spain",
    h: 5,
    uMin: 15,
    uMax: 15,
    fsa: "2024-03-01",
    lua: "2024-03-10",
    sh: { min: 5, free: false },
    v: [{ d: "1g", usd: 15 }],
    at: { effect: ["Sativa"], tier: ["Budget"] },
  },
  {
    id: "hash-a",
    refNum: "103",
    n: "Dry sift hash",
    d: "90u resin",
    sid: 1,
    sn: "Alice",
    c: "Hash",
    sc: ["DrySift"],
    sf: "United Kingdom",
    h: 20,
    uMin: 25,
    uMax: 25,
    fsa: "2024-02-01",
    lua: "2024-04-01",
    sh: { min: 3, free: false },
    v: [{ d: "5g", usd: 25 }],
    at: { micron: ["90u"], tier: ["Premium"] },
  },
  {
    id: "edible-a",
    refNum: "104",
    n: "Vegan gummies",
    d: "Fruit sweets",
    sid: 3,
    sn: "Carol",
    c: "Edibles",
    sc: ["Gummies"],
    sf: "Germany",
    h: 1,
    uMin: 10,
    uMax: 20,
    fsa: "2024-01-15",
    lua: "2024-02-15",
    sh: { min: 2, free: false },
    v: null,
    at: { dietary: ["Vegan"] },
  },
];

const edgeItems: Item[] = [
  {
    id: "missing-category-price",
    n: "Mystery item",
    d: "Sparse crawler row",
    sid: null,
    sn: null,
    c: null,
    sc: null,
    sf: null,
    h: null,
    uMin: null,
    uMax: null,
    sh: null,
    v: [],
    at: null,
  },
  {
    id: "string-attr",
    n: "Loose premium flower",
    d: null,
    sid: 4,
    sn: "Dana",
    c: "Flower",
    sc: null,
    sf: "France",
    h: 2,
    uMin: 0,
    uMax: null,
    sh: { free: false, min: null },
    v: null,
    at: { tier: "Premium" } as unknown as Item["at"],
  },
];

const baseFilters: BrowseFilters = {
  category: "All",
  subcategories: [],
  query: "",
  selectedSellers: [],
  hiddenSellers: [],
  priceRange: { min: 0, max: Infinity },
  bookmarksOnly: false,
  bookmarks: null,
  attrFilters: {},
  selectedShipFrom: [],
  excludedShipFrom: [],
  freeShippingOnly: false,
  selectedWeights: [],
};

function input(
  filters: Partial<BrowseFilters> = {},
  sortKey: SortKey = "hottest",
  sortDir: SortDir = "desc",
  sourceItems: Item[] = items,
): BrowseSnapshotInput {
  return {
    items: sourceItems,
    itemIndex: buildItemIndex(sourceItems),
    filters: { ...baseFilters, ...filters },
    sortKey,
    sortDir,
    includeShipping: false,
  };
}

function ids(results: Item[]): string[] {
  return results.map((item) => String(item.id));
}

assert.deepEqual(ids(buildBrowseResults(input()).sortedItems), [
  "hash-a",
  "flower-a",
  "flower-b",
  "edible-a",
]);

assert.deepEqual(
  ids(buildBrowseResults(input({ category: "Flower" })).filteredItems),
  ["flower-a", "flower-b"],
);

assert.deepEqual(
  ids(
    buildBrowseResults(input({ category: "Flower", subcategories: ["Gelato"] }))
      .filteredItems,
  ),
  ["flower-a"],
);

const flowerSnapshot = buildBrowseSnapshot(input({ category: "Flower" }));
assert.deepEqual(flowerSnapshot.categoryCounts, {
  All: 4,
  Flower: 2,
  Hash: 1,
  Edibles: 1,
});
assert.deepEqual(flowerSnapshot.availableSubcategories, [
  { name: "Gelato", count: 1 },
  { name: "Haze", count: 1 },
]);

assert.deepEqual(
  ids(buildBrowseResults(input({ selectedSellers: ["1"] })).filteredItems),
  ["flower-a", "hash-a"],
);
assert.deepEqual(
  ids(buildBrowseResults(input({ hiddenSellers: ["1"] })).filteredItems),
  ["flower-b", "edible-a"],
);

assert.deepEqual(
  ids(
    buildBrowseResults(input({ selectedShipFrom: ["united kingdom"] }))
      .filteredItems,
  ),
  ["flower-a", "hash-a"],
);
assert.deepEqual(
  ids(buildBrowseResults(input({ excludedShipFrom: ["spain"] })).filteredItems),
  ["flower-a", "hash-a", "edible-a"],
);
assert.deepEqual(
  ids(buildBrowseResults(input({ freeShippingOnly: true })).filteredItems),
  ["flower-a"],
);

assert.deepEqual(
  ids(buildBrowseResults(input({ selectedWeights: [3.5] })).filteredItems),
  ["flower-a"],
);
assert.deepEqual(
  ids(buildBrowseResults(input({ selectedWeights: [5] })).filteredItems),
  ["hash-a"],
);

assert.deepEqual(
  ids(
    buildBrowseResults(input({ attrFilters: { effect: ["Hybrid"] } }))
      .filteredItems,
  ),
  ["flower-a"],
);
assert.deepEqual(
  buildBrowseSnapshot(
    input({ category: "Flower", attrFilters: { tier: ["Premium"] } }),
  ).attrOptionCounts.effect,
  { Hybrid: 1 },
);

assert.deepEqual(
  ids(
    buildBrowseResults(
      input({ bookmarksOnly: true, bookmarks: new Set(["102"]) }),
    ).filteredItems,
  ),
  ["flower-b"],
);

assert.deepEqual(
  ids(buildBrowseResults(input({}, "price", "asc")).sortedItems),
  ["edible-a", "flower-b", "flower-a", "hash-a"],
);
assert.deepEqual(ids(buildBrowseResults(input({}, "ppg", "asc")).sortedItems), [
  "hash-a",
  "flower-a",
  "flower-b",
  "edible-a",
]);

const ppgWeightItems: Item[] = [
  {
    id: "cheap-eighth-expensive-half",
    n: "Cheap eighth, dear half",
    c: "Flower",
    uMin: 10,
    uMax: 70,
    v: [
      { d: "3.5g", usd: 10 },
      { d: "14g", usd: 70 },
    ],
  },
  {
    id: "fair-half",
    n: "Fair half",
    c: "Flower",
    uMin: 55,
    uMax: 55,
    v: [{ d: "14g", usd: 55 }],
  },
];

assert.deepEqual(
  ids(
    buildBrowseResults(
      input({ selectedWeights: [14] }, "ppg", "asc", ppgWeightItems),
    ).sortedItems,
  ),
  ["fair-half", "cheap-eighth-expensive-half"],
);

const edgeSnapshot = buildBrowseSnapshot(
  input({}, "hottest", "desc", edgeItems),
);
assert.deepEqual(edgeSnapshot.categoryCounts, {
  All: 2,
  Flower: 1,
});
assert.deepEqual(
  ids(
    buildBrowseResults(
      input({ priceRange: { min: 100, max: 200 } }, "hottest", "desc", [
        edgeItems[0],
      ]),
    ).filteredItems,
  ),
  ["missing-category-price"],
);
assert.deepEqual(
  ids(
    buildBrowseResults(
      input({ selectedWeights: [1] }, "hottest", "desc", edgeItems),
    ).filteredItems,
  ),
  [],
);
assert.deepEqual(
  ids(
    buildBrowseResults(
      input(
        { attrFilters: { tier: ["Premium"] } },
        "hottest",
        "desc",
        edgeItems,
      ),
    ).filteredItems,
  ),
  ["string-attr"],
);

console.log("filter-engine checks passed");
