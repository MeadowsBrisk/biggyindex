"use client";

import { AnimatePresence, motion } from "framer-motion";
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

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={handleClick}
          aria-label={t("backToTop")}
          title={t("backToTop")}
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-surface-hover hover:shadow-xl focus-visible:outline-2 focus-visible:outline-ring cursor-pointer"
        >
          <ArrowUp size={18} strokeWidth={2.25} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
