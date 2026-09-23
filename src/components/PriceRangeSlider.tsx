"use client";

import { useAtom, useAtomValue } from "jotai";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { FilterChip, SubLabel } from "@/components/filters/primitives";
import {
  currencyDisplayAtom,
  type DisplayCurrency,
  displayCurrencyAtom,
  filteredItemsAtom,
  priceKnotsAtom,
  priceRangeAtom,
} from "@/store/atoms";

const PRESET_THRESHOLDS: Record<DisplayCurrency, readonly number[]> = {
  GBP: [20, 50, 100, 200],
  EUR: [25, 50, 100, 200],
  USD: [25, 50, 100, 200],
  PLN: [100, 250, 500, 1000],
  CZK: [500, 1250, 2500, 5000],
};

/**
 * Dual-thumb price range slider for the filter panel.
 *
 * Internally filters on USD (storage unit).
 * Displays values in the user's chosen display currency.
 */
export function PriceRangeSlider({
  onFilterChange,
}: {
  onFilterChange?: () => void;
} = {}) {
  const [priceRange, setPriceRange] = useAtom(priceRangeAtom);
  const knots = useAtomValue(priceKnotsAtom);
  const matches = useAtomValue(filteredItemsAtom).length;
  const { symbol, rate } = useAtomValue(currencyDisplayAtom);
  const currency = useAtomValue(displayCurrencyAtom);
  const t = useTranslations("browse.priceRange");

  if (knots.length < 2) return null;

  const absMin = knots[0];
  const trackMax = knots[knots.length - 1];

  const curMin =
    priceRange.min <= 0 ? absMin : Math.max(priceRange.min, absMin);
  const curMax = priceRange.max;
  const openEnded = curMax === Infinity;

  const toDisplay = (usd: number) => Math.round(usd * rate);
  const toUsd = (display: number) => display / rate;

  const thresholds = PRESET_THRESHOLDS[currency];
  const fmt = (display: number) => `${symbol}${display}`;
  // Within half a dollar of the converted edge: pmin/pmax are whole USD, so a
  // one-step slider move always falls outside it.
  const edgeMatches = (usd: number, display: number) =>
    display === 0
      ? usd <= 0
      : display === Infinity
        ? usd === Infinity
        : Math.abs(usd - display / rate) <= 0.5;
  const presets = [0, ...thresholds].map((lo, index) => {
    const hi = thresholds[index] ?? Infinity;
    return {
      lo,
      hi,
      label:
        lo === 0
          ? t("presets.under", { max: fmt(hi) })
          : hi === Infinity
            ? t("presets.over", { min: fmt(lo) })
            : t("presets.between", { min: fmt(lo), max: fmt(hi) }),
      active:
        edgeMatches(priceRange.min, lo) && edgeMatches(priceRange.max, hi),
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <SubLabel>{t("presets.label")}</SubLabel>
        <fieldset
          aria-label={t("presets.label")}
          className="flex min-w-0 flex-wrap gap-1.5"
        >
          {presets.map((preset) => (
            <FilterChip
              key={preset.lo}
              tone={preset.active ? "selected" : "neutral"}
              pressed={preset.active}
              onClick={() => {
                setPriceRange(
                  preset.active
                    ? { min: 0, max: Infinity }
                    : {
                        min: preset.lo === 0 ? 0 : Math.round(preset.lo / rate),
                        max:
                          preset.hi === Infinity
                            ? Infinity
                            : Math.round(preset.hi / rate),
                      },
                );
                onFilterChange?.();
              }}
            >
              {preset.label}
            </FilterChip>
          ))}
        </fieldset>
      </div>

      <div>
        <SubLabel>{t("custom")}</SubLabel>
        {/* px-2 keeps the thumbs, which hang half-width past the track ends, inside the Section's overflow clip. */}
        <div className="px-2">
          <DualSlider
            knots={knots}
            curMin={curMin}
            curMax={curMax}
            openEndedLabel={`${fmt(toDisplay(trackMax))}+`}
            onCommit={onFilterChange}
            onChange={(min, max) => {
              setPriceRange({ min: min <= absMin ? 0 : min, max });
            }}
          />
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs">
          <PriceInput
            value={toDisplay(curMin)}
            min={toDisplay(absMin)}
            max={openEnded ? Number.MAX_SAFE_INTEGER : toDisplay(curMax)}
            symbol={symbol}
            onChange={(v) => {
              const usd = toUsd(v);
              setPriceRange((prev) => ({
                ...prev,
                min:
                  usd <= absMin
                    ? 0
                    : prev.max === Infinity
                      ? usd
                      : Math.min(usd, prev.max),
              }));
              onFilterChange?.();
            }}
          />
          <span className="text-muted">—</span>
          <PriceInput
            value={toDisplay(openEnded ? trackMax : curMax)}
            min={toDisplay(curMin)}
            max={Number.MAX_SAFE_INTEGER}
            symbol={symbol}
            suffix={openEnded ? "+" : undefined}
            onChange={(v) => {
              const usd = toUsd(v);
              setPriceRange((prev) => ({
                ...prev,
                max: usd >= trackMax ? Infinity : Math.max(usd, prev.min),
              }));
              onFilterChange?.();
            }}
          />
          <span className="ml-auto opacity-60 tabular-nums">
            {t("matches", { count: matches })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Dual-thumb slider ──────────────────────────────────────────

// Piecewise-linear track over the price percentiles: each knot gap gets an equal share, the final share is "and up".
function knotScale(knots: number[]) {
  const segments = knots.length;
  const lastPct = ((segments - 1) / segments) * 100;
  const pct = (value: number) => {
    if (value === Infinity) return 100;
    if (value >= knots[segments - 1]) return lastPct;
    if (value <= knots[0]) return 0;
    let index = 0;
    while (knots[index + 1] < value) index++;
    const span = knots[index + 1] - knots[index];
    return ((index + (value - knots[index]) / span) / segments) * 100;
  };
  const value = (p: number, openEnd: boolean) => {
    if (p >= lastPct) return openEnd ? Infinity : knots[segments - 1];
    if (p <= 0) return knots[0];
    const position = (p / 100) * segments;
    const index = Math.min(segments - 2, Math.floor(position));
    return Math.round(
      knots[index] + (position - index) * (knots[index + 1] - knots[index]),
    );
  };
  return { pct, value, lastPct };
}

function DualSlider({
  knots,
  curMin,
  curMax,
  openEndedLabel,
  onChange,
  onCommit,
}: {
  knots: number[];
  curMin: number;
  curMax: number;
  openEndedLabel: string;
  onChange: (min: number, max: number) => void;
  onCommit?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("browse.priceRange");
  const scale = knotScale(knots);
  const trackMax = knots[knots.length - 1];

  const getPointerPct = useCallback((e: React.PointerEvent | PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(
      0,
      Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
    );
  }, []);

  const dragging = useRef<"min" | "max" | null>(null);

  const onPointerDown = useCallback(
    (thumb: "min" | "max") => (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = thumb;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const p = getPointerPct(e);
    if (dragging.current === "min") {
      const v = scale.value(p, false);
      onChange(Math.min(v, curMax === Infinity ? v : curMax), curMax);
    } else {
      const v = scale.value(p, true);
      onChange(curMin, v === Infinity ? v : Math.max(v, curMin));
    }
  };

  const onPointerUp = useCallback(() => {
    if (dragging.current) onCommit?.();
    dragging.current = null;
  }, [onCommit]);

  const leftPct = scale.pct(curMin);
  const rightPct = scale.pct(curMax);

  return (
    <div
      ref={trackRef}
      className="relative h-6 flex items-center select-none touch-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Track background */}
      <div className="absolute inset-x-0 h-1 rounded-full bg-border" />

      {/* Active range */}
      <div
        className="absolute h-1 rounded-full bg-primary"
        style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
      />

      {/* Min thumb */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background shadow cursor-grab active:cursor-grabbing z-10"
        style={{ left: `${leftPct}%` }}
        onPointerDown={onPointerDown("min")}
        role="slider"
        aria-label={t("minimum")}
        aria-valuemin={knots[0]}
        aria-valuemax={trackMax}
        aria-valuenow={curMin}
        tabIndex={0}
      />

      {/* Max thumb */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background shadow cursor-grab active:cursor-grabbing z-10"
        style={{ left: `${rightPct}%` }}
        onPointerDown={onPointerDown("max")}
        role="slider"
        aria-label={t("maximum")}
        aria-valuemin={knots[0]}
        aria-valuemax={trackMax}
        aria-valuenow={curMax === Infinity ? trackMax : curMax}
        aria-valuetext={curMax === Infinity ? openEndedLabel : undefined}
        tabIndex={0}
      />
    </div>
  );
}

// ── Numeric input ──────────────────────────────────────────────

function PriceInput({
  value,
  min,
  max,
  symbol,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  symbol: string;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));

  // Sync from parent
  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = () => {
    const n = Number.parseInt(local, 10);
    if (Number.isFinite(n)) {
      onChange(Math.max(min, Math.min(max, n)));
    } else {
      setLocal(String(value));
    }
  };

  return (
    <div className="flex h-7 items-center gap-0.5 rounded-md border border-border px-2 focus-within:border-primary transition-colors">
      <span className="text-muted">{symbol}</span>
      <input
        type="text"
        inputMode="numeric"
        className="w-12 bg-transparent text-xs text-foreground outline-none"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {suffix && <span className="text-muted">{suffix}</span>}
    </div>
  );
}
