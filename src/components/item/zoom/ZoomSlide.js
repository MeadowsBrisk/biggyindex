"use client";
import React from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useGifAsset } from '@/lib/ui/gifAssets';
import { proxyImage } from '@/lib/ui/images';

/* ZoomSlide
 * Props:
 *  - src: image URL (string)
 *  - idx: index (number)
 *  - alt: base alt text
 *  - total: total slides
 *  - activeIndex: currently active index (for locking gestures)
 *  - rotation: degrees number
 *  - useProxy: boolean to enable/disable proxying
 *  - swiper: Swiper instance
 *  - controlsRef: ref object to store zoom controls per index
 *  - currentScaleRef: ref to current zoom scale (shared)
 *  - paused: boolean indicating GIF paused state (only meaningful if GIF)
 */
export default function ZoomSlide({
  src,
  idx,
  alt,
  total,
  activeIndex,
  rotation,
  useProxy = true,
  swiper,
  controlsRef,
  currentScaleRef,
  paused,
}) {
  const isGif = typeof src === 'string' && /\.gif($|[?#])/i.test(src);
  const { anim, poster, hasAnim } = useGifAsset(isGif ? src : null);
  // Always request full resolution for zoom modal (no width = full.avif)
  const displaySrc = useProxy ? proxyImage(src) : src;

  return (
    <div className="!h-full flex items-center justify-center swiper-zoom-slide">
      <TransformWrapper
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: true }}
        minScale={1}
        maxScale={5}
        centerOnInit
        limitToBounds={false}
        onTransformed={(ref) => {
          if (idx === activeIndex) {
            currentScaleRef.current = ref.state.scale;
            if (swiper) {
              const allow = ref.state.scale <= 1.0001;
              if (swiper.allowTouchMove !== allow) swiper.allowTouchMove = allow;
            }
          }
        }}
      >
        {({ zoomIn, zoomOut, resetTransform, centerView }) => {
          controlsRef.current[idx] = { zoomIn, zoomOut, resetTransform, centerView };
          return (
            <TransformComponent
              wrapperClass="grid place-items-center !w-full !h-full"
              contentClass="grid place-items-center !w-full !h-full"
            >
              <div className="w-full h-full flex items-center justify-center" style={{ cursor: 'grab' }}>
                <div
                  className="transition-transform duration-300"
                  style={{ transform: `rotate(${rotation}deg)` }}
                  data-zoom-content
                >
                  {isGif ? (
                    hasAnim ? (
                      <img
                        src={paused ? poster : anim}
                        data-original-src={src}
                        alt={alt ? `${alt} (${idx + 1}/${total})` : `Image ${idx + 1}`}
                        style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                        className="w-auto h-auto block select-none object-contain"
                        draggable={false}
                        loading="eager"
                        decoding="async"
                        onError={(e) => {
                          const t = e.currentTarget;
                          const o = t.getAttribute('data-original-src');
                          if (o && t.src !== o) { t.src = o; t.removeAttribute('data-original-src'); }
                        }}
                      />
                    ) : (
                      <img
                        src={displaySrc}
                        data-original-src={src}
                        alt={alt ? `${alt} (${idx + 1}/${total})` : `Image ${idx + 1}`}
                        style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                        className="w-auto h-auto block select-none object-contain"
                        draggable={false}
                        loading="eager"
                        decoding="async"
                        onError={(e) => {
                          const t = e.currentTarget;
                          const o = t.getAttribute('data-original-src');
                          if (o && t.src !== o) { t.src = o; t.removeAttribute('data-original-src'); }
                        }}
                      />
                    )
                  ) : (
                    <img
                      src={displaySrc}
                      data-original-src={src}
                      alt={alt ? `${alt} (${idx + 1}/${total})` : `Image ${idx + 1}`}
                      style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                      className="w-auto h-auto block select-none object-contain"
                      draggable={false}
                      loading="eager"
                      decoding="async"
                      onError={(e) => {
                        const t = e.currentTarget;
                        const o = t.getAttribute('data-original-src');
                        if (o && t.src !== o) { t.src = o; t.removeAttribute('data-original-src'); }
                      }}
                    />
                  )}
                </div>
              </div>
            </TransformComponent>
          );
        }}
      </TransformWrapper>
    </div>
  );
}
