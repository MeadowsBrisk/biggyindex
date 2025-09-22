"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { proxyImage } from '@/lib/images';

function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => (p[0] || '').toUpperCase()).join('') || '?';
}

export default function SellerAvatarTooltip({ sellerName, sellerImageUrl, children }) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const showDelayRef = useRef(null);
  const rafRef = useRef(null);

  const updatePosition = useCallback((e) => {
    // Position the bubble so its bottom-center is at the cursor (then translateY(-100%) puts it above)
    const clientX = e?.clientX ?? 0;
    const clientY = e?.clientY ?? 0;
    try {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const margin = 12;
      const cx = Math.max(margin, Math.min(clientX, vw - margin));
      // Put the anchor just above the cursor by a small gap so the tail can sit nicely
      const cy = Math.max(margin - 40, clientY - 20);
      setPosition({ x: cx, y: cy });
    } catch {
      setPosition({ x: clientX, y: clientY - 8 });
    }
  }, []);

  const handleMouseEnter = useCallback((e) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    // Set initial position immediately
    updatePosition(e);
    // Small delay before showing to avoid flicker on quick mouse-overs
    showDelayRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 200);
  }, [updatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (showDelayRef.current) {
      clearTimeout(showDelayRef.current);
      showDelayRef.current = null;
    }
    // Smooth fade-out delay
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  }, []);

  const handleMouseMove = useCallback((e) => {
    // Throttle with rAF to keep it smooth and avoid layout thrash
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
      <span ref={triggerRef} className="inline">
        {children}
      </span>

      {mounted && isVisible && createPortal(
        (
          <AnimatePresence>
            <div
              style={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%)', // bottom-center at cursor -> bubble above
                pointerEvents: 'none',
                zIndex: 2147483647, // above everything
                maxWidth: 'calc(100vw - 24px)',
              }}
              className="will-change-transform"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="relative flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-2 py-1 shadow-xl shadow-slate-900/15 backdrop-blur-md dark:border-white/20 dark:bg-slate-800/95 dark:shadow-black/40">
                  <div className="relative h-[150px] w-[150px] shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700 ring-2 ring-slate-200 dark:ring-white/10">
                    {sellerImageUrl ? (
                      <Image
                        src={proxyImage(sellerImageUrl)}
                        alt={sellerName}
                        fill
                        className="object-cover"
                        sizes="150px"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-semibold uppercase text-slate-400 dark:text-slate-500">
                        {getInitials(sellerName)}
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="max-w-[140px] truncate text-sm font-semibold text-slate-900 dark:text-white">{sellerName}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Seller</p>
                  </div>
                  {/* Speech bubble tail pointing down */}
                  <div className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white/95 dark:border-white/20 dark:bg-slate-800/95" />
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
