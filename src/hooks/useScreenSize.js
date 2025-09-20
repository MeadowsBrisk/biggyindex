"use client";
import { useCallback, useEffect, useState } from "react";

export const BREAKPOINTS = {
  mobile: 700,
  tablet: 850,
  smallDesktop: 1280,
  mediumDesktop: 1700,
  ultrawide: 2300,
  superwide: 2700,
};

export function useScreenSize() {
  const [screenSize, setScreenSize] = useState({
    size: null,
    isMobile: false,
    isTablet: false,
    isSmallDesktop: false,
    isMediumDesktop: false,
    isDesktop: false,
    isUltrawide: false,
    isSuperwide: false,
  });

  const checkScreenSize = useCallback(() => {
    const width = window.innerWidth;
    if (width < BREAKPOINTS.mobile) {
      setScreenSize({ size: "mobile", isMobile: true, isTablet: false, isSmallDesktop: false, isMediumDesktop: false, isDesktop: false, isUltrawide: false, isSuperwide: false });
    } else if (width < BREAKPOINTS.tablet) {
      setScreenSize({ size: "mobile", isMobile: true, isTablet: false, isSmallDesktop: false, isMediumDesktop: false, isDesktop: false, isUltrawide: false, isSuperwide: false });
    } else if (width < BREAKPOINTS.smallDesktop) {
      setScreenSize({ size: "tablet", isMobile: false, isTablet: true, isSmallDesktop: false, isMediumDesktop: false, isDesktop: false, isUltrawide: false, isSuperwide: false });
    } else if (width < BREAKPOINTS.mediumDesktop) {
      setScreenSize({ size: "small-desktop", isMobile: false, isTablet: false, isSmallDesktop: true, isMediumDesktop: false, isDesktop: true, isUltrawide: false, isSuperwide: false });
    } else if (width < BREAKPOINTS.ultrawide) {
      setScreenSize({ size: "medium-desktop", isMobile: false, isTablet: false, isSmallDesktop: false, isMediumDesktop: true, isDesktop: true, isUltrawide: false, isSuperwide: false });
    } else if (width < BREAKPOINTS.superwide) {
      setScreenSize({ size: "ultrawide", isMobile: false, isTablet: false, isSmallDesktop: false, isMediumDesktop: true, isDesktop: true, isUltrawide: true, isSuperwide: false });
    } else {
      setScreenSize({ size: "superwide", isMobile: false, isTablet: false, isSmallDesktop: false, isMediumDesktop: true, isDesktop: true, isUltrawide: true, isSuperwide: true });
    }
  }, []);

  useEffect(() => {
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, [checkScreenSize]);

  return screenSize;
}
