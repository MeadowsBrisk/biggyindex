"use client";

import { Package } from "lucide-react";
import {
  type ComponentType,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Swiper as SwiperInstance } from "swiper/types";
import { cx } from "@/lib/cn";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

type GallerySwiperComponent = ComponentType<{
  images: string[];
  alt: string;
  initialSlide: number;
  onSwiper: (swiper: SwiperInstance) => void;
  onSlideChange: (index: number) => void;
  onZoom: (index: number) => void;
}>;

interface ItemDetailGalleryProps {
  images: string[];
  alt: string;
  itemKey?: string | number | null;
}

/**
 * Item gallery. The FIRST image renders as a plain server-renderable <img>
 * (it's the item page's LCP element — no JS needed to paint it). Swiper is
 * only imported, on the client after mount, when there is more than one
 * image; until the chunk lands the static image stands in inside the same
 * dimension-fixed `.ido-swiper` container (aspect-ratio'd in CSS), so the
 * swap causes no layout shift. Thumbnails render immediately (SSR'd) and
 * work pre-Swiper by swapping the static image's src.
 */
export function ItemDetailGallery({
  images,
  alt,
  itemKey,
}: ItemDetailGalleryProps) {
  const mainSwiperRef = useRef<SwiperInstance | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);
  const [startZoomIndex, setStartZoomIndex] = useState(0);
  const [GallerySwiper, setGallerySwiper] =
    useState<GallerySwiperComponent | null>(null);

  // Lazy-load Swiper only for multi-image galleries. Single-image items
  // (and the SSR pass) never pay for the chunk.
  useEffect(() => {
    if (images.length <= 1) return;
    let cancelled = false;
    import("@/components/ItemDetailGallerySwiper").then(
      (mod) => {
        if (!cancelled) setGallerySwiper(() => mod.default);
      },
      () => {
        // Chunk failed to load — the static image + thumbs keep working.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [images.length]);

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

  const staticSrc = images[activeSlide] ?? images[0];

  return (
    <>
      {images.length > 0 ? (
        <>
          {GallerySwiper ? (
            <GallerySwiper
              images={images}
              alt={alt}
              initialSlide={activeSlide}
              onSwiper={setSwiper}
              onSlideChange={setActiveSlide}
              onZoom={openZoom}
            />
          ) : (
            <div className="ido-swiper ido-swiper--static">
              <button
                type="button"
                onClick={() => openZoom(activeSlide)}
                className="w-full h-full focus:outline-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={staticSrc}
                  alt={alt}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  draggable={false}
                />
              </button>
            </div>
          )}

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
