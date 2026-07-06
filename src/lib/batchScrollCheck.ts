/**
 * Batched scroll-overflow check (ported from food-aggregator).
 *
 * Multiple components (ItemCard pill strips) need to check whether their
 * content overflows horizontally (`scrollWidth > clientWidth`) and set
 * `data-scrollable` / `data-scrolled` / `data-at-end` attributes for CSS.
 *
 * Doing this per-card causes read→write→read forced-reflow thrashing when
 * many cards mount in interleaved commits (progressive render chunks).
 * This module collects all pending elements and processes them in a single
 * rAF:
 *   Phase 1: read scrollWidth/clientWidth/scrollLeft for ALL elements
 *            (one reflow)
 *   Phase 2: write data-* attributes for ALL elements (no reflow)
 */

const pending: HTMLElement[] = [];
let rafId: number | null = null;

function flush() {
  rafId = null;
  const els = pending.splice(0);
  // Phase 1 — all reads (single reflow)
  const results = els.map((el) => ({
    scrollable: el.scrollWidth > el.clientWidth,
    atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
  }));
  // Phase 2 — all writes (no further reflow)
  for (let i = 0; i < els.length; i++) {
    const { scrollable, atEnd } = results[i];
    els[i].dataset.scrollable = scrollable ? "true" : "false";
    els[i].dataset.scrolled = "false";
    els[i].dataset.atEnd = !scrollable ? "true" : atEnd ? "true" : "false";
  }
}

/**
 * Schedule a scroll-overflow check for the given element.
 * All checks scheduled in the same tick are batched into one rAF.
 */
export function scheduleScrollCheck(el: HTMLElement): void {
  pending.push(el);
  if (rafId === null) {
    rafId = requestAnimationFrame(flush);
  }
}

/** Drop an element from the pending queue (e.g. on unmount before flush). */
export function cancelScrollCheck(el: HTMLElement): void {
  const index = pending.indexOf(el);
  if (index >= 0) pending.splice(index, 1);
}
