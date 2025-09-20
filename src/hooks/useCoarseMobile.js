"use client";
import { useEffect, useState } from 'react';

// Detect mobile UI intent via input characteristics, independent of layout viewport width
export function useCoarseMobile() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const test = () => {
      const coarseM = window.matchMedia('(pointer:coarse)');
      const hoverNone = window.matchMedia('(hover: none)');
      const narrow = window.innerWidth <= 1024; // allow some wider layout widths still treated as mobile
      setCoarse((coarseM?.matches || hoverNone?.matches) && narrow);
    };
    test();
    window.addEventListener('resize', test, { passive: true });
    const coarseM = window.matchMedia('(pointer:coarse)');
    const hoverNone = window.matchMedia('(hover: none)');
    coarseM?.addEventListener?.('change', test);
    hoverNone?.addEventListener?.('change', test);
    return () => {
      window.removeEventListener('resize', test);
      coarseM?.removeEventListener?.('change', test);
      hoverNone?.removeEventListener?.('change', test);
    };
  }, []);
  return coarse;
}

