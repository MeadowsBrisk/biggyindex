"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { EffectFade, Keyboard } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper/types";
import "swiper/css";
import "swiper/css/effect-fade";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  RotateButton,
  ZoomButton,
} from "@/components/item/zoom/ZoomButtons";
import ZoomSlide from "@/components/item/zoom/ZoomSlide";
import ZoomThumbnails from "@/components/item/zoom/ZoomThumbnails";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useHistoryState } from "@/hooks/useHistoryState";
import { cx } from "@/lib/cn";

type ImageZoomPreviewProps = {
  /** Primary image URL */
  imageUrl?: string;
  /** All image URLs (carousel) */
  imageUrls?: string[];
  /** Alt text for images */
  alt?: string;
  /** External signal to open the preview (change triggers open) */
  openSignal?: number | null;
  /** Start with modal open on this index */
  startIndex?: number;
};

export default function ImageZoomPreview({
  imageUrl,
  imageUrls,
  alt = "",
  openSignal = null,
  startIndex = 0,
}: ImageZoomPreviewProps) {
  // Collect images list
  const images = useMemo(
    () =>
      Array.isArray(imageUrls) && imageUrls.length
        ? imageUrls
        : imageUrl
          ? [imageUrl]
          : [],
    [imageUrl, imageUrls],
  );
  const total = images.length;

  // Modal state
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when open
  useBodyScrollLock(open);

  // History management — pressing Back closes zoom instead of navigating away
  const { closeOverlay } = useHistoryState({
    id: `image-zoom-${alt}`,
    type: "zoom",
    isOpen: open,
    onClose: () => setOpen(false),
    closeStrategy: "silent",
  });

  // Close helper
  const closePreview = useCallback(() => closeOverlay(), [closeOverlay]);

  // Swiper instance
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  const pendingIndexRef = useRef<number | null>(null);

  // Active slide
  const [activeIndex, setActiveIndex] = useState(startIndex);

  // Open on signal change
  const lastSignalRef = useRef<number | null>(null);
  useEffect(() => {
    if (openSignal == null) return;
    if (lastSignalRef.current === openSignal) return;
    lastSignalRef.current = openSignal;
    setOpen(true);
    setActiveIndex(startIndex);
    if (swiper) {
      try {
        swiper.slideTo(startIndex, 0);
      } catch {}
    } else {
      pendingIndexRef.current = startIndex;
    }
  }, [openSignal, swiper, startIndex]);

  // Rotation state per slide
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const rotationFor = useCallback(
    (i: number) => (rotations[i] || 0) % 360,
    [rotations],
  );
  const rotate = useCallback(
    (delta: number) =>
      setRotations((r) => ({
        ...r,
        [activeIndex]: ((r[activeIndex] || 0) + delta + 360) % 360,
      })),
    [activeIndex],
  );

  // Zoom controls storage
  const controlsRef = useRef<
    Record<
      number,
      {
        zoomIn: () => void;
        zoomOut: () => void;
        resetTransform: () => void;
        centerView: (scale?: number) => void;
      }
    >
  >({});
  const currentScaleRef = useRef<number>(1);

  // Preload images after opening
  useEffect(() => {
    if (!open || images.length <= 1) return;
    images.forEach((src) => {
      const i = new Image();
      i.decoding = "async";
      i.loading = "eager";
      i.src = src;
    });
  }, [open, images]);

  // Navigation helper (debounced)
  const lastNavRef = useRef<number>(0);
  const navigate = useCallback(
    (dir: number) => {
      if (!swiper) return;
      const now = performance.now();
      if (now - lastNavRef.current < 180) return;
      lastNavRef.current = now;
      const cur = swiper.activeIndex || 0;
      const next =
        dir > 0 ? Math.min(cur + 1, total - 1) : Math.max(cur - 1, 0);
      if (next !== cur) swiper.slideTo(next);
    },
    [swiper, total],
  );

  // Keyboard events
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
      else if (e.key === "ArrowLeft") navigate(-1);
      else if (e.key === "ArrowRight") navigate(1);
      else if (e.key === "+") controlsRef.current[activeIndex]?.zoomIn?.();
      else if (e.key === "-") controlsRef.current[activeIndex]?.zoomOut?.();
      else if (e.key === "0") {
        const c = controlsRef.current[activeIndex];
        c?.resetTransform?.();
        c?.centerView?.(1);
        setRotations((r) => ({ ...r, [activeIndex]: 0 }));
      } else if (e.key === "r") rotate(90);
      else if (e.key === "R") rotate(-90);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, activeIndex, rotate, navigate, closePreview]);

  // UI auto-hide (cursor movement resets timer)
  const [showUI, setShowUI] = useState(true);
  const idleTimer = useRef<number | null>(null);
  const userActive = useCallback(() => {
    if (!open) return;
    setShowUI(true);
    if (idleTimer.current != null) clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setShowUI(false), 3000);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    userActive();
    const onMove = () => userActive();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("keydown", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onMove);
      if (idleTimer.current != null) clearTimeout(idleTimer.current);
    };
  }, [open, userActive]);

  if (!mounted || typeof document === "undefined" || images.length === 0)
    return null;

  // Portal body (modal)
  return createPortal(
    <AnimatePresence initial={false}>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={closePreview}
          />

          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={alt || "Image preview"}
            className="fixed inset-0 z-[10001] flex flex-col touch-none select-none"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* Top bar */}
            <div
              className={cx(
                "pointer-events-none absolute top-2 left-0 right-0 flex items-start justify-between px-2 sm:px-4 z-[10040]",
                "transition-opacity duration-300",
                showUI ? "opacity-100" : "opacity-0",
              )}
            >
              <div className="flex items-center gap-2 pointer-events-auto">
                <div className="flex items-center gap-1 rounded-full bg-black/35 backdrop-blur-md border border-white/10 px-2 py-1 shadow-sm">
                  <RotateButton dir="left" onClick={() => rotate(-90)} />
                  <RotateButton dir="right" onClick={() => rotate(90)} />
                  <ZoomButton
                    small
                    icon="+"
                    label="Zoom in"
                    onClick={() => controlsRef.current[activeIndex]?.zoomIn?.()}
                  />
                  <ZoomButton
                    small
                    icon="-"
                    label="Zoom out"
                    onClick={() =>
                      controlsRef.current[activeIndex]?.zoomOut?.()
                    }
                  />
                  <ZoomButton
                    small
                    icon="↺"
                    label="Reset"
                    onClick={() => {
                      const c = controlsRef.current[activeIndex];
                      c?.resetTransform?.();
                      c?.centerView?.(1);
                      setRotations((r) => ({ ...r, [activeIndex]: 0 }));
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pointer-events-auto">
                {total > 1 && (
                  <span className="inline-flex items-center gap-1 tabular-nums bg-black/45 px-2 py-1 rounded-md backdrop-blur-md border border-white/10 text-xs sm:text-sm text-white/90">
                    {activeIndex + 1}
                    <span className="opacity-50">/</span>
                    {total}
                  </span>
                )}
                <button
                  aria-label="Close preview"
                  onClick={(e) => {
                    e.stopPropagation();
                    closePreview();
                  }}
                  className="group relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-black/45 backdrop-blur-md text-gray-100 border border-white/15 shadow-sm hover:bg-black/65 cursor-pointer"
                >
                  <span className="absolute inset-0 rounded-full group-active:scale-90 transition-transform" />
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    stroke="currentColor"
                    strokeWidth={2}
                    fill="none"
                  >
                    <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Viewer */}
            <div
              className="relative flex-1 min-h-0"
              onClick={(e) => {
                setShowUI(true);
                try {
                  const t = e.target as HTMLElement;
                  if (
                    currentScaleRef.current <= 1.0001 &&
                    !t.closest("button") &&
                    !t.closest("[data-zoom-content]") &&
                    !t.closest("[data-nav]") &&
                    !t.closest("[data-thumbs]")
                  ) {
                    closePreview();
                  }
                } catch {}
              }}
            >
              {/* Gradients */}
              <div
                className={cx(
                  "pointer-events-none fixed inset-x-0 top-0 h-20 bg-gradient-to-b from-black/65 to-transparent transition-opacity duration-500",
                  showUI ? "opacity-100" : "opacity-0",
                )}
              />
              <div
                className={cx(
                  "pointer-events-none fixed inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-500",
                  showUI ? "opacity-100" : "opacity-0",
                )}
              />

              {/* Swiper carousel */}
              <Swiper
                modules={[Keyboard, EffectFade]}
                effect="fade"
                fadeEffect={{ crossFade: true }}
                speed={360}
                spaceBetween={0}
                slidesPerView={1}
                allowTouchMove
                keyboard={{ enabled: true }}
                onSwiper={(sw) => {
                  setSwiper(sw);
                  if (pendingIndexRef.current != null) {
                    try {
                      sw.slideTo(pendingIndexRef.current, 0);
                    } catch {}
                    pendingIndexRef.current = null;
                  }
                }}
                onSlideChange={(sw) => {
                  const idx = sw.activeIndex || 0;
                  setActiveIndex(idx);
                  try {
                    const c = controlsRef.current[idx];
                    c?.resetTransform?.();
                    c?.centerView?.(1);
                  } catch {}
                  setShowUI(true);
                }}
                className="w-full h-full"
              >
                {images.map((src, idx) => (
                  <SwiperSlide key={idx + src} className="!h-full">
                    <ZoomSlide
                      src={src}
                      idx={idx}
                      alt={alt}
                      total={total}
                      activeIndex={activeIndex}
                      rotation={rotationFor(idx)}
                      swiper={swiper}
                      controlsRef={controlsRef}
                      currentScaleRef={currentScaleRef}
                    />
                  </SwiperSlide>
                ))}
              </Swiper>

              {/* Navigation arrows */}
              {total > 1 && (
                <>
                  <button
                    data-nav
                    aria-label="Previous image"
                    disabled={activeIndex <= 0}
                    onClick={() => navigate(-1)}
                    className={cx(
                      "hidden md:flex group absolute left-0 top-0 h-full w-32 items-center justify-start pl-4 z-[10020]",
                      activeIndex <= 0 && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <span
                      className={cx(
                        "rounded-full p-5 backdrop-blur-md border shadow-sm bg-white/85 dark:bg-gray-900/70 text-gray-900 dark:text-gray-100 transition-colors",
                        activeIndex > 0
                          ? "group-hover:ring-2 group-hover:ring-white/60"
                          : "bg-white/30 dark:bg-gray-700/30 border-transparent text-gray-400 dark:text-gray-500",
                      )}
                    >
                      <ArrowLeftIcon className="w-8 h-8 group-hover:-translate-x-1 transition-transform" />
                    </span>
                  </button>
                  <button
                    data-nav
                    aria-label="Next image"
                    disabled={activeIndex >= total - 1}
                    onClick={() => navigate(1)}
                    className={cx(
                      "hidden md:flex group absolute right-0 top-0 h-full w-32 items-center justify-end pr-4 z-[10020]",
                      activeIndex >= total - 1 &&
                        "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <span
                      className={cx(
                        "rounded-full p-5 backdrop-blur-md border shadow-sm bg-white/85 dark:bg-gray-900/70 text-gray-900 dark:text-gray-100 transition-colors",
                        activeIndex < total - 1
                          ? "group-hover:ring-2 group-hover:ring-white/60"
                          : "bg-white/30 dark:bg-gray-700/30 border-transparent text-gray-400 dark:text-gray-500",
                      )}
                    >
                      <ArrowRightIcon className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            <ZoomThumbnails
              images={images}
              activeIndex={activeIndex}
              onSelect={(i) => {
                try {
                  if (swiper) swiper.slideTo(i);
                } catch {}
                setShowUI(true);
              }}
              show={showUI}
              alt={alt}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
