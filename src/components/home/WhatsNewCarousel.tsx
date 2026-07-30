"use client";

/**
 * Swiper shell for the home "What's New" strip.
 *
 * Loaded LAZILY by WhatsNewSection (dynamic import on first intersection), so
 * Swiper + its CSS stay out of the home page's critical bundle — the reason
 * the perf pass replaced it with a CSS scroll-snap strip in the first place.
 * That strip is still what the server renders and what stands in until this
 * chunk lands; it uses the same slidesPerView/spaceBetween ladder (see
 * styles/elements/whats-new.css), so the swap is layout-identical.
 *
 * Why bring Swiper back at all: scroll-snap gives touch drag but NO mouse
 * drag. Swiper's defaults (simulateTouch, followFinger, longSwipes,
 * snap-on-release) are the hand-feel the food-aggregator home carousels have
 * — see E:\my-sites\food-aggregator\components\home\carousel.tsx, which also
 * runs on stock interaction defaults. Only the layout ladder differs, and it
 * deliberately mirrors this site's existing breakpoints rather than
 * food-agg's, so the pre-hydration fallback and the Swiper agree.
 */

import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useRef,
} from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper/types";
import "swiper/css";

/** Mirrors the `.whats-new-slide` width ladder in whats-new.css exactly. */
const BREAKPOINTS = {
  480: { slidesPerView: 2.2, spaceBetween: 12 },
  640: { slidesPerView: 3, spaceBetween: 12 },
  900: { slidesPerView: 4, spaceBetween: 14 },
  1200: { slidesPerView: 5, spaceBetween: 16 },
  1600: { slidesPerView: 6, spaceBetween: 16 },
  2200: { slidesPerView: 8, spaceBetween: 16 },
};

/**
 * Padding/negative-margin pair copied from `.whats-new-scroller`: the box
 * space keeps card hover shadows inside Swiper's `overflow: hidden` without
 * moving the strip. Inline (not a class) because swiper.css declares
 * `.swiper { padding: 0 }` and lands after our stylesheet.
 */
const SWIPER_STYLE = {
  padding: "8px 1rem 20px",
  margin: "-8px 0 -20px",
} as const;

export interface WhatsNewCarouselSlide {
  key: string;
  content: ReactNode;
}

interface WhatsNewCarouselProps {
  slides: WhatsNewCarouselSlide[];
  /** Hands the instance to the section so its arrow buttons can page it. */
  onSwiper: (swiper: SwiperInstance) => void;
}

export default function WhatsNewCarousel({
  slides,
  onSwiper,
}: WhatsNewCarouselProps) {
  const instanceRef = useRef<SwiperInstance | null>(null);

  const handleSwiper = useCallback(
    (swiper: SwiperInstance) => {
      instanceRef.current = swiper;
      onSwiper(swiper);
    },
    [onSwiper],
  );

  /**
   * Drag-then-click guard. During a pointer drag Swiper sets
   * `instance.allowClick = false`, but its built-in `preventClicksPropagation`
   * only swallows the click while the swiper is still animating — a settled
   * drag-release still fires a native click that React forwards to the card's
   * `onClick`, opening the item overlay. This capture-phase handler sits on
   * the shell wrapper and calls `stopPropagation` (which also stops the
   * NATIVE event, so React's root bubble listener never runs). Genuine clicks
   * keep `allowClick === true` and pass straight through.
   */
  const handleClickCapture = useCallback((event: ReactMouseEvent) => {
    // `allowClick` is a runtime flag Swiper does not publish in its types.
    const instance = instanceRef.current as
      | (SwiperInstance & { allowClick?: boolean })
      | null;
    if (instance?.allowClick === false) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  return (
    // Capture-only guard — adds no interaction of its own; the slides' links
    // and buttons stay the interactive elements.
    <div onClickCapture={handleClickCapture}>
      <Swiper
        onSwiper={handleSwiper}
        slidesPerView={1.4}
        spaceBetween={12}
        breakpoints={BREAKPOINTS}
        style={SWIPER_STYLE}
      >
        {slides.map((slide) => (
          // h-auto! lets slides stretch to the tallest card (equal heights).
          <SwiperSlide key={slide.key} className="whats-new-slide h-auto!">
            {slide.content}
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
