"use client";

import { useAtom, useAtomValue } from "jotai";
import { forceEnglishAtom, marketAtom } from "@/store/atoms";

const MARKET_LABEL: Record<string, string> = {
  DE: "DE",
  FR: "FR",
  PT: "PT",
  IT: "IT",
  ES: "ES",
  GR: "EL",
  CZ: "CS",
};

interface ShowOriginalToggleProps {
  /** Override market detection (useful for SSR-rendered pages) */
  market?: string;
  className?: string;
}

/**
 * Inline EN/locale toggle for item & seller detail views.
 * Only renders on non-GB markets. Persists via localStorage.
 */
export function ShowOriginalToggle({ market: marketProp, className = "" }: ShowOriginalToggleProps) {
  const [forceEnglish, setForceEnglish] = useAtom(forceEnglishAtom);
  const marketFromAtom = useAtomValue(marketAtom);
  const market = marketProp ?? marketFromAtom;

  if (!market || market === "GB") return null;

  const localeLabel = MARKET_LABEL[market] ?? market;
  const base = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase transition-colors cursor-pointer";
  const active = "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  const inactive = "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";

  return (
    <button
      type="button"
      onClick={() => setForceEnglish(!forceEnglish)}
      className={`${base} ${forceEnglish ? active : inactive} ${className}`}
      aria-label={
        forceEnglish
          ? `Showing English — switch to ${localeLabel}`
          : `Showing ${localeLabel} — switch to English`
      }
      aria-checked={forceEnglish}
      role="switch"
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          forceEnglish ? "bg-blue-500" : "bg-gray-400 dark:bg-gray-500"
        }`}
      />
      {forceEnglish ? "EN" : localeLabel}
    </button>
  );
}
