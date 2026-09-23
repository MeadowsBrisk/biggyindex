/**
 * Price-index computation shared by /prices and /api/prices. Per-gram stats
 * are scoped to categories sold by cannabis weight (edibles list the food's
 * mass); vapes and distillate are computed in their own units. All figures
 * are USD — callers convert to the market currency.
 */

import { decodeEntities } from "@/lib/format";
import { isOffWall } from "@/lib/off-wall";
import { median, quantile, SENTINEL_USD } from "@/lib/prices/stats";
import type { Item } from "@/lib/types";

/** Categories sold by cannabis weight — the only ones where $/g is comparable. */
export const WEIGHT_CATEGORIES = new Set([
  "Flower",
  "Shake",
  "Hash",
  "Concentrates",
]);
/** Categories that get a best-value board of their own. */
export const BOARD_CATEGORIES = ["Flower", "Hash", "Shake"] as const;
/** Rows per best-value board (one per seller). */
const BOARD_ROWS = 5;
/** Categories need this many gram-priced listings to earn a table row. */
export const MIN_CATEGORY_LISTINGS = 5;
/** Per-gram sanity ceiling — the legitimate live maximum is ~$200/g hash. */
const MAX_USD_PER_GRAM = 300;
/** Shake-grade matter sold inside a Flower listing — keep it off the Flower board. */
export const SHAKE_TEXT_RE = /\b(?:shake|trim|dust|smalls|stems)\b/i;

/** Retail sizes buyers search for, in grams. Matched exactly, never bucketed. */
export const STANDARD_WEIGHTS = [1, 3.5, 7, 14, 28] as const;
export type StandardWeight = (typeof STANDARD_WEIGHTS)[number];
const STANDARD_WEIGHT_SET = new Set<number>(STANDARD_WEIGHTS);
/** A per-size cell needs this many listings to be quoted rather than withheld. */
const MIN_WEIGHT_CELL_LISTINGS = 3;

export interface CategoryStats {
  category: string;
  listings: number;
  /** USD per gram over all gram-denominated variants in the category. */
  median: number;
  p25: number;
  p75: number;
  min: number;
}

export interface BestValueRow {
  ref: string;
  name: string;
  seller: string | null;
  /** Item's cheapest USD-per-gram across its gram-denominated variants. */
  usdPerGram: number;
}

export interface BestValueBoard {
  category: (typeof BOARD_CATEGORIES)[number];
  rows: BestValueRow[];
}

export interface DistillateBand {
  key: "bandSmall" | "bandMid" | "bandLarge";
  /** Median USD per ml within the band. */
  median: number;
  count: number;
}

export interface WeightCell {
  size: StandardWeight;
  /** Median of per-listing asking prices at this exact size, USD. */
  median: number;
  listings: number;
}

export interface WeightRow {
  category: string;
  /** One slot per STANDARD_WEIGHTS entry; null where too few listings. */
  cells: (WeightCell | null)[];
}

export interface PriceIndex {
  /** Weight-category items with at least one valid gram-denominated variant. */
  listingCount: number;
  overallMedian: number;
  cheapest: number;
  categories: CategoryStats[];
  boards: BestValueBoard[];
  /**
   * Freshness read from the data, never from the clock: the page renders
   * inside "use cache", so a wall-clock stamp would freeze into the cache.
   */
  updatedAt: string | null;
  /** Oldest first-seen stamp among the priced listings. */
  firstSeenAt: string | null;
}

export function validPerGram(usd: number, g: number): boolean {
  return (
    Number.isFinite(usd) &&
    Number.isFinite(g) &&
    usd > 0 &&
    g > 0 &&
    usd !== SENTINEL_USD &&
    usd / g <= MAX_USD_PER_GRAM
  );
}

