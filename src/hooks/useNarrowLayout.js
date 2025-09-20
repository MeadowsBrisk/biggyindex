"use client";
import { useEffect, useRef, useState } from 'react';

// Returns { narrow: boolean, width: number, ready: boolean }
// Optimized: single immediate measurement + rAF-throttled resize handler to reduce layout thrash.
export function useNarrowLayout() {
  const [state, setState] = useState({ narrow: false, width: 0, ready: false });
  const frameRef = useRef(0);
  const last = useRef({ narrow: false, width: 0, ready: false });
  const pendingResize = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const measure = (markReady = false) => {
      const vv = window.visualViewport?.width;
      const w = Math.min(window.innerWidth, vv || window.innerWidth);
      const narrow = w <= 1023;
      const next = { narrow, width: w, ready: markReady ? true : state.ready || markReady };
      // Only update if something changed (prevents extra renders during rapid resizes)
      if (last.current.narrow !== next.narrow || last.current.width !== next.width || last.current.ready !== next.ready) {
        last.current = next;
        setState(next);
      }
    };

    // Initial synchronous measure (mark ready immediately to avoid layout jump)
    measure(true);

    const onResize = () => {
      if (pendingResize.current) return;
      pendingResize.current = true;
      frameRef.current = requestAnimationFrame(() => {
        pendingResize.current = false;
        measure(true);
      });
    };

    window.addEventListener('resize', onResize, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize, { passive: true });

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', onResize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
