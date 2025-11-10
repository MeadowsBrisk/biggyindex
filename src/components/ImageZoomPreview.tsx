"use client";
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Keyboard, EffectFade } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-fade';
import cn from '@/app/cn';
import { useAtomValue } from 'jotai';
import { pauseGifsAtom } from '@/store/atoms';
import { proxyImage } from '@/lib/images';
import { useScreenSize } from '@/hooks/useScreenSize';
import { RotateButton, ZoomButton, ArrowLeftIcon, ArrowRightIcon } from '@/components/zoom/ZoomButtons';
import ZoomSlide from '@/components/zoom/ZoomSlide';
import ZoomThumbnails from '@/components/zoom/ZoomThumbnails';
import { useTranslations } from 'next-intl';

/* ImageZoomPreview */
type ImageZoomPreviewProps = {
  imageUrl?: string;
  imageUrls?: string[];
  alt?: string;
  openSignal?: any;
  hideTrigger?: boolean;
  useProxy?: boolean;
  onOpenChange?: (open: boolean) => void;
  guardKey?: any;
};

export default function ImageZoomPreview({ imageUrl, imageUrls, alt = '', openSignal = null, hideTrigger = false, useProxy = true, onOpenChange, guardKey = null }: ImageZoomPreviewProps) {
  const t = useTranslations('Zoom');
  // Collect images list
  const images = useMemo(() => (Array.isArray(imageUrls) && imageUrls.length ? imageUrls : (imageUrl ? [imageUrl] : [])), [imageUrl, imageUrls]);
  const total = images.length;

  // Modal state
  const [open, setOpen] = useState(false);
  const hasPushedRef = useRef(false);
  const closedByBackRef = useRef(false);
  // Notify parent when open state changes (skip initial mount to avoid false-close loops)
  const didNotifyRef = useRef(false);
  useEffect(() => {
    if (typeof onOpenChange !== 'function') return;
    if (!didNotifyRef.current) { didNotifyRef.current = true; return; }
    onOpenChange(open);
  }, [open, onOpenChange]);
  // Back button handling: when opened, push a state; pop closes preview only
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (open && window.history) {
      try {
        window.history.pushState({ __imagePreview: true }, '', window.location.href);
        hasPushedRef.current = true;
      } catch {}
    }
    const onPop = (e: PopStateEvent) => {
      if (open) {
        closedByBackRef.current = true;
        setOpen(false);
        // prevent further handling by overlay if possible
        try { e?.stopImmediatePropagation?.(); } catch {}
      }
    };
    if (open) window.addEventListener('popstate', onPop, { once: true });
    return () => {
      if (open) window.removeEventListener('popstate', onPop);
    };
  }, [open]);

  // When closing without using Back (e.g., tapping X), pop the extra state we pushed
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!open && hasPushedRef.current) {
      if (closedByBackRef.current) {
        // Already balanced by user pressing Back
        closedByBackRef.current = false;
        hasPushedRef.current = false;
        return;
      }
      try {
        // Notify overlay to ignore the next popstate
        window.dispatchEvent(new CustomEvent('lb:zoom-will-balance-back'));
        window.history.back();
      } catch {}
      hasPushedRef.current = false;
    }
  }, [open]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [swiper, setSwiper] = useState<any>(null);
  // When openSignal changes, open modal and optionally jump to provided index
  const pendingIndexRef = useRef<number | null>(null);
  const lastSignalRef = useRef<any>(null);
  useEffect(() => {
    if (openSignal == null) return;
    // Ignore signals from a different parent context (e.g., previous item)
    if (guardKey != null && typeof openSignal === 'object' && openSignal !== null && openSignal.guard != null && openSignal.guard !== guardKey) return;
    // Avoid processing the exact same object / timestamp twice
    if (typeof openSignal === 'object') {
      if (lastSignalRef.current && lastSignalRef.current === openSignal) return;
      lastSignalRef.current = openSignal;
    } else {
      if (lastSignalRef.current === openSignal) return;
      lastSignalRef.current = openSignal;
    }
    setOpen(true);
    // Support object payload: { ts, index }
    if (typeof openSignal === 'object' && openSignal !== null && typeof openSignal.index === 'number') {
      const idx = Math.max(0, Math.min(openSignal.index, (images.length || 1) - 1));
      setActiveIndex(idx);
      if (swiper) {
        try { swiper.slideTo(idx, 0); } catch {}
      } else {
        pendingIndexRef.current = idx;
      }
    }
  }, [openSignal, swiper, images.length, guardKey]);

  const globalPause = useAtomValue(pauseGifsAtom);

  // Per-GIF pause overrides (undefined means follow global pause)
  const [pausedGif, setPausedGif] = useState<Record<number, boolean>>({});
  const [gifDecodeRequested, setGifDecodeRequested] = useState<Record<number, boolean>>({});
  const toggleGif = useCallback((idx: number) => {
    setPausedGif(p => {
      const cur = p[idx];
      const effective = (cur == null) ? (globalPause === true) : (cur === true);
      // If we're initiating a pause (effective currently playing) request decoding lazily.
      if (!effective) {
        setGifDecodeRequested(d => (d[idx] ? d : { ...d, [idx]: true }));
      }
      return { ...p, [idx]: !effective };
    });
  }, [globalPause]);
  useEffect(() => { if (open) setPausedGif({}); }, [open, images]);

  // Active slide & swiper ref
  const [activeIndex, setActiveIndex] = useState(0);
  // (removed duplicate swiper declaration)
  // Effective paused state for the active slide (strict boolean)
  const isPausedActive = useMemo(() => ((pausedGif[activeIndex] ?? globalPause) === true), [pausedGif, globalPause, activeIndex]);

  // Rotation state per slide
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const rotationFor = useCallback((i: number) => (rotations[i] || 0) % 360, [rotations]);
  const rotate = useCallback((delta: number) => setRotations(r => ({ ...r, [activeIndex]: (((r[activeIndex] || 0) + delta + 360) % 360) })), [activeIndex]);

  // Zoom controls storage
  const controlsRef = useRef<Record<number, any>>({});
  const currentScaleRef = useRef<number>(1);

  // GIF detection for active slide
  const currentIsGif = useMemo(() => {
    const src = images[activeIndex];
    return typeof src === 'string' && /\.gif($|[?#])/i.test(src);
  }, [images, activeIndex]);

  // Proxy helper for images (GIFs proxied via API endpoint when enabled)
  const toBase64Url = useCallback((s: string) => { try { const utf8 = encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(Number('0x' + p1))); return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch { return ''; } }, []);
  const proxify = useCallback((src: string) => {
    if (typeof src !== 'string') return src;
    const lower = src.toLowerCase();
    if (lower.includes('.gif')) return useProxy ? `/api/image-proxy/${toBase64Url(src)}` : src;
    if (!useProxy) return src;
    return proxyImage(src);
  }, [useProxy, toBase64Url]);

  // Preload non-GIF images after opening
  useEffect(() => {
    if (!open || images.length <= 1) return;
    images.filter(s => typeof s === 'string' && s && !/\.gif($|[?#])/i.test(s)).forEach((src: string) => {
      const i = new Image(); i.decoding = 'async'; i.loading = 'eager'; i.src = proxify(src);
    });
  }, [open, images, proxify]);

  // Navigation helper (debounced)
  const lastNavRef = useRef<number>(0);
  const navigate = useCallback((dir: number) => {
    if (!swiper) return;
    const now = performance.now();
    if (now - lastNavRef.current < 180) return;
    lastNavRef.current = now;
    const cur = (swiper as any).activeIndex || 0;
    const next = dir > 0 ? Math.min(cur + 1, total - 1) : Math.max(cur - 1, 0);
    if (next !== cur) (swiper as any).slideTo(next);
  }, [swiper, total]);

  // Keyboard events
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowLeft') navigate(-1);
      else if (e.key === 'ArrowRight') navigate(1);
      else if (e.key === '+') (controlsRef as any).current[activeIndex]?.zoomIn?.();
      else if (e.key === '-') (controlsRef as any).current[activeIndex]?.zoomOut?.();
      else if (e.key === '0') { const c = (controlsRef as any).current[activeIndex]; c?.resetTransform?.(); c?.centerView?.(1); setRotations(r => ({ ...r, [activeIndex]: 0 })); }
      else if (e.key === 'r') rotate(90); else if (e.key === 'R') rotate(-90);
      else if (e.code === 'Space') { if (currentIsGif) { e.preventDefault(); toggleGif(activeIndex); } }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, activeIndex, rotate, navigate, currentIsGif, toggleGif]);

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
    window.addEventListener('pointermove', onMove, { passive: true } as any);
    window.addEventListener('keydown', onMove, { passive: true } as any);
    return () => {
      window.removeEventListener('pointermove', onMove as any);
      window.removeEventListener('keydown', onMove as any);
      if (idleTimer.current != null) clearTimeout(idleTimer.current);
    };
  }, [open, userActive]);

  // Close / open helpers
  const closePreview = useCallback(() => setOpen(false), []);
  const togglePreview = useCallback(() => setOpen(o => !o), []);

  // Screen flags for thumbnails sizing
  const { isUltrawide, isSuperwide } = useScreenSize();

  // Trigger button (hidden when hideTrigger)
  const trigger = !hideTrigger && (
    <motion.button
      type="button"
      aria-label={t('triggerAria')}
      onClick={togglePreview}
      whileHover={{ scale: 1.06, rotate: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        'relative z-10 inline-flex items-center justify-center rounded-full border',
        'bg-white/90 dark:bg-gray-800/90 border-gray-200 dark:border-gray-700',
        'text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700',
        'w-8 h-8 shadow-sm hover:shadow transform-gpu'
      )}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
    </motion.button>
  );

  // Portal body (modal)
  const portal = mounted && typeof document !== 'undefined' && createPortal(
    <AnimatePresence initial={false}>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={closePreview}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={alt || t('imagePreview')}
            className="fixed inset-0 z-[10001] flex flex-col touch-none select-none"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Top bar */}
            <div className={cn('pointer-events-none absolute top-2 left-0 right-0 flex items-start justify-between px-2 sm:px-4 z-[10040]', 'transition-opacity duration-300', showUI ? 'opacity-100' : 'opacity-0')}>
              <div className="flex items-center gap-2 pointer-events-auto">
                <div className="flex items-center gap-1 rounded-full bg-black/35 backdrop-blur-md border border-white/10 px-2 py-1 shadow-sm">
                  <RotateButton dir="left" onClick={() => rotate(-90)} />
                  <RotateButton dir="right" onClick={() => rotate(90)} />
                  <ZoomButton small icon="+" label={t('zoomIn')} onClick={() => (controlsRef as any).current[activeIndex]?.zoomIn?.()} />
                  <ZoomButton small icon="-" label={t('zoomOut')} onClick={() => (controlsRef as any).current[activeIndex]?.zoomOut?.()} />
                  <ZoomButton small icon="↺" label={t('reset')} onClick={() => { const c = (controlsRef as any).current[activeIndex]; c?.resetTransform?.(); c?.centerView?.(1); setRotations(r => ({ ...r, [activeIndex]: 0 })); }} />
                  {currentIsGif && (
                    <button
                      type="button"
                      aria-label={isPausedActive ? t('playGif') : t('pauseGif')}
                      onClick={() => toggleGif(activeIndex)}
                      className="inline-flex items-center justify-center px-2 h-8 rounded-md text-xs font-medium bg-white/15 hover:bg-white/25 text-white transition-colors"
                    >
                      {isPausedActive ? t('play') : t('pause')}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pointer-events-auto">
                {total > 1 && (
                  <span className="inline-flex items-center gap-1 font-mono bg-black/45 px-2 py-1 rounded-md backdrop-blur-md border border-white/10 text-xs sm:text-sm text-white/90">{activeIndex + 1}<span className="opacity-50">/</span>{total}</span>
                )}
                <button
                  aria-label={t('closePreview')}
                  onClick={closePreview}
                  className="group relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-black/45 backdrop-blur-md text-gray-100 border border-white/15 shadow-sm hover:bg-black/65"
                >
                  <span className="absolute inset-0 rounded-full group-active:scale-90 transition-transform" />
                  <svg viewBox="0 0 24 24" className="w-5 h-5" stroke="currentColor" strokeWidth={2} fill="none"><path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>

            {/* Viewer */}
            <div
              className="relative flex-1 min-h-0"
              onClick={(e) => {
                setShowUI(true);
                try {
                  const t = (e as any).target;
                  if ((currentScaleRef as any).current <= 1.0001 && !t.closest('button') && !t.closest('[data-zoom-content]') && !t.closest('[data-nav]') && !t.closest('[data-thumbs]')) {
                    closePreview();
                  }
                } catch {}
              }}
            >
              <div className={cn('pointer-events-none fixed inset-x-0 top-0 h-20 bg-gradient-to-b from-black/65 to-transparent transition-opacity duration-500', showUI ? 'opacity-100' : 'opacity-0')} />
              <div className={cn('pointer-events-none fixed inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-500', showUI ? 'opacity-100' : 'opacity-0')} />
              <Swiper
                modules={[Keyboard, EffectFade]}
                effect="fade"
                fadeEffect={{ crossFade: true }}
                speed={360}
                spaceBetween={0}
                slidesPerView={1}
                allowTouchMove
                keyboard={{ enabled: true }}
                onSwiper={(sw: any) => { setSwiper(sw); if (pendingIndexRef.current != null) { try { (sw as any).slideTo(pendingIndexRef.current, 0); } catch {} pendingIndexRef.current = null; } }}
                onSlideChange={(sw: any) => {
                  const idx = (sw as any).activeIndex || 0;
                  setActiveIndex(idx);
                  try { const c = (controlsRef as any).current[idx]; c?.resetTransform?.(); c?.centerView?.(1); } catch {}
                  setShowUI(true);
                }}
                className="w-full h-full"
              >
                {images.map((src: string, idx: number) => (
                  <SwiperSlide key={idx + src} className="!h-full">
                    <ZoomSlide
                      src={src}
                      idx={idx}
                      alt={alt}
                      total={total}
                      activeIndex={activeIndex}
                      rotation={rotationFor(idx)}
                      proxify={proxify}
                      swiper={swiper}
                      controlsRef={controlsRef}
                      currentScaleRef={currentScaleRef}
                      paused={(pausedGif[idx] ?? globalPause) === true}
                    />
                  </SwiperSlide>
                ))}
              </Swiper>
              {total > 1 && (
                <>
                  <button data-nav aria-label={t('prevImage')} disabled={activeIndex <= 0} onClick={() => navigate(-1)} className={cn('hidden md:flex group absolute left-0 top-0 h-full w-32 items-center justify-start pl-4 z-[10020]', activeIndex <= 0 && 'opacity-40 cursor-not-allowed')}>
                    <span className={cn('rounded-full p-5 backdrop-blur-md border shadow-sm bg-white/85 dark:bg-gray-900/70 text-gray-900 dark:text-gray-100 transition-colors', activeIndex > 0 ? 'group-hover:ring-2 group-hover:ring-white/60' : 'bg-white/30 dark:bg-gray-700/30 border-transparent text-gray-400 dark:text-gray-500')}><ArrowLeftIcon className="w-8 h-8 group-hover:-translate-x-1 transition-transform" /></span>
                  </button>
                  <button data-nav aria-label={t('nextImage')} disabled={activeIndex >= total - 1} onClick={() => navigate(1)} className={cn('hidden md:flex group absolute right-0 top-0 h-full w-32 items-center justify-end pr-4 z-[10020]', activeIndex >= total - 1 && 'opacity-40 cursor-not-allowed')}>
                    <span className={cn('rounded-full p-5 backdrop-blur-md border shadow-sm bg-white/85 dark:bg-gray-900/70 text-gray-900 dark:text-gray-100 transition-colors', activeIndex < total - 1 ? 'group-hover:ring-2 group-hover:ring-white/60' : 'bg-white/30 dark:bg-gray-700/30 border-transparent text-gray-400 dark:text-gray-500')}><ArrowRightIcon className="w-8 h-8 group-hover:translate-x-1 transition-transform" /></span>
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            <ZoomThumbnails
              images={images}
              activeIndex={activeIndex}
              onSelect={(i: number) => { try { swiper && (swiper as any).slideTo(i); } catch {} setShowUI(true); }}
              proxify={proxify}
              isUltrawide={isUltrawide}
              isSuperwide={isSuperwide}
              show={showUI}
              alt={alt}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>, document.body);

  return (
    <div className="pointer-events-auto">
      {trigger}
      {portal}
    </div>
  );
}
