import { computeSeedFlags } from "@/lib/seedFlags";

/**
 * Pre-hydration seed-grid guard — rendered in `app/[locale]/layout.tsx`
 * <head>, NOT in the browse page tree.
 *
 * Placement matters: React only executes inline <script> tags that arrive in
 * the server-rendered document. If this lived inside a page component, every
 * client-side navigation would re-render the element WITHOUT executing it,
 * and React logs "Encountered a script tag while rendering React component"
 * to the console. In the layout it is server-rendered exactly once per hard
 * load (never re-rendered on client nav), which is also the only moment the
 * script is actually needed: it must run synchronously before the browse
 * seed grid first paints. Client-side navigations are covered by
 * `SeedParamsSync` (mounted on the browse page), which recomputes the same
 * flags in a layout effect.
 *
 * The flag logic lives in `lib/seedFlags.ts` (shared with SeedParamsSync for
 * byte parity) and is embedded here via Function.prototype.toString(). It
 * sets `html.bi-seed-hide` when the SSR'd default seeds can't match the
 * post-hydration view (URL filter params, or persisted non-default
 * sort/layout) and `html.bi-cols-2` for the persisted 2-per-row mobile
 * layout — see lib/seedFlags.ts for the full rationale. CSS in item-card.css
 * then swaps the seed grid for the dimension-matched skeleton grid; the
 * header/toolbar stay visible and nothing overlays content.
 *
 * Stamping the classes globally (on every route) is harmless: the selectors
 * only affect `[data-seed-grid]`/`[data-seed-skeleton]`, which exist solely
 * in the browse page's ItemGrid. Crawlers fetch /browse without params and
 * with empty storage → the raw HTML keeps the full linked seed grid
 * (SEO-critical) and the classes are never stamped.
 */

const SEED_PARAMS_JS = `(function(){try{var r=(${computeSeedFlags.toString()})(location.search);var d=document.documentElement;d.classList.toggle("bi-seed-hide",r.hide);d.classList.toggle("bi-cols-2",r.cols2)}catch(e){}})();`;

export function SeedParamsScript() {
  return <script dangerouslySetInnerHTML={{ __html: SEED_PARAMS_JS }} />;
}
