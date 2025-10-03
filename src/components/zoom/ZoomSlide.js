"use client";
import React from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useGifAsset } from '@/lib/gifAssets';
import cn from '@/app/cn';

/* ZoomSlide
 * Props:
 *  - src: image URL (string)
 *  - idx: index (number)
 *  - alt: base alt text
 *  - total: total slides
 *  - activeIndex: currently active index (for locking gestures)
 *  - rotation: degrees number
 *  - proxify: (src)=>string (handles proxy logic including GIF proxy)
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
  proxify,
  swiper,
  controlsRef,
  currentScaleRef,
  paused,
}) {
  const isGif = typeof src === 'string' && /\.gif($|[?#])/i.test(src);
  const { video, posterProxied } = useGifAsset(isGif ? src : null);
  const rawSrc = src;
  const displaySrc = !isGif ? proxify(src) : rawSrc; // non-gif still proxied
  const videoRef = React.useRef(null);
  // sync pause state to video
  React.useEffect(() => {
    if (!videoRef.current) return;
    if (paused) { try { videoRef.current.pause(); } catch {} }
    else { try { videoRef.current.play(); } catch {} }
  }, [paused]);
  // reset playback when slide becomes active to keep smooth
  React.useEffect(() => {
    if (activeIndex !== idx) return;
    if (videoRef.current && !paused) {
      try { videoRef.current.play(); } catch {}
    }
  }, [activeIndex, idx, paused]);

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
                    video ? (
                      <video
                        ref={videoRef}
                        src={video}
                        poster={posterProxied || undefined}
                        autoPlay
                        loop
                        muted
                        playsInline
                        style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                        className="w-auto h-auto block select-none object-contain" />
                    ) : (
                      <img
                        src={displaySrc}
                        alt={alt ? `${alt} (${idx + 1}/${total})` : `Image ${idx + 1}`}
                        style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                        className="w-auto h-auto block select-none object-contain"
                        draggable={false}
                        loading="eager"
                        decoding="async"
                      />
                    )
                  ) : (
                    <img
                      src={displaySrc}
                      alt={alt ? `${alt} (${idx + 1}/${total})` : `Image ${idx + 1}`}
                      style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                      className="w-auto h-auto block select-none object-contain"
                      draggable={false}
                      loading="eager"
                      decoding="async"
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
