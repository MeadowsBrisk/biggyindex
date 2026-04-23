"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useState, useEffect } from "react";
import {
  isHydratedAtom,
  clientReadyAtom,
  gateCompleteAtom,
} from "@/store/atoms";

/**
 * Full-page overlay that masks layout shifts during hydration.
 *
 * Covers the page with a solid background while:
 * 1. atomWithStorage atoms hydrate from localStorage
 * 2. DataLoader populates item data
 * 3. UrlSync applies URL filter params
 *
 * Shows a simple spinner while loading,
 * then fades out once everything is ready.
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

  // Start fade-out only when isHydrated is stably true.
  // If isHydrated bounces true→false→true, cleanup cancels the pending timer.
  // Brief settling delay for derived atoms (sorted/filtered) to recompute.
  useEffect(() => {
    if (!isHydrated) return;
    const timer = setTimeout(() => setPhase("fading"), 60);
    return () => clearTimeout(timer);
  }, [isHydrated]);

  useEffect(() => {
    if (phase === "fading") {
      const timer = setTimeout(() => {
        setPhase("done");
        setGateComplete(true);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [phase, setGateComplete]);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--background)]"
      style={{
        opacity: phase === "fading" ? 0 : 1,
        transition: phase === "fading" ? "opacity 350ms ease-out" : "none",
        pointerEvents: phase === "fading" ? "none" : "auto",
      }}
      aria-hidden="true"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--foreground)]" />
    </div>
  );
}
