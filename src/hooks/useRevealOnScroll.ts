"use client";

import { useEffect, useRef, useState } from "react";
import { observe, unobserve } from "@/lib/sharedObserver";

/**
 * Once-only scroll reveal — CSS replacement for framer-motion's
 * `whileInView` + `viewport={{ once: true }}` pattern.
 *
 * Pair with the `.reveal-fade` class (styles/elements/reveal.css):
 *
 *   const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
 *   <div ref={ref} className="reveal-fade" data-revealed={revealed} />
 *
 * Uses the shared IntersectionObserver singleton, so any number of
 * sections cost one observer total.
 */
export function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    observe(el, () => setRevealed(true));
    return () => unobserve(el);
  }, []);

  return { ref, revealed };
}
