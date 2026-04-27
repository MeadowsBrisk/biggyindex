"use client";

import { Package } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { EffectFade, Keyboard } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper/types";
import "swiper/css";
import "swiper/css/effect-fade";
import { cx } from "@/lib/cn";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

interface ItemDetailGalleryProps {
  images: string[];
  alt: string;
  itemKey?: string | number | null;
}

export function ItemDetailGallery({
  images,
  alt,
  itemKey,
}: ItemDetailGalleryProps) {
  const mainSwiperRef = useRef<SwiperInstance | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);
  const [startZoomIndex, setStartZoomIndex] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setActiveSlide(0);
      try {
        mainSwiperRef.current?.slideTo(0, 0);
      } catch {}
    });
    return () => window.cancelAnimationFrame(frame);
  }, [itemKey]);

  const openZoom = useCallback((index: number) => {
    setStartZoomIndex(index);
    setZoomSignal(Date.now());
  }, []);

  const setSwiper = useCallback((swiper: SwiperInstance) => {
    mainSwiperRef.current = swiper;
  }, []);

  const selectSlide = useCallback((index: number) => {
    setActiveSlide(index);
    mainSwiperRef.current?.slideTo(index);
  }, []);

  return (
    <>
      {images.length > 0 ? (
        <>
          <Swiper
            modules={[Keyboard, EffectFade]}
            effect="fade"
            fadeEffect={{ crossFade: true }}
            keyboard={{ enabled: true }}
            spaceBetween={0}
            slidesPerView={1}
            onSwiper={setSwiper}
            onSlideChange={(swiper) => setActiveSlide(swiper.activeIndex ?? 0)}
            className="ido-swiper"
          >
            {images.map((src, index) => (
              <SwiperSlide key={`${index}-${src}`}>
                <button
                  type="button"
                  onClick={() => openZoom(index)}
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

          {images.length > 1 && (
            <div className="absolute bottom-3 left-3 z-20 md:relative md:bottom-auto md:left-auto md:mt-3 md:flex md:justify-center">
              <div className="ido-thumbs">
                {images.map((src, index) => (
                  <button
                    key={`thumb-${index}`}
                    type="button"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      selectSlide(index);
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectSlide(index);
                    }}
                    onClick={() => selectSlide(index)}
                    className={cx(
                      "ido-thumb",
                      activeSlide === index && "ido-thumb--active",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`${alt} ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="w-full aspect-square flex items-center justify-center bg-surface rounded-lg">
          <Package size={64} className="text-muted opacity-30" />
        </div>
      )}

      {images.length > 0 && (
        <Suspense fallback={null}>
          <ImageZoomPreview
            imageUrls={images}
            alt={alt}
            openSignal={zoomSignal}
            startIndex={startZoomIndex}
          />
        </Suspense>
      )}
    </>
  );
}
