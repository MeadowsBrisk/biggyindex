import type { Item } from "./types";

/** Lightweight seed item for SSR loading state */
export interface SeedItem {
  id: string | number;
  /** Reference number — powers the crawlable /item/{ref} link */
  refNum?: string | number | null;
  n: string;
  /** Primary category (crawlable card context) */
  c?: string | null;
  i?: string | null;
  ih?: string | null;
  ia?: 1 | 0 | boolean | null;
  sn?: string | null;
}

/**
 * Build lightweight seed items for the server-rendered loading state.
 * Sorted by hotness descending — mirrors the client's boot sort
 * (DEFAULT_SORT_KEY "hottest" / DEFAULT_SORT_DIR "desc") so the SSR grid
 * and the hydrated grid agree. Trimmed to essential fields.
 * This runs server-side in page.tsx — gives the browser real <img> tags
 * in the initial HTML so the preload scanner discovers them immediately,
 * and gives crawlers real /item/{ref} links with the item name as anchor
 * text.
 */
export function buildSeedItems(items: Item[], count = 36): SeedItem[] {
  return [...items]
    .sort((a, b) => (b.h ?? 0) - (a.h ?? 0))
    .slice(0, count)
    .map(({ id, refNum, n, c, i, ih, ia, sn }) => ({
      id,
      refNum,
      n,
      c,
      i,
      ih,
      ia,
      sn,
    }));
}
