/**
 * Pre-hydration seed-grid guard for /browse.
 *
 * The browse page is cached path-only (`'use cache'`), so its SSR HTML always
 * contains the default (unfiltered, hottest-sorted) seed grid. On a first
 * load WITH filter params in the URL (shared links like /browse?cat=Flower)
 * those seeds would be visibly wrong until hydration applies the filters.
 *
 * This tiny inline script runs synchronously before the grid paints and sets
 * `html.bi-seed-hide` when the SSR'd default seeds can't match what the user
 * will see after hydration:
 *   1. location.search contains any browse filter param (shared links —
 *      see lib/urlFilters browseUrlParsers), or
 *   2. localStorage holds a non-default persisted view: sortKey (raw string,
 *      custom storage) / sortDir / viewLayout / mobileGridCols (JSON-encoded
 *      by atomWithStorage) — otherwise returning users with e.g. "newest"
 *      sort or list layout would watch real cards visibly reorder/reflow.
 * CSS in item-card.css then hides the seed grid and shows the
 * dimension-matched skeleton grid instead — the header/toolbar stay visible
 * and nothing overlays content. `html.bi-cols-2` additionally switches the
 * skeleton grid to the persisted 2-per-row mobile layout so the
 * skeleton→live swap doesn't reflow columns.
 *
 * Classes are toggled BOTH ways so client-side navigations (React executes
 * freshly inserted inline scripts) and param-less loads stay correct.
 * Crawlers fetch /browse without params → the raw HTML keeps the full linked
 * seed grid (SEO-critical). Storage defaults here must track
 * DEFAULT_SORT_KEY/DEFAULT_SORT_DIR (urlFilters) and the atom defaults in
 * store/atoms.ts.
 */

const SEED_PARAMS_JS = `(function(){try{var h=false;var p=new URLSearchParams(location.search);var k=["cat","sub","q","sellers","pmin","pmax","sort","dir"];for(var i=0;i<k.length;i++){if(p.has(k[i])){h=true;break}}var ls=window.localStorage;var sk=ls.getItem("sortKey");if(sk&&sk!=="hottest")h=true;var sd=ls.getItem("sortDir");if(sd&&sd!=='"desc"')h=true;var vl=ls.getItem("viewLayout");if(vl&&vl!=='"grid"')h=true;var mc=ls.getItem("mobileGridCols");var c2=mc==="2";if(c2)h=true;var d=document.documentElement;d.classList.toggle("bi-seed-hide",h);d.classList.toggle("bi-cols-2",c2)}catch(e){}})();`;

export function SeedParamsScript() {
  return <script dangerouslySetInnerHTML={{ __html: SEED_PARAMS_JS }} />;
}