/** Per-gram asking prices for one item; sentinel and nonsense values dropped. */
export function perGramPrices(item: Item, excludeShakeText = false): number[] {
  const prices: number[] = [];
  for (const variant of item.v ?? []) {
    const { usd, g } = variant;
    if (typeof usd !== "number" || typeof g !== "number") continue;
    if (!validPerGram(usd, g)) continue;
    if (excludeShakeText && SHAKE_TEXT_RE.test(variant.d ?? "")) continue;
    prices.push(usd / g);
  }
  return prices;
}

/** Newer of two ISO stamps, ignoring unparseable ones. */
function newer(current: string | null, candidate: string | null | undefined) {
  if (!candidate || !Number.isFinite(Date.parse(candidate))) return current;
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return current;
}

/** Older of two ISO stamps, ignoring unparseable ones. */
function older(current: string | null, candidate: string | null | undefined) {
  if (!candidate || !Number.isFinite(Date.parse(candidate))) return current;
  if (!current || Date.parse(candidate) < Date.parse(current)) return candidate;
  return current;
}

export function buildPriceIndex(items: Item[]): PriceIndex | null {
  const byCategory = new Map<string, { prices: number[]; listings: number }>();
  const allPrices: number[] = [];
  const candidates = new Map<string, BestValueRow[]>();
  let listingCount = 0;
  let updatedAt: string | null = null;
  let firstSeenAt: string | null = null;

  for (const item of items) {
    if (!item.c || !WEIGHT_CATEGORIES.has(item.c) || isOffWall(item)) continue;
    const prices = perGramPrices(item);
    if (prices.length === 0) continue;
    listingCount++;
    allPrices.push(...prices);
    updatedAt = newer(updatedAt, item.lua);
    firstSeenAt = older(firstSeenAt, item.fsa);

    let entry = byCategory.get(item.c);
    if (!entry) {
      entry = { prices: [], listings: 0 };
      byCategory.set(item.c, entry);
    }
    entry.prices.push(...prices);
    entry.listings++;

    if ((BOARD_CATEGORIES as readonly string[]).includes(item.c)) {
      // Flower board only ranks bud: a "28 g shake" tier or a "dust and
      // stems" listing filed under Flower belongs on the shake board.
      const boardPrices =
        item.c === "Flower"
          ? SHAKE_TEXT_RE.test(item.n)
            ? []
            : perGramPrices(item, true)
          : prices;
      if (boardPrices.length > 0) {
        const rows = candidates.get(item.c) ?? [];
        rows.push({
          ref: String(item.refNum ?? item.id),
          name: decodeEntities(item.n),
          seller: item.sn ?? null,
          usdPerGram: Math.min(...boardPrices),
        });
        candidates.set(item.c, rows);
      }
    }
  }

  if (allPrices.length === 0) return null;
  allPrices.sort((a, b) => a - b);

  const boards: BestValueBoard[] = BOARD_CATEGORIES.map((category) => {
    const rows = (candidates.get(category) ?? []).sort(
      (a, b) => a.usdPerGram - b.usdPerGram,
    );
    // One row per seller, so a single seller's menu can't fill the board.
    const seen = new Set<string>();
    const deduped: BestValueRow[] = [];
    for (const row of rows) {
      const key = row.seller ?? row.ref;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
      if (deduped.length === BOARD_ROWS) break;
    }
    return { category, rows: deduped };
  }).filter((board) => board.rows.length > 0);

  const categories: CategoryStats[] = [...byCategory.entries()]
    .filter(([, entry]) => entry.listings >= MIN_CATEGORY_LISTINGS)
    .map(([category, entry]) => {
      const sorted = entry.prices.sort((a, b) => a - b);
      return {
        category,
        listings: entry.listings,
        median: quantile(sorted, 0.5),
        p25: quantile(sorted, 0.25),
        p75: quantile(sorted, 0.75),
        min: sorted[0],
      };
    })
    .sort((a, b) => b.listings - a.listings);

  return {
    listingCount,
    overallMedian: quantile(allPrices, 0.5),
    cheapest: allPrices[0],
    categories,
    boards,
    updatedAt,
    firstSeenAt,
  };
}

