/**
 * Uptime window aggregation for /littlebiggy-status.
 *
 * Collapses the blob's rolling list of up-to-144 reachability checks into a
 * FIXED 24-bucket (hourly) window. Fixed count is what makes the strip
 * non-wrapping at any viewport: the renderer lays 24 `flex-1` segments in a
 * `flex` (nowrap) row, so flexbox does the width maths and the DOM node count
 * is constant. Empty hours render as a muted "no data" track rather than
 * changing the geometry.
 *
 * PURE BY CONTRACT — there is no `Date.now()` anywhere in this file. The
 * window anchors to the blob's own `lastCheckedAt`, so the result is a pure
 * function of the data and is safe to compute inside a `"use cache"` render.
 * Anchoring to the wall clock would bake a timestamp into cached HTML and
 * make empty buckets drift in from the right on every cache hit.
 */

import type { StatusCheck } from "@/lib/data";

export const BUCKET_COUNT = 24;
const BUCKET_MS = 3_600_000;

export type BucketState = "up" | "mixed" | "down" | "none";

export interface UptimeBucket {
  state: BucketState;
  up: number;
  total: number;
  start: number;
  end: number;
}

export interface UptimeWindow {
  buckets: UptimeBucket[];
  /** Checks INSIDE the window — not `recentChecks.length`. */
  total: number;
  upCount: number;
  downCount: number;
  /** 0–100, 1dp. `null` when `total === 0`. */
  uptimePct: number | null;
  medianLatencyMs: number | null;
}

export function buildUptimeWindow(
  checks: StatusCheck[],
  lastCheckedAt: string,
): UptimeWindow {
  const anchor = Date.parse(lastCheckedAt);
  // floor+1, NOT ceil: with ceil, an anchor sitting exactly on the hour makes
  // `end === anchor` and silently drops the newest check — which is exactly
  // when a 10-minute cron fires.
  const end = Math.floor(anchor / BUCKET_MS) * BUCKET_MS + BUCKET_MS;
  const start = end - BUCKET_COUNT * BUCKET_MS;

  const buckets: UptimeBucket[] = Array.from(
    { length: BUCKET_COUNT },
    (_, i) => ({
      state: "none" as BucketState,
      up: 0,
      total: 0,
      start: start + i * BUCKET_MS,
      end: start + (i + 1) * BUCKET_MS,
    }),
  );

  const latencies: number[] = [];
  let total = 0;
  let upCount = 0;

  for (const c of checks) {
    const ts = Date.parse(c.at);
    if (!Number.isFinite(ts) || ts < start || ts >= end) continue; // drops stale/overflow
    const b = buckets[Math.floor((ts - start) / BUCKET_MS)];
    b.total++;
    total++;
    if (c.up) {
      b.up++;
      upCount++;
    }
    if (typeof c.latencyMs === "number" && c.latencyMs >= 0) {
      latencies.push(c.latencyMs);
    }
  }

  for (const b of buckets) {
    b.state =
      b.total === 0
        ? "none"
        : b.up === b.total
          ? "up"
          : b.up === 0
            ? "down"
            : "mixed";
  }

  latencies.sort((a, b) => a - b);
  const medianLatencyMs = latencies.length
    ? Math.round(latencies[Math.floor(latencies.length / 2)])
    : null;

  return {
    buckets,
    total,
    upCount,
    downCount: total - upCount,
    uptimePct: total === 0 ? null : Math.round((upCount / total) * 1000) / 10,
    medianLatencyMs,
  };
}
