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
 * Deep-scroll guard: a refresh that lands new data while the user is reading
 * far down the /browse grid re-fetches the browse RSC; if the crawler ran
 * meanwhile, DataLoader swaps in a new item array and the default "hottest"
 * sort can reshuffle under the reader's viewport. On mobile every
 * app-switch / screen-lock fires `visibilitychange`, so a deep reader was
 * getting the rug pulled out repeatedly ("the list refreshes every time I
 * scroll"). So when the tab returns while scrolled past `SCROLL_DEFER_PX`, we
 * DON'T refresh immediately — we defer it until the reader scrolls back near
 * the top (where a reshuffle is expected and harmless), or until the next full
 * navigation refreshes anyway. Near-top readers keep the original snappy
 * freshness behavior. (ItemGrid separately preserves scroll depth even if a
 * refresh does land, so this is belt-and-braces against reshuffle churn.)
 *
 * Renders nothing.
 */

const STALE_AFTER_MS = 2 * 60 * 1000; // 2 minutes — well below the 30-min crawler cadence
const SCROLL_DEFER_PX = 600; // past this, defer the refresh rather than disrupt the reader

export function RouterRefreshOnReturn() {
  const router = useRouter();
  const hiddenAtRef = useRef<number | null>(null);
  // Set when a return-refresh was deferred because the reader was scrolled
  // deep; a scroll listener flushes it once they're back near the top.
  const pendingRefreshRef = useRef(false);

  useEffect(() => {
    // Run the refresh now if the reader is near the top, otherwise defer it
    // until they scroll back up (armed via the scroll listener below).
    const refreshOrDefer = () => {
      if (window.scrollY > SCROLL_DEFER_PX) {
        pendingRefreshRef.current = true;
        return;
      }
      pendingRefreshRef.current = false;
      router.refresh();
    };

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
        refreshOrDefer();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      // bfcache restore — equivalent to "tab returned"; refresh defensively
      // so frozen React state from the cached page picks up newer RSC.
      if (event.persisted) {
        refreshOrDefer();
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (!pendingRefreshRef.current || ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        if (pendingRefreshRef.current && window.scrollY <= SCROLL_DEFER_PX) {
          pendingRefreshRef.current = false;
          router.refresh();
        }
      });
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("scroll", onScroll);
    };
  }, [router]);

  return null;
}
