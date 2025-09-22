"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const numberFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

function formatCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return numberFormatter.format(value);
  }
  return value?.toString() ?? "0";
}

export default function CategoryTooltip({ categoryName, subcategories, children }) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const showDelayRef = useRef(null);
  const rafRef = useRef(null);

  // Convert subcategories object to sorted array
  const subcategoryList = Object.entries(subcategories || {})
    .map(([name, count]) => ({ name, count: typeof count === 'number' ? count : 0 }))
    .sort((a, b) => b.count - a.count);

  const hasSubcategories = subcategoryList.length > 0;

  const updatePosition = useCallback((e) => {
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

  const handleMouseEnter = useCallback((e) => {
    if (!hasSubcategories) return; // Nothing to show
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    updatePosition(e);
    showDelayRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 200);
  }, [hasSubcategories, updatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (showDelayRef.current) {
      clearTimeout(showDelayRef.current);
      showDelayRef.current = null;
    }
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
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

      {mounted && isVisible && hasSubcategories && createPortal(
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
                <div className="relative rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl shadow-slate-900/15 backdrop-blur-md dark:border-white/20 dark:bg-slate-800/95 dark:shadow-black/40">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-300">
                    {categoryName} subcategories
                  </div>
                  <div className="grid max-h-[280px] grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-300 dark:scrollbar-thumb-white/20">
                    {subcategoryList.map(({ name, count }) => (
                      <div
                        key={name}
                        className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-white/80"
                      >
                        <span className="truncate font-medium">{name}</span>
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                          {formatCount(count)}
                        </span>
                      </div>
                    ))}
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
