"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the `prefers-reduced-motion: reduce` media query.
 * Drop-in replacement for framer-motion's useReducedMotion —
 * SSR-safe (returns false until mounted).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const handler = (event: MediaQueryListEvent) =>
      setReduceMotion(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduceMotion;
}
