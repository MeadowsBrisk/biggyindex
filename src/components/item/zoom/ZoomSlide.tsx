"use client";

import type React from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import type { Swiper } from "swiper/types";

interface ZoomControls {
  zoomIn: () => void;
  zoomOut: () => void;
  resetTransform: () => void;
  centerView: () => void;
}

interface ZoomSlideProps {
  src: string;
  idx: number;
  alt: string;
  total: number;
  activeIndex: number;
  rotation: number;
  swiper: Swiper | null;
  controlsRef: React.MutableRefObject<Record<number, ZoomControls>>;
  currentScaleRef: React.MutableRefObject<number>;
}

export default function ZoomSlide({
  src,
  idx,
  alt,
  total,
  activeIndex,
  rotation,
  swiper,
  controlsRef,
  currentScaleRef,
}: ZoomSlideProps) {
  return (
    <div className="!h-full flex items-center justify-center swiper-zoom-slide">
      <TransformWrapper
        wheel={{ step: 0.08, smoothStep: 0.004 }}
        doubleClick={{ mode: "reset" }}
        minScale={1}
        maxScale={5}
        centerOnInit
        limitToBounds={false}
        onTransformed={(ref) => {
          if (idx === activeIndex) {
            // Snap to exactly 1.0 when very close to prevent floating-point stuck state
            const scale = ref.state.scale;
            const snapped = Math.abs(scale - 1) < 0.01 ? 1 : scale;
            currentScaleRef.current = snapped;
            if (swiper) {
              const allow = snapped <= 1.0001;
              if (swiper.allowTouchMove !== allow)
                swiper.allowTouchMove = allow;
            }
          }
        }}
      >
        {({ zoomIn, zoomOut, resetTransform, centerView }) => {
          controlsRef.current[idx] = {
            zoomIn,
            zoomOut,
            resetTransform,
            centerView,
          };
          return (
            <TransformComponent
              wrapperClass="grid place-items-center !w-full !h-full"
              contentClass="grid place-items-center !w-full !h-full"
            >
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ cursor: "grab" }}
              >
                <div
                  className="transition-transform duration-300"
                  style={{ transform: `rotate(${rotation}deg)` }}
                  data-zoom-content
                >
                  <img
                    src={src}
                    alt={
                      alt ? `${alt} (${idx + 1}/${total})` : `Image ${idx + 1}`
                    }
                    style={{ maxHeight: "90vh", maxWidth: "90vw" }}
                    className="w-auto h-auto block select-none object-contain"
                    draggable={false}
                    loading="eager"
                    decoding="async"
                  />
                </div>
              </div>
            </TransformComponent>
          );
        }}
      </TransformWrapper>
    </div>
  );
}
