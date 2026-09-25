"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useRef,
} from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper/types";
import "swiper/css";

/** Mirrors the `.home-strip-slide` width ladder in styles/components/home.css exactly. */
const BREAKPOINTS = {
  480: { slidesPerView: 2.2, spaceBetween: 12 },
  640: { slidesPerView: 3, spaceBetween: 12 },
  900: { slidesPerView: 4, spaceBetween: 14 },
  1200: { slidesPerView: 5, spaceBetween: 16 },
  1600: { slidesPerView: 6, spaceBetween: 16 },
  2200: { slidesPerView: 8, spaceBetween: 16 },
};

// Inline because swiper.css sets `.swiper { padding: 0 }` after our stylesheet.
const SWIPER_STYLE = {
  padding: "8px 1rem 20px",
  margin: "-8px 0 -20px",
} as const;

export interface HomeCarouselSlide {
  key: string;
  content: ReactNode;
}

interface HomeCarouselProps {
  slides: HomeCarouselSlide[];
  onSwiper: (swiper: SwiperInstance) => void;
}

/** Lazily-loaded Swiper shell that replaces the SSR scroll-snap strip (adds mouse drag). */
export default function HomeCarousel({ slides, onSwiper }: HomeCarouselProps) {
  const instanceRef = useRef<SwiperInstance | null>(null);

  const handleSwiper = useCallback(
    (swiper: SwiperInstance) => {
      instanceRef.current = swiper;
      onSwiper(swiper);
    },
    [onSwiper],
  );

  // A settled drag-release still fires a native click; swallow it while Swiper reports allowClick=false.
  const handleClickCapture = useCallback((event: ReactMouseEvent) => {
    const instance = instanceRef.current as
      | (SwiperInstance & { allowClick?: boolean })
      | null;
    if (instance?.allowClick === false) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  return (
    <div onClickCapture={handleClickCapture}>
      <Swiper
        onSwiper={handleSwiper}
        slidesPerView={1.4}
        spaceBetween={12}
        breakpoints={BREAKPOINTS}
        style={SWIPER_STYLE}
      >
        {slides.map((slide) => (
          <SwiperSlide key={slide.key} className="home-strip-slide h-auto!">
            {slide.content}
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
