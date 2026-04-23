"use client";

import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { expandedRefNumAtom } from "@/store/atoms";

/**
 * Bridge between the Next.js intercepting route and the Jotai-driven overlay.
 * Sets `expandedRefNumAtom` on mount so ItemDetailOverlay opens.
 * Renders nothing — the overlay UI lives in layout.tsx.
 */
export function OverlayBridge({ refNum }: { refNum: string }) {
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const mountedRef = useRef(false);

  useEffect(() => {
    setRefNum(refNum);
    mountedRef.current = true;
  }, [refNum, setRefNum]);

  return null;
}
