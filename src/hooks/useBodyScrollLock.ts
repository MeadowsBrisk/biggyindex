"use client";
import { useEffect } from 'react';

// Simple reference counter so multiple components can request a lock safely.
let lockCount = 0;
let savedScrollbarWidth = 0;

/**
 * Hook to lock body scroll when a modal/overlay is open.
 * Uses overflow:hidden approach which is simpler and avoids forced reflows.
 * Adds padding-right to compensate for scrollbar disappearing.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    lockCount += 1;

    if (lockCount === 1) {
      const docEl = document.documentElement;
      // Calculate scrollbar width before hiding it
      savedScrollbarWidth = window.innerWidth - docEl.clientWidth;

      // Apply lock - no position:fixed means no scroll jumping
      docEl.style.overflow = 'hidden';
      // Compensate for scrollbar width to prevent layout shift
      if (savedScrollbarWidth > 0) {
        docEl.style.paddingRight = `${savedScrollbarWidth}px`;
      }
    }

    return () => {
      lockCount -= 1;

      if (lockCount <= 0) {
        lockCount = 0;
        const docEl = document.documentElement;
        docEl.style.overflow = '';
        docEl.style.paddingRight = '';
        savedScrollbarWidth = 0;
      }
    };
  }, [active]);
}
