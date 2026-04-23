import type { Item } from "./types";

/** Lightweight seed item for SSR loading state */
export interface SeedItem {
  id: string | number;
  n: string;
  i?: string | null;
  uMin: number;
  sn?: string | null;
}

/**
 * Build lightweight seed items for the server-rendered loading state.
 * Sorted by hotness (default sort) and trimmed to essential fields.
 * This runs server-side in page.tsx — gives the browser real <img> tags
 * in the initial HTML so the preload scanner discovers them immediately.
 */
export function buildSeedItems(items: Item[], count = 12): SeedItem[] {
  return [...items]
    .sort((a, b) => (b.h ?? 0) - (a.h ?? 0))
    .slice(0, count)
    .map(({ id, n, i, uMin, sn }) => ({ id, n, i, uMin: uMin ?? 0, sn }));
}
