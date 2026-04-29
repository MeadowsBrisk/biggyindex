"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Refreshes the current route when the user returns to a tab that's been
 * hidden longer than `STALE_AFTER_MS` — without a full page reload.
 *
 * Why: Next.js 16's client-side segment cache (enabled via
 * `experimental.cachedNavigations: true` in next.config.ts) keeps the
 * already-rendered RSC payload in memory across same-session navigations.
 * That's great for snappy back/forward, but it means a user who left the
 * tab open while the crawler ran a fresh index will see stale data on
 * return — until they hard-refresh. The crawler revalidates the *server*
 * cache via /api/revalidate after every run, but the client never fetches
 * the new payload until something prompts it.
 *
 * `router.refresh()` re-fetches the current route's RSC and re-renders
 * with the new data, no flash, no full reload, atoms preserved.
 *
 * Triggers:
 *   - `visibilitychange` to "visible" after the tab was hidden long enough
 *   - `pageshow` with `event.persisted` (bfcache restore — same idea)
 *
 * Renders nothing.
 */

const STALE_AFTER_MS = 2 * 60 * 1000; // 2 minutes — well below the 30-min crawler cadence

export function RouterRefreshOnReturn() {
  const router = useRouter();
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      // visible
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt == null) return;
      const elapsed = Date.now() - hiddenAt;
      if (elapsed >= STALE_AFTER_MS) {
        router.refresh();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      // bfcache restore — equivalent to "tab returned"; refresh defensively
      // so frozen React state from the cached page picks up newer RSC.
      if (event.persisted) {
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
