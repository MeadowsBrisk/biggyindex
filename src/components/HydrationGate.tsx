"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import {
  clientReadyAtom,
  gateCompleteAtom,
  isHydratedAtom,
} from "@/store/atoms";

/**
 * Hydration coordinator.
 *
 * The app now lets server-rendered seed content paint immediately. This small
 * coordinator still marks when atomWithStorage, DataLoader, and UrlSync have
 * settled so components can suppress layout-shifting transitions until then.
 *
 * NOTE: Do not gate this on per-component "settled" atoms (e.g. filter panel).
 * Doing so causes the gate spinner to re-appear on every toggle, which reads
 * to users as a full page refresh. Per-component layout shifts must be
 * suppressed locally (e.g. by gating their own CSS transitions on
 * `gateCompleteAtom` + a per-mount one-frame flag).
 */
export function HydrationGate() {
  const setClientReady = useSetAtom(clientReadyAtom);
  const setGateComplete = useSetAtom(gateCompleteAtom);
  const isHydrated = useAtomValue(isHydratedAtom);
  const ready = isHydrated;
  const [phase, setPhase] = useState<"loading" | "fading" | "done">("loading");

  // Signal that the client has mounted and atomWithStorage atoms have had one
  // animation frame to read from localStorage and trigger their re-renders.
  useEffect(() => {
    const id = requestAnimationFrame(() => setClientReady(true));
    return () => cancelAnimationFrame(id);
  }, [setClientReady]);

  // Start the fade only after data, URL filters, and persisted layout have settled.
  useEffect(() => {
    if (!ready) {
      setGateComplete(false);
      const id = requestAnimationFrame(() => setPhase("loading"));
      return () => cancelAnimationFrame(id);
    }

    const timer = setTimeout(() => setPhase("fading"), 60);
    return () => clearTimeout(timer);
  }, [ready, setGateComplete]);

  useEffect(() => {
    if (phase !== "fading") return;
    if (!ready) {
      return;
    }
    const timer = setTimeout(() => {
      setPhase("done");
      setGateComplete(true);
    }, 240);
    return () => clearTimeout(timer);
  }, [phase, ready, setGateComplete]);

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
