"use client";
import { useEffect } from 'react';

// Simple reference counter so multiple components can request a lock safely.
let lockCount = 0;

/**
 * Hook to lock body scroll when a modal/overlay is open.
 * Uses overflow:hidden + scrollbar-gutter:stable (in globals.css)
 * so no JS-based scrollbar compensation is needed.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    lockCount += 1;

    if (lockCount === 1) {
      document.documentElement.style.overflow = 'hidden';
    }

    return () => {
      lockCount -= 1;

      if (lockCount <= 0) {
        lockCount = 0;
        document.documentElement.style.overflow = '';
      }
    };
  }, [active]);
}
