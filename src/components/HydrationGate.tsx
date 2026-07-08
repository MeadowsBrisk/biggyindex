"use client";

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { clientReadyAtom, gateCompleteAtom } from "@/store/atoms";

/**
 * Hydration coordinator — renders NOTHING.
 *
 * This used to SSR a full-viewport opaque veil into every page's initial
 * HTML and hold it until the entire /api/browse dataset had downloaded and
 * parsed — which made first paint a spinner on every page and pushed mobile
 * LCP past 20s on /browse. The veil is gone: first paint is now the real
 * server-rendered content (browse shows its SSR seed grid until live data
 * swaps in — the swap is dimension-stable, see ItemGrid).
 *
 * What remains is the timing signal other components rely on:
 *
 * - `clientReadyAtom` — true one animation frame after mount, giving
 *   atomWithStorage atoms a frame to read localStorage and re-render.
 * - `gateCompleteAtom` — true one frame later. Consumers (FilterPanel,
 *   and anything else suppressing CSS transitions on first paint) use it
 *   to distinguish "initial boot snap" from real user interaction. It is
 *   derived from client hydration ONLY — never from data loading.
 *
 * Both are forward-only: they flip true once per session and never reset,
 * so client-side navigations can't re-trigger boot suppression logic.
 */
export function HydrationGate() {
  const setClientReady = useSetAtom(clientReadyAtom);
  const setGateComplete = useSetAtom(gateCompleteAtom);

  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      setClientReady(true);
      second = requestAnimationFrame(() => setGateComplete(true));
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [setClientReady, setGateComplete]);

  return null;
}
