"use client";
import { useEffect, useRef, useState } from 'react';

export interface NarrowLayoutState {
  narrow: boolean;
  width: number;
  ready: boolean;
}

/**
 * Hook to detect narrow (mobile) layout.
 * Optimized: single immediate measurement + rAF-throttled resize handler to reduce layout thrash.
 */
export function useNarrowLayout(): NarrowLayoutState {
  const [state, setState] = useState<NarrowLayoutState>({ narrow: false, width: 0, ready: false });
  const frameRef = useRef<number>(0);
  const last = useRef<NarrowLayoutState>({ narrow: false, width: 0, ready: false });
  const pendingResize = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const measure = (markReady = false) => {
      const vv = window.visualViewport?.width;
      const w = Math.min(window.innerWidth, vv || window.innerWidth);
      const narrow = w <= 1023;
      const next: NarrowLayoutState = { narrow, width: w, ready: markReady || state.ready };
      
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
    window.visualViewport?.addEventListener('resize', onResize, { passive: true });

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
