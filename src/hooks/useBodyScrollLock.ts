'use client';

import { useEffect } from 'react';

// Reference counter so multiple overlays can lock simultaneously.
let lockCount = 0;
let savedScrollY = 0;

/**
 * Lock body scroll when a modal/overlay is open.
 *
 * Sets overflow:hidden on <html> while saving/restoring scroll position.
 * Works cleanly with `scrollbar-gutter: stable` on <html> which already
 * prevents layout shift from the hidden scrollbar.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    lockCount += 1;

    if (lockCount === 1) {
      savedScrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
    }

    return () => {
      lockCount -= 1;

      if (lockCount <= 0) {
        lockCount = 0;
        document.documentElement.style.overflow = '';
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}
