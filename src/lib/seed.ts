import type { Item } from "./types";

/** Display currency context used to pre-format seed prices server-side. */
export interface SeedCurrency {
  /** Display currency symbol (e.g. "£", "€", "$"). */
  symbol: string;
  /** Multiplier converting stored USD amounts → display currency. */
  rate: number;
}

/** Lightweight seed item for SSR loading state */
export interface SeedItem {
  id: string | number;
  /** Reference number — powers the crawlable /item/{ref} link */
  refNum?: string | number | null;
  n: string;
  /** Primary category (crawlable card context) */
  c?: string | null;
  /** Translated category label for the image pill (mirrors the live CardPill). */
  cl?: string | null;
  /** First subcategory (raw) — appended after the category in the pill. */
  sc0?: string | null;
  i?: string | null;
  ih?: string | null;
  ia?: 1 | 0 | boolean | null;
  sn?: string | null;
  /**
   * Pre-formatted, currency-converted price string. Matches the live card's
   * footer format exactly (see fmtPrice in ItemCard): a single price to 2dp
   * or a rounded "min – max" range. Null when the item has no min price.
   */
  p?: string | null;
  /**
   * Rating average (1-10 scale). Only present when > 0 — mirrors the live
   * card's rating-chip gate so we don't render a "0.0" placeholder.
   */
  ra?: number | null;
  /** Rating count — only present alongside `ra`. */
  rc?: number | null;
}

/**
 * Format a USD min/max range into the display currency.
 * 1:1 with ItemCard's `fmtPrice` so the seed price reads identically to the
 * price the live card swaps in. Returns null (not "N/A") when min is missing
 * so the seed can reserve the price box height without printing filler.
 */
function fmtSeedPrice(
  min: number | null | undefined,
  max: number | null | undefined,
  sym: string,
  rate: number,
): string | null {
  if (min == null) return null;
  if (max != null && max !== min) {
    return `${sym}${Math.round(min * rate)} – ${sym}${Math.round(max * rate)}`;
  }
  return `${sym}${(min * rate).toFixed(2)}`;
}

export interface BuildSeedOptions {
  count?: number;
  /** Server-resolved display currency (symbol + USD→native rate). */
  currency: SeedCurrency;
  /**
   * Translate a category key to the display locale (next-intl `categories`
   * namespace). Optional — falls back to the raw key when omitted.
   */
  translateCategory?: (category: string) => string;
}

/**
 * Build lightweight seed items for the server-rendered loading state.
 * Sorted by hotness descending — mirrors the client's boot sort
 * (DEFAULT_SORT_KEY "hottest" / DEFAULT_SORT_DIR "desc") so the SSR grid
 * and the hydrated grid agree. Trimmed to essential, high-visibility fields.
 *
 * This runs server-side in page.tsx — gives the browser real <img> tags in
 * the initial HTML so the preload scanner discovers them immediately, gives
 * crawlers real /item/{ref} links with the item name as anchor text, and now
 * pre-formats the currency-converted price + rating + category pill so a seed
 * card reads as a complete card (not an image-with-missing-text stub) before
 * live data lands.
 */
export function buildSeedItems(
  items: Item[],
  opts: BuildSeedOptions,
): SeedItem[] {
  const { count = 36, currency, translateCategory } = opts;
  const { symbol, rate } = currency;
  return [...items]
    .sort((a, b) => (b.h ?? 0) - (a.h ?? 0))
    .slice(0, count)
    .map((item) => {
      const avg = item.rs?.avg;
      const hasRating = typeof avg === "number" && avg > 0;
      const cat = item.c ?? null;
      return {
        id: item.id,
        refNum: item.refNum,
        n: item.n,
        c: cat,
        cl: cat ? (translateCategory ? translateCategory(cat) : cat) : null,
        sc0: item.sc?.[0] ?? null,
        i: item.i,
        ih: item.ih,
        ia: item.ia,
        sn: item.sn,
        p: fmtSeedPrice(item.uMin, item.uMax, symbol, rate),
        ra: hasRating ? avg : null,
        rc: hasRating ? (item.rs?.cnt ?? null) : null,
      };
    });
}