/**
 * Median asking price at each standard retail size, per weight category.
 *
 * Sizes match the crawler-stamped grams EXACTLY — a 30g variant is not an
 * ounce and a 3g one is not an eighth, and bucketing them would quietly
 * rewrite what the column heading claims. Each listing votes once per size
 * (the median of its own options at that size), so one long menu cannot
 * carry a cell; cells with too few listings are withheld entirely.
 */
export function buildWeightTable(items: Item[]): WeightRow[] {
  // category → size → listing ref → prices
  const byCategory = new Map<string, Map<number, Map<string, number[]>>>();

  for (const item of items) {
    if (!item.c || !WEIGHT_CATEGORIES.has(item.c) || isOffWall(item)) continue;
    // Parked listings carry placeholder prices, not asking prices.
    if (item.so) continue;
    for (const variant of item.v ?? []) {
      if (variant.so) continue;
      const { usd, g } = variant;
      if (typeof usd !== "number" || typeof g !== "number") continue;
      if (!STANDARD_WEIGHT_SET.has(g)) continue;
      if (!validPerGram(usd, g)) continue;

      let sizes = byCategory.get(item.c);
      if (!sizes) {
        sizes = new Map();
        byCategory.set(item.c, sizes);
      }
      let listings = sizes.get(g);
      if (!listings) {
        listings = new Map();
        sizes.set(g, listings);
      }
      const ref = String(item.refNum ?? item.id);
      const prices = listings.get(ref) ?? [];
      prices.push(usd);
      listings.set(ref, prices);
    }
  }

  return [...byCategory.entries()]
    .map(([category, sizes]) => {
      const cells = STANDARD_WEIGHTS.map((size) => {
        const listings = sizes.get(size);
        if (!listings || listings.size < MIN_WEIGHT_CELL_LISTINGS) return null;
        return {
          size,
          median: median([...listings.values()].map(median)),
          listings: listings.size,
        };
      });
      return { category, cells };
    })
    .filter((row) => row.cells.some((cell) => cell !== null))
    .sort((a, b) => weightRowListings(b) - weightRowListings(a));
}

/** Total listings behind a row's visible cells — row ordering only. */
function weightRowListings(row: WeightRow): number {
  return row.cells.reduce((sum, cell) => sum + (cell?.listings ?? 0), 0);
}

export function buildDistillateBands(items: Item[]): DistillateBand[] {
  const bands: Record<
    DistillateBand["key"],
    { perMl: number[]; refs: Set<string> }
  > = {
    bandSmall: { perMl: [], refs: new Set() },
    bandMid: { perMl: [], refs: new Set() },
    bandLarge: { perMl: [], refs: new Set() },
  };
  const allRefs = new Set<string>();
  for (const item of items) {
    if (item.c !== "Distillate" || isOffWall(item)) continue;
    for (const v of item.v ?? []) {
      if (v.u !== "ml" || typeof v.q !== "number" || v.q <= 0) continue;
      if (typeof v.usd !== "number" || v.usd <= 0 || v.usd === SENTINEL_USD)
        continue;
      const key = v.q <= 5 ? "bandSmall" : v.q <= 50 ? "bandMid" : "bandLarge";
      bands[key].perMl.push(v.usd / v.q);
      const ref = String(item.refNum ?? item.id);
      bands[key].refs.add(ref);
      allRefs.add(ref);
    }
  }
  if (allRefs.size < MIN_CATEGORY_LISTINGS) return [];
  return (Object.keys(bands) as DistillateBand["key"][])
    .map((key) =>
      bands[key].perMl.length > 0
        ? { key, median: median(bands[key].perMl), count: bands[key].refs.size }
        : null,
    )
    .filter((band): band is DistillateBand => band !== null);
}
