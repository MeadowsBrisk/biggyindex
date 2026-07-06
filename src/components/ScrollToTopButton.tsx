"use client";

import { useAtomValue } from "jotai";
import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { footerVisibleAtom } from "@/store/atoms";

const SHOW_AFTER_SCROLL_PX = 300;

/**
 * Floating "back to top" button. Mirrors v1's FixedControls pattern:
 *   • appears once the user has scrolled past ~one viewport
 *   • hides again when the footer enters the viewport (driven by
 *     `footerVisibleAtom`, set by `<FooterSentinel />` on /browse)
 *   • throttled with rAF so the scroll handler is cheap
 *   • respects prefers-reduced-motion via Framer Motion + native smooth
 *     scroll falling back to instant jump
 *
 * Mounted globally from `[locale]/layout.tsx`. Sits at z-40 so any modal
 * (z-50+) covers it naturally — no need to listen for overlay state.
 */
export function ScrollToTopButton() {
  const t = useTranslations("common");
  const footerVisible = useAtomValue(footerVisibleAtom);
  const [scrolledPast, setScrolledPast] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        setScrolledPast(window.scrollY > SHOW_AFTER_SCROLL_PX);
        rafRef.current = null;
      });
    };
    // Sync initial value in case the page loads already scrolled (e.g. a
    // refresh mid-scroll, or a deep link with a hash fragment).
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const visible = scrolledPast && !footerVisible;

  // Stays mounted; CSS transitions handle the fade/scale in both directions
  // (replaces framer-motion's AnimatePresence — keeps it out of the bundle).
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t("backToTop")}
      title={t("backToTop")}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg backdrop-blur-sm transition-[opacity,transform,background-color] duration-200 ease-out motion-reduce:transition-none hover:bg-surface-hover hover:shadow-xl focus-visible:outline-2 focus-visible:outline-ring cursor-pointer ${
        visible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-2 scale-[0.8] pointer-events-none"
      }`}
    >
      <ArrowUp size={18} strokeWidth={2.25} />
    </button>
  );
}
