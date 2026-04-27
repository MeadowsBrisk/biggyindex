"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import {
  clientReadyAtom,
  gateCompleteAtom,
  isHydratedAtom,
} from "@/store/atoms";

/**
 * Hydration coordinator — for the *initial* boot only.
 *
 * Once the gate has faded out it stays gone for the rest of the session.
 * This is critical: `isHydratedAtom` flips back to `false` momentarily on
 * every navigation to a page with a `DataLoader` (DataLoader resets
 * `urlSyncDoneAtom` to `false` on mount). Re-showing the spinner there
 * would (a) flash a full-screen overlay over every navigation, and (b)
 * get *stuck* forever if `UrlSync.hydratedRef` is preserved across the
 * cached nav and never re-fires `setUrlSyncDone(true)` — exactly the
 * "infinite loader on returning to /browse" bug.
 *
 * NOTE: Do not gate this on per-component "settled" atoms (e.g. filter
 * panel). Per-component layout shifts must be suppressed locally (e.g.
 * by gating their own CSS transitions on `gateCompleteAtom` + a
 * per-mount one-frame flag).
 */
export function HydrationGate() {
  const setClientReady = useSetAtom(clientReadyAtom);
  const setGateComplete = useSetAtom(gateCompleteAtom);
  const isHydrated = useAtomValue(isHydratedAtom);
  const [phase, setPhase] = useState<"loading" | "fading" | "done">("loading");

  // Signal that the client has mounted and atomWithStorage atoms have had one
  // animation frame to read from localStorage and trigger their re-renders.
  useEffect(() => {
    const id = requestAnimationFrame(() => setClientReady(true));
    return () => cancelAnimationFrame(id);
  }, [setClientReady]);

  // Forward-only state machine: loading → fading → done. We only react to
  // `isHydrated` while still in the "loading" phase. Once we leave "loading"
  // we never re-enter it, so a later `isHydrated → false` cannot bring the
  // spinner back.
  useEffect(() => {
    if (phase !== "loading" || !isHydrated) return;
    const timer = setTimeout(() => setPhase("fading"), 60);
    return () => clearTimeout(timer);
  }, [phase, isHydrated]);

  useEffect(() => {
    if (phase !== "fading") return;
    const timer = setTimeout(() => {
      setPhase("done");
      setGateComplete(true);
    }, 240);
    return () => clearTimeout(timer);
  }, [phase, setGateComplete]);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-background"
      style={{
        opacity: phase === "fading" ? 0 : 1,
        transition: phase === "fading" ? "opacity 240ms ease-out" : "none",
        pointerEvents: phase === "fading" ? "none" : "auto",
      }}
      aria-hidden="true"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  );
}
