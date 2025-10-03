"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { proxyImage } from '@/lib/images';

export default function ItemImageTooltip({ imageUrl, itemName, fallbackText, children }) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const showDelayRef = useRef(null);
  const rafRef = useRef(null);
  
  // Memoize proxied URL to avoid recalculation on every render
  const proxiedImageUrl = useMemo(() => imageUrl ? proxyImage(imageUrl) : null, [imageUrl]);

  const updatePosition = useCallback((e) => {
    const clientX = e?.clientX ?? 0;
    const clientY = e?.clientY ?? 0;
    try {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
      const margin = 12;
      const cx = Math.max(margin, Math.min(clientX, vw - margin));
      const cy = Math.max(margin, Math.min(clientY, vh - margin));
      setPosition({ x: cx, y: cy });
    } catch {
      setPosition({ x: clientX, y: clientY });
    }
  }, []);

  const handleMouseEnter = useCallback((e) => {
    if (!imageUrl && !fallbackText) return; // nothing to show
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    updatePosition(e);
    showDelayRef.current = setTimeout(() => setIsVisible(true), 200);
  }, [imageUrl, fallbackText, updatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (showDelayRef.current) { clearTimeout(showDelayRef.current); showDelayRef.current = null; }
    hideTimeoutRef.current = setTimeout(() => setIsVisible(false), 100);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => updatePosition(e));
  }, [updatePosition]);

  useEffect(() => {
    setMounted(true);
    const trigger = triggerRef.current;
    if (!trigger) return;
    trigger.addEventListener('mouseenter', handleMouseEnter);
    trigger.addEventListener('mouseleave', handleMouseLeave);
    trigger.addEventListener('mousemove', handleMouseMove);
    return () => {
      trigger.removeEventListener('mouseenter', handleMouseEnter);
      trigger.removeEventListener('mouseleave', handleMouseLeave);
      trigger.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      if (showDelayRef.current) clearTimeout(showDelayRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseEnter, handleMouseLeave, handleMouseMove]);

  return (
    <>
      <span ref={triggerRef} className="inline-block">
        {children}
      </span>
      {mounted && isVisible && (imageUrl || fallbackText) && createPortal(
        (
          <AnimatePresence>
            <div
              style={{ position: 'fixed', left: position.x, top: position.y, transform: 'translate(-100%, -50%) translateX(-20px)', pointerEvents: 'none', zIndex: 2147483647, maxWidth: 'calc(100vw - 24px)' }}
              className="will-change-transform"
            >
              <motion.div initial={{ opacity: 0, scale: 0.9, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}>
                <div className="relative rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl shadow-slate-900/15 backdrop-blur-md dark:border-white/20 dark:bg-slate-800/95 dark:shadow-black/40">
                  {proxiedImageUrl ? (
                    <div className="relative h-[180px] w-[180px] overflow-hidden rounded-lg bg-slate-100 ring-2 ring-slate-200 dark:bg-slate-700 dark:ring-white/10 sm:h-[300px] sm:w-[300px]">
                      <img src={proxiedImageUrl} alt={itemName || 'Item image'} loading="eager" decoding="async" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="max-w-[260px] rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/95 dark:text-slate-200 dark:ring-white/20">
                      {fallbackText}
                    </div>
                  )}
                  {/* Right-side speech bubble tail using CSS borders (no diamond overlap) */}
                  <div className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2">
                    {/* Outline (border) triangles: slightly larger behind */}
                    <div className="absolute inset-0 hidden dark:block" style={{ width: 0, height: 0, borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderLeft: '9px solid rgba(255,255,255,0.2)' }} />
                    <div className="absolute inset-0 block dark:hidden" style={{ width: 0, height: 0, borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderLeft: '9px solid rgb(226,232,240)' }} />
                    {/* Fill triangles: on top, matching bubble bg */}
                    <div className="relative hidden dark:block" style={{ width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '8px solid rgba(30,41,59,0.95)' }} />
                    <div className="relative block dark:hidden" style={{ width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '8px solid rgba(255,255,255,0.95)' }} />
                  </div>
                </div>
              </motion.div>
            </div>
          </AnimatePresence>
        ),
        document.body
      )}
    </>
  );
}
