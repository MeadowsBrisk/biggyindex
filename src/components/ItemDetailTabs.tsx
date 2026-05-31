"use client";

import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cn";

type SectionId = "prices" | "description" | "reviews";

const SECTION_IDS: SectionId[] = ["prices", "description", "reviews"];

/** Walk up from `el` to find the nearest actually-scrollable ancestor.
 *
 * The detail overlay swaps its scroll container by breakpoint: on mobile the
 * `.ido-panel` scrolls while `.ido-center` is static; on desktop `.ido-center`
 * scrolls. Listening on a fixed element therefore misses scroll events on the
 * breakpoint where that element doesn't scroll, which left the scroll-spy
 * tabs frozen. Resolving the real scroller at runtime keeps highlighting in
 * sync regardless of which ancestor is doing the scrolling. */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

interface ItemDetailTabsProps {
  scrollRef?: RefObject<HTMLElement | null>;
  refNum: string | number | null;
  className?: string;
  topOffset?: number;
}

export function ItemDetailTabs({
  scrollRef,
  refNum,
  className,
  topOffset = 64,
}: ItemDetailTabsProps) {
  const t = useTranslations("item.detail.tabs");
  const [active, setActive] = useState<SectionId>("prices");
  const manualRef = useRef(false);
  const manualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const findSections = useCallback((): HTMLElement[] => {
    const root = scrollRef?.current;
    const scope: ParentNode = root ?? document;
    return Array.from(
      scope.querySelectorAll<HTMLElement>("[data-section-id]"),
    ).filter((section) =>
      SECTION_IDS.includes(section.dataset.sectionId as SectionId),
    );
  }, [scrollRef]);

  const updateActive = useCallback(() => {
    if (manualRef.current) return;
    const sections = findSections();
    if (sections.length === 0) return;

    const scroller = getScrollParent(scrollRef?.current ?? null);
    const rootTop = scroller?.getBoundingClientRect().top ?? 0;

    // When genuinely scrolled to the bottom, the final section's heading may
    // never reach the offset line — activate the last section directly so the
    // tab reflects what's actually in view. Guarded by an "is scrollable"
    // check so short, non-scrolling content doesn't falsely pick the last
    // section while sitting at the top of the panel.
    if (scroller && scroller.scrollHeight - scroller.clientHeight > 8) {
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >=
        scroller.scrollHeight - 4;
      if (atBottom) {
        setActive(
          sections[sections.length - 1].dataset.sectionId as SectionId,
        );
        return;
      }
    }

    let best: SectionId | null = null;
    let bestTop = -Infinity;

    for (const section of sections) {
      const id = section.dataset.sectionId as SectionId;
      const top = section.getBoundingClientRect().top - rootTop;
      if (top <= topOffset + 1 && top > bestTop) {
        best = id;
        bestTop = top;
      }
    }

    if (!best) {
      let nearestTop = Infinity;
      for (const section of sections) {
        const id = section.dataset.sectionId as SectionId;
        const top = section.getBoundingClientRect().top - rootTop;
        if (top < nearestTop) {
          nearestTop = top;
          best = id;
        }
      }
    }

    if (best) setActive(best);
  }, [findSections, scrollRef, topOffset]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setActive("prices");
      updateActive();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [refNum, updateActive]);

  useEffect(() => {
    const scroller = getScrollParent(scrollRef?.current ?? null);
    const target: HTMLElement | Window = scroller ?? window;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        updateActive();
      });
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();

    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [scrollRef, updateActive, refNum]);

  const scrollTo = (id: SectionId) => {
    const target = findSections().find(
      (section) => section.dataset.sectionId === id,
    );
    if (!target) return;
    setActive(id);
    manualRef.current = true;
    if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    manualTimerRef.current = setTimeout(() => {
      manualRef.current = false;
      updateActive();
    }, 800);
    const scroller = getScrollParent(scrollRef?.current ?? null);
    if (scroller) {
      const rootTop = scroller.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      scroller.scrollTo({
        top: scroller.scrollTop + targetTop - rootTop - topOffset,
        behavior: "smooth",
      });
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={cx("ido-tabs", className)}>
      {SECTION_IDS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => scrollTo(key)}
          className={cx(
            "ido-tab",
            `ido-tab--${key}`,
            active === key && "ido-tab--active",
          )}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}
