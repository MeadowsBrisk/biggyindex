"use client";

import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { footerVisibleAtom } from "@/store/atoms";

/**
 * Invisible sentinel placed just before the footer.
 * Uses IntersectionObserver to detect when the footer is entering the viewport,
 * causing the sticky toolbar to slide up and out of view.
 */
export function FooterSentinel() {
  const ref = useRef<HTMLDivElement>(null);
  const setFooterVisible = useSetAtom(footerVisibleAtom);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setFooterVisible(entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [setFooterVisible]);

  return <div ref={ref} className="h-px w-full" aria-hidden="true" />;
}
