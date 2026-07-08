"use client";

import { useSearchParams } from "next/navigation";
import { useLayoutEffect } from "react";
import { computeSeedFlags } from "@/lib/seedFlags";

/**
 * Client-navigation counterpart of SeedParamsScript (see that file for the
 * full story). The layout's inline script only runs on hard loads — React
 * never executes inline scripts (re-)rendered during client-side navigation
 * — so this component makes browse-page correctness deterministic on client
 * navs: it recomputes the exact same flags (shared `computeSeedFlags`) in a
 * layout effect on mount and whenever the search params change, before the
 * seed/skeleton grids paint.
 *
 * Mounted on the browse page inside the existing <Suspense> boundary
 * (useSearchParams requires one under cacheComponents prerendering).
 */
export function SeedParamsSync() {
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useLayoutEffect(() => {
    try {
      const flags = computeSeedFlags(search);
      const html = document.documentElement;
      html.classList.toggle("bi-seed-hide", flags.hide);
      html.classList.toggle("bi-cols-2", flags.cols2);
    } catch {
      // localStorage unavailable (private mode etc.) — defaults are fine
    }
  }, [search]);

  return null;
}
