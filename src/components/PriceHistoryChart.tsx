"use client";

import { useId } from "react";
import type { PriceSnapshot } from "@/lib/types";

/**
 * Viewbox geometry per layout. The width/height only set the aspect ratio —
 * the SVG scales to 100% of its container (preserveAspectRatio meet), so
 * these are relative units, not pixels.
 */
const LAYOUT = {
  full: { w: 640, h: 190, padT: 16, padB: 14, padL: 10, padR: 10 },
  compact: { w: 520, h: 140, padT: 14, padB: 12, padL: 8, padR: 8 },
} as const;

interface PriceHistoryChartProps {
  /** Newest-last USD snapshots. Renders only at 2+ points (gated internally). */
  ph: PriceSnapshot[];
  /** Currency symbol for value labels/tooltips (e.g. "£"). */
  sym: string;
  /** USD → local conversion rate applied to every value. */
  rate: number;
  /** Accessible label for the chart region — already localized by the caller. */
  label: string;
  /** Denser layout for the modal overlay. */
  compact?: boolean;
}

/**
 * Pure-SVG price-history chart shared by the item page (a `'use cache'` Server
 * Component — this renders inside it as a client leaf with serializable props)
 * and the modal overlay. Draws the min-price line with a muted band up to the
 * max price, a subtle area fill and per-point hover tooltips. All colours come
 * from the site's CSS tokens so light/dark both work; nothing here reads the
 * clock, so it stays deterministic under the page's cache scope.
 */
export function PriceHistoryChart({
  ph,
  sym,
  rate,
  label,
  compact = false,
}: PriceHistoryChartProps) {
  // Unique gradient id so page + modal charts never collide in one document.
  const gradientId = useId().replace(/:/g, "");

  // Ascending, finite, timestamp-deduped (keep the latest same-day snapshot so
  // two changes on one day don't stack into a zero-width segment).
  const parsed = (ph ?? [])
    .map((p) => ({
      t: new Date(p.d).getTime(),
      min: p.min,
      max: p.max,
      d: p.d,
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  const points: typeof parsed = [];
  for (const p of parsed) {
    if (points.length && points[points.length - 1].t === p.t) {
      points[points.length - 1] = p;
    } else {
      points.push(p);
    }
  }

  if (points.length < 2) return null;

  const L = compact ? LAYOUT.compact : LAYOUT.full;
  const plotW = L.w - L.padL - L.padR;
  const plotH = L.h - L.padT - L.padB;
  const baseY = L.padT + plotH;

  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const tSpan = tMax - tMin || 1;

  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.min < lo) lo = p.min;
    if (p.max > hi) hi = p.max;
  }
  // Pad the value range so the lines never sit flush against the edges.
  const vPad = (hi - lo) * 0.14 || hi * 0.1 || 1;
  const vLo = lo - vPad;
  const vHi = hi + vPad;
  const vSpan = vHi - vLo || 1;

  const px = (t: number) => L.padL + ((t - tMin) / tSpan) * plotW;
  const py = (v: number) => L.padT + (1 - (v - vLo) / vSpan) * plotH;

  const diverges = points.some((p) => p.max > p.min);

  const line = (key: "min" | "max") =>
    points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${px(p.t).toFixed(1)} ${py(p[key]).toFixed(1)}`,
      )
      .join(" ");

  const minLine = line("min");
  const maxLine = line("max");
  // Area under the min line — a soft body for the chart, gradient-filled.
  const areaFill = `${minLine} L${px(tMax).toFixed(1)} ${baseY.toFixed(1)} L${px(tMin).toFixed(1)} ${baseY.toFixed(1)} Z`;
  // Band between min and max (only when they diverge): max forward, min back.
  const bandFill = diverges
    ? `${maxLine} ${points
        .slice()
        .reverse()
        .map((p) => `L${px(p.t).toFixed(1)} ${py(p.min).toFixed(1)}`)
        .join(" ")} Z`
    : null;

  const money = (usd: number) => `${sym}${(usd * rate).toFixed(2)}`;
  const dateShort = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const dateFull = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure
      className={`phc${compact ? " phc--compact" : ""}`}
      aria-label={label}
    >
      <div className="phc__plot">
        <svg
          className="phc__svg"
          viewBox={`0 0 ${L.w} ${L.h}`}
          role="img"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
              <stop
                offset="100%"
                stopColor="var(--primary)"
                stopOpacity="0.01"
              />
            </linearGradient>
          </defs>

          {/* Baseline hint */}
          <line
            className="phc__axis"
            x1={L.padL}
            y1={baseY}
            x2={L.w - L.padR}
            y2={baseY}
          />

          <path
            className="phc__area"
            d={areaFill}
            fill={`url(#${gradientId})`}
          />
          {bandFill && <path className="phc__band" d={bandFill} />}
          {bandFill && <path className="phc__maxline" d={maxLine} />}
          <path className="phc__line" d={minLine} />

          {points.map((p) => (
            <circle
              key={p.d}
              className="phc__dot"
              cx={px(p.t)}
              cy={py(p.min)}
              r={compact ? 3 : 3.5}
            >
              <title>
                {`${dateFull(p.d)} · ${
                  p.max > p.min
                    ? `${money(p.min)} – ${money(p.max)}`
                    : money(p.min)
                }`}
              </title>
            </circle>
          ))}
        </svg>

        {/* Crisp HTML value labels overlaid on the plot (SVG text would blur
            when the chart scales). */}
        <span className="phc__vlabel phc__vlabel--hi">{money(hi)}</span>
        <span className="phc__vlabel phc__vlabel--lo">{money(lo)}</span>
      </div>

      <figcaption className="phc__axis-row">
        <time dateTime={first.d}>{dateShort(first.d)}</time>
        <time dateTime={last.d}>{dateShort(last.d)}</time>
      </figcaption>
    </figure>
  );
}
