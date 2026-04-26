"use client";

import { useEffect, useRef, useState } from "react";
import { observe, unobserve } from "@/lib/sharedObserver";

/**
 * Triggers a CSS entry animation when the element scrolls into view.
 *
 * Cards already in the viewport at mount are marked as "initial" — they
 * appear instantly (no slide-up). Cards revealed by scrolling get the
 * full fade-in-up animation via the `scrollReveal` flag.
 *
 * Uses a singleton IntersectionObserver shared across all cards.
 */
export function useEntryAnimation() {
  const ref = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const [scrollReveal, setScrollReveal] = useState(false);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rafId = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (
        rect.top < window.innerHeight + 60 &&
        rect.bottom > -60 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      ) {
        // Already in viewport — appear instantly, no animation
        setEntered(true);
        setAnimDone(true);
        return;
      }

      // Off-screen — mark for scroll-reveal animation
      setScrollReveal(true);
      observe(el, () => setEntered(true));
    });

    return () => {
      cancelAnimationFrame(rafId);
      unobserve(el);
    };
  }, []);

  useEffect(() => {
    if (!entered || animDone) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setAnimDone(true), prefersReduced ? 0 : 600);
    return () => clearTimeout(timer);
  }, [entered, animDone]);

  return { ref, entered, scrollReveal, animDone };
}
