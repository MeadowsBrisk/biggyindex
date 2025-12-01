"use client";
import { useScreenSize } from './useScreenSize';

export interface NarrowLayoutState {
  narrow: boolean;
  width: number;
  ready: boolean;
}

/**
 * Hook to detect narrow (mobile) layout.
 * Now delegates to useScreenSize for consistency.
 * 
 * NOTE: Previously used breakpoint of 1023px (width <= 1023 = narrow).
 * Now uses useScreenSize which treats < 850px as mobile/tablet.
 * If the old 1023px breakpoint is needed, revert to the previous implementation
 * or adjust BREAKPOINTS.tablet in useScreenSize.ts.
 */
export function useNarrowLayout(): NarrowLayoutState {
  const screenSize = useScreenSize();
  
  // Narrow = mobile or tablet (< smallDesktop breakpoint of 1280px)
  // This is close to the old 1023px threshold
  const narrow = screenSize.isMobile || screenSize.isTablet;
  
  return {
    narrow,
    // Width is not tracked in useScreenSize, return 0 (most consumers only use `narrow`)
    width: 0,
    ready: screenSize.size !== null,
  };
}
