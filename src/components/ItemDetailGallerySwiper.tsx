"use client";

/**
 * Swiper-backed multi-image gallery — loaded lazily by ItemDetailGallery via
 * a dynamic import ONLY when an item has more than one image, keeping Swiper
 * (+ its CSS) out of the item page's critical bundle. Until this chunk lands
 * the parent renders a dimension-identical static <img> inside the same
 * `.ido-swiper` container, so the swap is shift-free.
 */

import { EffectFade, Keyboard } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper/types";
import "swiper/css";
import "swiper/css/effect-fade";

interface ItemDetailGallerySwiperProps {
  images: string[];
  alt: string;
  /** Slide to start on — the parent may have advanced via thumbs pre-load. */
  initialSlide: number;
  onSwiper: (swiper: SwiperInstance) => void;
  onSlideChange: (index: number) => void;
  onZoom: (index: number) => void;
}

export default function ItemDetailGallerySwiper({
  images,
  alt,
  initialSlide,
  onSwiper,
  onSlideChange,
  onZoom,
}: ItemDetailGallerySwiperProps) {
  return (
    <Swiper
      modules={[Keyboard, EffectFade]}
      effect="fade"
      fadeEffect={{ crossFade: true }}
      keyboard={{ enabled: true }}
      spaceBetween={0}
      slidesPerView={1}
      initialSlide={initialSlide}
      onSwiper={onSwiper}
      onSlideChange={(swiper) => onSlideChange(swiper.activeIndex ?? 0)}
      className="ido-swiper"
    >
      {images.map((src, index) => (
        <SwiperSlide key={`${index}-${src}`}>
          <button
            type="button"
            onClick={() => onZoom(index)}
            className="w-full h-full focus:outline-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
            />
          </button>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
