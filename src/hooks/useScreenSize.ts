"use client";
import { useCallback, useEffect, useState } from "react";

export const BREAKPOINTS = {
  mobile: 650,
  tablet: 850,
  smallDesktop: 1280,
  mediumDesktop: 1700,
  ultrawide: 2300,
  superwide: 2700,
} as const;

export type ScreenSizeName = 'mobile' | 'tablet' | 'small-desktop' | 'medium-desktop' | 'ultrawide' | 'superwide' | null;

export interface ScreenSizeState {
  size: ScreenSizeName;
  isMobile: boolean;
  isTablet: boolean;
  isSmallDesktop: boolean;
  isMediumDesktop: boolean;
  isDesktop: boolean;
  isUltrawide: boolean;
  isSuperwide: boolean;
}

const defaultState: ScreenSizeState = {
  size: null,
  isMobile: false,
  isTablet: false,
  isSmallDesktop: false,
  isMediumDesktop: false,
  isDesktop: false,
  isUltrawide: false,
  isSuperwide: false,
};

// Pre-defined state objects to avoid creating new objects on every resize
const STATES: Record<string, ScreenSizeState> = {
  mobile: { size: "mobile", isMobile: true, isTablet: false, isSmallDesktop: false, isMediumDesktop: false, isDesktop: false, isUltrawide: false, isSuperwide: false },
  tablet: { size: "tablet", isMobile: false, isTablet: true, isSmallDesktop: false, isMediumDesktop: false, isDesktop: false, isUltrawide: false, isSuperwide: false },
  smallDesktop: { size: "small-desktop", isMobile: false, isTablet: false, isSmallDesktop: true, isMediumDesktop: false, isDesktop: true, isUltrawide: false, isSuperwide: false },
  mediumDesktop: { size: "medium-desktop", isMobile: false, isTablet: false, isSmallDesktop: false, isMediumDesktop: true, isDesktop: true, isUltrawide: false, isSuperwide: false },
  ultrawide: { size: "ultrawide", isMobile: false, isTablet: false, isSmallDesktop: false, isMediumDesktop: true, isDesktop: true, isUltrawide: true, isSuperwide: false },
  superwide: { size: "superwide", isMobile: false, isTablet: false, isSmallDesktop: false, isMediumDesktop: true, isDesktop: true, isUltrawide: true, isSuperwide: true },
};

/**
 * Hook to detect current screen size based on breakpoints.
 * Returns flags for each size category.
 */
export function useScreenSize(): ScreenSizeState {
  const [screenSize, setScreenSize] = useState<ScreenSizeState>(defaultState);

  const checkScreenSize = useCallback(() => {
    const width = window.innerWidth;

    // Mobile: anything under mobile breakpoint (700px)
    if (width < BREAKPOINTS.mobile) {
      setScreenSize(STATES.mobile);
    } else if (width < BREAKPOINTS.smallDesktop) {
      setScreenSize(STATES.tablet);
    } else if (width < BREAKPOINTS.mediumDesktop) {
      setScreenSize(STATES.smallDesktop);
    } else if (width < BREAKPOINTS.ultrawide) {
      setScreenSize(STATES.mediumDesktop);
    } else if (width < BREAKPOINTS.superwide) {
      setScreenSize(STATES.ultrawide);
    } else {
      setScreenSize(STATES.superwide);
    }
  }, []);

  useEffect(() => {
    checkScreenSize();
    // Throttle resize handler with rAF to prevent excessive re-renders
    let rafId: number | null = null;
    const throttledCheck = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        checkScreenSize();
        rafId = null;
      });
    };
    window.addEventListener("resize", throttledCheck, { passive: true });
    return () => {
      window.removeEventListener("resize", throttledCheck);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [checkScreenSize]);

  return screenSize;
}
