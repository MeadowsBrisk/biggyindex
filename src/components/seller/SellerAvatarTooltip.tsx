"use client";
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { proxyImage } from '@/lib/images';

function getInitials(name?: string | null) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => (p[0] || '').toUpperCase()).join('') || '?';
}

type Props = {
  sellerName?: string | null;
  sellerImageUrl?: string | null;
  children: React.ReactNode;
};

export default function SellerAvatarTooltip({ sellerName, sellerImageUrl, children }: Props): React.ReactElement {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const showDelayRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  
  // Tooltip avatar is 48px displayed, request 96px for 2x DPR
  const proxiedImageUrl = useMemo(() => sellerImageUrl ? proxyImage(sellerImageUrl, 96) : null, [sellerImageUrl]);

  const updatePosition = useCallback((e?: MouseEvent) => {
    const clientX = e?.clientX ?? 0;
    const clientY = e?.clientY ?? 0;
    try {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const margin = 12;
      const cx = Math.max(margin, Math.min(clientX, vw - margin));
      const cy = Math.max(margin - 40, clientY - 20);
      setPosition({ x: cx, y: cy });
    } catch {
      setPosition({ x: clientX, y: clientY - 8 });
    }
  }, []);

  const handleMouseEnter = useCallback((e: MouseEvent) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    updatePosition(e);
    showDelayRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, 200);
  }, [updatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (showDelayRef.current) {
      clearTimeout(showDelayRef.current);
      showDelayRef.current = null;
    }
    hideTimeoutRef.current = window.setTimeout(() => {
      setIsVisible(false);
    }, 100);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => updatePosition(e));
  }, [updatePosition]);

  useEffect(() => {
    setMounted(true);
    const trigger = triggerRef.current;
    if (!trigger) return;

    trigger.addEventListener('mouseenter', handleMouseEnter as EventListener);
    trigger.addEventListener('mouseleave', handleMouseLeave as EventListener);
    trigger.addEventListener('mousemove', handleMouseMove as EventListener);

    return () => {
      trigger.removeEventListener('mouseenter', handleMouseEnter as EventListener);
      trigger.removeEventListener('mouseleave', handleMouseLeave as EventListener);
      trigger.removeEventListener('mousemove', handleMouseMove as EventListener);
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
                transform: 'translate(-50%, -100%)',
                pointerEvents: 'none',
                zIndex: 2147483647,
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
                    {proxiedImageUrl ? (
                      <img
                        src={proxiedImageUrl}
                        alt={sellerName || ''}
                        loading="eager"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-semibold uppercase text-slate-400 dark:text-slate-500">
                        {getInitials(sellerName || undefined)}
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="max-w-[140px] truncate text-sm font-semibold text-slate-900 dark:text-white">{sellerName}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Seller</p>
                  </div>
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
