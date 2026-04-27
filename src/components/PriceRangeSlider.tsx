"use client";

import { useAtom, useAtomValue } from "jotai";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  currencyDisplayAtom,
  priceBoundsAtom,
  priceRangeAtom,
} from "@/store/atoms";

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
  const bounds = useAtomValue(priceBoundsAtom);
  const { symbol, rate } = useAtomValue(currencyDisplayAtom);
  const t = useTranslations("browse.priceRange");

  // Don't render if we have no price data
  if (bounds.max <= 0) return null;

  const absMin = bounds.min;
  const absMax = bounds.max;

  // Current values clamped to bounds
  const curMin =
    priceRange.min <= 0 ? absMin : Math.max(priceRange.min, absMin);
  const curMax =
    priceRange.max >= Infinity ? absMax : Math.min(priceRange.max, absMax);

  const isActive = priceRange.min > 0 || priceRange.max < Infinity;

  const toDisplay = (usd: number) => Math.round(usd * rate);
  const toUsd = (display: number) => display / rate;

  const displayMin = toDisplay(absMin);
  const displayMax = toDisplay(absMax);

  return (
    // px-2 reserves 8px on each side so the thumbs (which use -translate-x-1/2
    // and hang half-width past the track edges) aren't sheared off by the
    // parent Section's overflow-hidden clip.
    <div className="mb-4 px-2">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          {t("title")}
        </h3>
        {isActive && (
          <button
            type="button"
            onClick={() => {
              setPriceRange({ min: 0, max: Infinity });
              onFilterChange?.();
            }}
            className="p-0.5 rounded text-muted/40 hover:text-muted transition-colors cursor-pointer"
            title={t("reset")}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      <DualSlider
        absMin={absMin}
        absMax={absMax}
        curMin={curMin}
        curMax={curMax}
        onCommit={onFilterChange}
        onChange={(min, max) => {
          setPriceRange({
            min: min <= absMin ? 0 : min,
            max: max >= absMax ? Infinity : max,
          });
        }}
      />

      {/* Min / Max inputs */}
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <PriceInput
          value={toDisplay(curMin)}
          min={displayMin}
          max={toDisplay(curMax)}
          symbol={symbol}
          onChange={(v) => {
            const usd = toUsd(v);
            setPriceRange((prev) => ({
              ...prev,
              min:
                usd <= absMin
                  ? 0
                  : Math.min(usd, prev.max === Infinity ? absMax : prev.max),
            }));
            onFilterChange?.();
          }}
        />
        <span className="text-muted">—</span>
        <PriceInput
          value={toDisplay(curMax)}
          min={toDisplay(curMin)}
          max={displayMax}
          symbol={symbol}
          onChange={(v) => {
            const usd = toUsd(v);
            setPriceRange((prev) => ({
              ...prev,
              max: usd >= absMax ? Infinity : Math.max(usd, prev.min),
            }));
            onFilterChange?.();
          }}
        />
      </div>
    </div>
  );
}

// ── Dual-thumb slider ──────────────────────────────────────────

function DualSlider({
  absMin,
  absMax,
  curMin,
  curMax,
  onChange,
  onCommit,
}: {
  absMin: number;
  absMax: number;
  curMin: number;
  curMax: number;
  onChange: (min: number, max: number) => void;
  onCommit?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("browse.priceRange");

  const pct = (val: number) =>
    absMax === absMin ? 0 : ((val - absMin) / (absMax - absMin)) * 100;

  const valFromPct = useCallback(
    (p: number) => Math.round(absMin + (p / 100) * (absMax - absMin)),
    [absMin, absMax],
  );

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

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const p = getPointerPct(e);
      const v = valFromPct(p);
      if (dragging.current === "min") {
        onChange(Math.min(v, curMax), curMax);
      } else {
        onChange(curMin, Math.max(v, curMin));
      }
    },
    [getPointerPct, onChange, curMin, curMax, valFromPct],
  );

  const onPointerUp = useCallback(() => {
    if (dragging.current) onCommit?.();
    dragging.current = null;
  }, [onCommit]);

  const leftPct = pct(curMin);
  const rightPct = pct(curMax);

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
        aria-valuemin={absMin}
        aria-valuemax={absMax}
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
        aria-valuemin={absMin}
        aria-valuemax={absMax}
        aria-valuenow={curMax}
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
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  symbol: string;
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
    <div className="flex items-center gap-0.5 rounded-md border border-border px-2 py-1 focus-within:border-primary transition-colors">
      <span className="text-muted text-[10px]">{symbol}</span>
      <input
        type="text"
        inputMode="numeric"
        className="w-12 bg-transparent text-[11px] text-foreground outline-none"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}
