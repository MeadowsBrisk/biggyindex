/**
 * Relative-time helper (lightweight, no deps).
 *
 * Extracted from ItemCard so non-card surfaces (e.g. the /littlebiggy-status
 * "last checked N minutes ago" leaf) can reuse it without pulling ItemCard's
 * whole module graph into their bundle. ItemCard re-exports it, so
 * `ItemRow.tsx`'s existing import path keeps working unchanged.
 *
 * Deliberately takes `now` as an argument rather than reading the clock: the
 * caller supplies a client-stamped `clientNow`, which is what keeps cached
 * server HTML free of wall-clock values.
 */

/* ── First crawl batch cutoff — items with fsa on or before this date
   were already on the marketplace when we started crawling (2025-08-31)
   and don't have meaningful "listed" dates ── */
export const FIRST_CRAWL_TS = new Date("2025-09-01T00:00:00Z").getTime();

export type RelativeAge = {
  unit: "minutes" | "hours" | "days" | "months";
  count: number;
};

export function relativeAge(
  iso: string | null | undefined,
  now: number | null,
): RelativeAge | null {
  if (now == null) return null;
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  if (ts < FIRST_CRAWL_TS) return null; // Pre-dates our crawling — no real listed date
  const ms = now - ts;
  if (ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return { unit: "minutes", count: mins };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { unit: "hours", count: hrs };
  const days = Math.floor(hrs / 24);
  if (days < 30) return { unit: "days", count: days };
  const months = Math.floor(days / 30);
  return { unit: "months", count: months };
}
