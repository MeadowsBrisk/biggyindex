"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Refreshes the current route when the user returns to a tab that has been
 * hidden longer than `STALE_AFTER_MS`, without a full page reload.
 *
 * Why: the client-side segment cache (`experimental.cachedNavigations` in
 * next.config.ts) keeps the rendered RSC payload in memory across same-session
 * navigations. The crawler revalidates the *server* cache via /api/revalidate
 * after each run, but a client with the tab left open never re-fetches the new
 * payload unless something prompts it. `router.refresh()` re-fetches this route's RSC and
 * re-renders with fresh data — no flash, no reload, atoms preserved.
 *
 * Triggers: `visibilitychange` to "visible" after a long-enough hide, and
 * `pageshow` with `event.persisted` (bfcache restore).
 *
 * Deep-scroll guard: a refresh can swap in a new item array, and the default
 * "hottest" sort then reshuffles under the reader's viewport. On mobile every
 * app-switch and screen-lock fires `visibilitychange`, so an unguarded refresh
 * pulls the rug out repeatedly. Past `SCROLL_DEFER_PX` the refresh is deferred
 * until the reader scrolls back near the top (where a reshuffle is expected)
 * or the next navigation refreshes anyway; near-top readers refresh at once.
 * ItemGrid separately preserves scroll depth if a refresh does land, so this
 * guard is belt-and-braces.
 *
 * Renders nothing.
 */

const STALE_AFTER_MS = 2 * 60 * 1000; // well below the crawler's index cadence
const SCROLL_DEFER_PX = 600; // past this, defer the refresh rather than disrupt the reader

export function RouterRefreshOnReturn() {
  const router = useRouter();
  const hiddenAtRef = useRef<number | null>(null);
  // Set when a return-refresh is deferred because the reader is scrolled
  // deep; the scroll listener flushes it once they are back near the top.
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
      // bfcache restore is equivalent to "tab returned": refresh so the
      // frozen React state from the cached page picks up newer RSC.
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
