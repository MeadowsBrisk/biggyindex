"use client";

import {
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Swiper as SwiperInstance } from "swiper/types";
import type { HomeCarouselSlide } from "@/components/home/HomeCarousel";
import {
  type HomeCardMode,
  HomeItemCard,
} from "@/components/home/HomeItemCard";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import type { HomeCardItem } from "@/lib/home/feed";
import type { ServerCurrency } from "@/lib/market/currency";

type HomeCarouselComponent = ComponentType<{
  slides: HomeCarouselSlide[];
  onSwiper: (swiper: SwiperInstance) => void;
}>;

export interface HomeTabLists {
  new: HomeCardItem[];
  drops: HomeCardItem[];
  restock: HomeCardItem[];
}

const TABS: {
  key: keyof HomeTabLists;
  mode: HomeCardMode;
  icon: ComponentType<{ size?: number }>;
}[] = [
  { key: "new", mode: "new", icon: Sparkles },
  { key: "drops", mode: "drop", icon: TrendingDown },
  { key: "restock", mode: "restock", icon: PackageCheck },
];

const EAGER_CARDS = 4;

export function HomeTabs({
  lists,
  currency,
}: {
  lists: HomeTabLists;
  currency: ServerCurrency;
}) {
  const t = useTranslations("home.feed");
  const { symbol, rate } = useDisplayCurrency(currency);
  // "Back in stock" hides until the crawler stamps relists; an all-empty feed hides the section.
  const tabs = useMemo(
    () =>
      TABS.filter((tab) => tab.key !== "restock" || lists.restock.length > 0),
    [lists.restock.length],
  );
  const [active, setActive] = useState<keyof HomeTabLists>("new");
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];
  const items = current ? lists[current.key] : [];

  const stripRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const swiperRef = useRef<SwiperInstance | null>(null);
  const [Carousel, setCarousel] = useState<HomeCarouselComponent | null>(null);

  // SSR ships a scroll-snap strip; Swiper (mouse drag) loads once the strip nears the viewport.
  useEffect(() => {
    const node = stripRef.current;
    if (!node) return;
    let cancelled = false;
    const load = () => {
      import("@/components/home/HomeCarousel").then(
        (mod) => {
          if (!cancelled) setCarousel(() => mod.default);
        },
        () => {},
      );
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  const handleSwiper = useCallback((swiper: SwiperInstance) => {
    swiperRef.current = swiper;
  }, []);

  const scrollByCard = useCallback((direction: 1 | -1) => {
    const swiper = swiperRef.current;
    if (swiper && !swiper.destroyed) {
      if (direction === 1) swiper.slideNext();
      else swiper.slidePrev();
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const slide = scroller.querySelector<HTMLElement>(".home-strip-slide");
    if (!slide) return;
    const gap = Number.parseFloat(getComputedStyle(scroller).columnGap) || 12;
    scroller.scrollBy({
      left: direction * (slide.offsetWidth + gap),
      behavior: "smooth",
    });
  }, []);

  if (!current || tabs.every((tab) => lists[tab.key].length === 0)) return null;

  const slides: HomeCarouselSlide[] = items.map((item, index) => ({
    key: `${current.key}-${item.id}`,
    content: (
      <HomeItemCard
        item={item}
        mode={current.mode}
        currencySymbol={symbol}
        exchangeRate={rate}
        eager={index < EAGER_CARDS}
      />
    ),
  }));

  return (
    <section className="home-sec" id="activity">
      <div className="home-wrap">
        <div className="home-sec-head">
          <div className="home-tabs" role="tablist">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const on = tab.key === current.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={`home-tab${on ? " home-tab--on" : ""}`}
                  onClick={() => setActive(tab.key)}
                >
                  <Icon size={14} />
                  {t(`tabs.${tab.key}`)}
                  <span className="home-tab-cnt">{lists[tab.key].length}</span>
                </button>
              );
            })}
          </div>
          <div className="home-arrows">
            <button
              type="button"
              onClick={() => scrollByCard(-1)}
              className="home-arw"
              aria-label={t("scrollLeft")}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => scrollByCard(1)}
              className="home-arw"
              aria-label={t("scrollRight")}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>

      <div ref={stripRef} className="home-strip">
        {/* Re-keyed per tab so the scroll position and Swiper instance reset. */}
        <div key={current.key}>
          {Carousel ? (
            <Carousel slides={slides} onSwiper={handleSwiper} />
          ) : (
            <div
              ref={scrollerRef}
              className="home-strip-scroller"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: horizontal scroller must be keyboard-scrollable
              tabIndex={0}
            >
              {slides.map((slide) => (
                <div key={slide.key} className="home-strip-slide">
                  {slide.content}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
