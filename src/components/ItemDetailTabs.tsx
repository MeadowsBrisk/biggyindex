"use client";

import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cn";

type SectionId = "prices" | "description" | "reviews";

const SECTION_IDS: SectionId[] = ["prices", "description", "reviews"];

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

    const root = scrollRef?.current;
    const rootTop = root?.getBoundingClientRect().top ?? 0;
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
    const root = scrollRef?.current;
    const target: HTMLElement | Window = root ?? window;
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
  }, [scrollRef, updateActive]);

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
