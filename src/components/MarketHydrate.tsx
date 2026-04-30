"use client";

import { useHydrateAtoms } from "jotai/utils";
import { marketAtom } from "@/store/atoms";

/**
 * Seeds `marketAtom` from the SSR-derived host market BEFORE first render.
 *
 * `useHydrateAtoms` runs synchronously inside the JotaiProvider scope
 * during the first render of this component, so by the time any consumer
 * (SiteHeader's MarketDropdown, ItemGrid currency formatter, etc.) reads
 * the atom, it already reflects the current host. No flash of the GB
 * default.
 *
 * The `market` prop is passed from `[locale]/layout.tsx`, which derives
 * it from the request locale (which proxy.ts pins per-host). Cross-origin
 * navigation = new request = new layout render = fresh hydration → the
 * atom is always correct for the current host. No persistence needed.
 *
 * Renders nothing.
 */
export function MarketHydrate({ market }: { market: string }) {
  useHydrateAtoms([[marketAtom, market]]);
  return null;
}
