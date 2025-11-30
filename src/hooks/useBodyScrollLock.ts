"use client";
import { useEffect } from 'react';

interface StoredState {
  scrollY: number;
  docOverflowY: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
}

// Simple reference counter so multiple components can request a lock safely.
let lockCount = 0;
let storedState: StoredState | null = null;

/**
 * Hook to lock body scroll when a modal/overlay is open.
 * Supports multiple concurrent locks via reference counting.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    
    lockCount += 1;
    
    if (lockCount === 1) {
      const docEl = document.documentElement;
      const body = document.body;
      // Capture current scroll so we can restore later
      const scrollY = window.scrollY || window.pageYOffset;
      
      storedState = {
        scrollY,
        docOverflowY: docEl.style.overflowY,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyWidth: body.style.width,
      };
      
      // Force a vertical scrollbar channel to remain (avoids layout shift / reflow) while freezing content
      docEl.style.overflowY = 'scroll';
      // Freeze body at its current scroll position
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.width = '100%';
    }
    
    return () => {
      lockCount -= 1;
      
      if (lockCount <= 0) {
        lockCount = 0;
        const docEl = document.documentElement;
        const body = document.body;
        
        if (storedState) {
          const { scrollY, docOverflowY, bodyPosition, bodyTop, bodyWidth } = storedState;
          docEl.style.overflowY = docOverflowY || '';
          body.style.position = bodyPosition || '';
          body.style.top = bodyTop || '';
          body.style.width = bodyWidth || '';
          // Restore scroll (invert the fixed offset)
          window.scrollTo(0, scrollY || 0);
        }
        storedState = null;
      }
    };
  }, [active]);
}
