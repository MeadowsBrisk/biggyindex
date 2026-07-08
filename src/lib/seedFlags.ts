/**
 * Seed-grid guard flags — shared between the pre-hydration inline script
 * (`components/SeedParamsScript.tsx`, rendered by `app/[locale]/layout.tsx`)
 * and the client-navigation sync (`components/SeedParamsSync.tsx`).
 *
 * The browse page is cached path-only (`'use cache'`), so its SSR HTML always
 * contains the default (unfiltered, hottest-sorted) seed grid. The SSR'd
 * default seeds can't match what the user will see after hydration when:
 *   1. the search string contains any browse filter param (shared links —
 *      see lib/urlFilters browseUrlParsers), or
 *   2. localStorage holds a non-default persisted view: sortKey (raw string,
 *      custom storage) / sortDir / viewLayout / mobileGridCols (JSON-encoded
 *      by atomWithStorage) — otherwise returning users with e.g. "newest"
 *      sort or list layout would watch real cards visibly reorder/reflow.
 * In that case `hide` is true → CSS in item-card.css hides the seed grid
 * (`html.bi-seed-hide [data-seed-grid]`) and shows the dimension-matched
 * skeleton grid instead. `cols2` mirrors the persisted 2-per-row mobile
 * layout (`html.bi-cols-2`) so the skeleton→live swap doesn't reflow columns.
 *
 * IMPORTANT: this function is embedded into the layout's inline <script> via
 * `Function.prototype.toString()`, so it MUST stay fully self-contained — no
 * imports, no module-scope references, browser-safe JS only. Storage defaults
 * here must track DEFAULT_SORT_KEY/DEFAULT_SORT_DIR (lib/urlFilters) and the
 * atom defaults in store/atoms.ts.
 */

export interface SeedFlags {
  /** Hide the SSR'd seed grid, show the skeleton grid (html.bi-seed-hide). */
  hide: boolean;
  /** Persisted 2-per-row mobile layout (html.bi-cols-2). */
  cols2: boolean;
}

export function computeSeedFlags(search: string): SeedFlags {
  let hide = false;
  const params = new URLSearchParams(search);
  const keys = ["cat", "sub", "q", "sellers", "pmin", "pmax", "sort", "dir"];
  for (let i = 0; i < keys.length; i++) {
    if (params.has(keys[i])) {
      hide = true;
      break;
    }
  }
  const ls = window.localStorage;
  const sortKey = ls.getItem("sortKey");
  if (sortKey && sortKey !== "hottest") hide = true;
  const sortDir = ls.getItem("sortDir");
  if (sortDir && sortDir !== '"desc"') hide = true;
  const viewLayout = ls.getItem("viewLayout");
  if (viewLayout && viewLayout !== '"grid"') hide = true;
  const mobileCols = ls.getItem("mobileGridCols");
  const cols2 = mobileCols === "2";
  if (cols2) hide = true;
  return { hide: hide, cols2: cols2 };
}
