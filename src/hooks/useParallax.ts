'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

type UseParallaxOptions = {
    strength?: number;
    axis?: 'y' | 'x';
    enabled?: boolean;
    respectReducedMotion?: boolean;
    root?: RefObject<HTMLElement | null>;
};

type UseParallaxReturn = {
    ref: RefObject<HTMLElement | null>;
    /** Static style helpers (transform is applied imperatively for perf) */
    style: CSSProperties;
    /** True once the initial parallax transform has been applied */
    isReady: boolean;
};

export function useParallax(options: UseParallaxOptions = {}): UseParallaxReturn {
    const { strength = 60, axis = 'y', enabled = true, respectReducedMotion = true, root } = options;

    const ref = useRef<HTMLElement>(null);
    const rafIdRef = useRef<number | null>(null);
    const activeRef = useRef<boolean>(false);
    const [isReady, setIsReady] = useState(false);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;

        const w = typeof window !== 'undefined' ? window : undefined;
        if (!w) return;

        const reduce =
            respectReducedMotion &&
            w.matchMedia &&
            w.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isEnabled = enabled && !reduce;

        // Reset transform if disabled
        if (!isEnabled) {
            el.style.transform = 'translate3d(0,0,0) scale(1.1)';
            setIsReady(true);
            return;
        }

        // Ensure the element does not cause layout thrash
        el.style.willChange = el.style.willChange || 'transform';
        const scrollTarget = root?.current || w;

        const update = (force = false) => {
            rafIdRef.current = null;
            if (!force && !activeRef.current) return;
            const rect = el.getBoundingClientRect();
            // Use container height if available, otherwise viewport height
            const vh = root?.current ? root.current.clientHeight : (w.innerHeight || 1);

            // Distance of element center from viewport center (scrolling container acts as viewport)
            // Note: getBoundingClientRect is always relative to the viewport. 
            // If root is a specific container, we might ideally strictly calculate relative to it,
            // but for full-screen overlays, viewport rect works well.
            const center = rect.top + rect.height / 2;
            const viewCenter = root?.current
                ? root.current.getBoundingClientRect().top + vh / 2
                : vh / 2;

            const distanceFromCenter = center - viewCenter;
            // Normalize roughly to -1..1 across ~one viewport height
            const progress = distanceFromCenter / vh;
            const offset = Math.max(-strength, Math.min(strength, -progress * strength));
            const x = axis === 'x' ? offset : 0;
            const y = axis === 'y' ? offset : 0;
            el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(1.1)`;
        };

        const schedule = () => {
            if (rafIdRef.current != null) return;
            rafIdRef.current = w.requestAnimationFrame(() => update());
        };

        const onScroll = () => schedule();
        const onResize = () => schedule();

        const io = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    if (entry.target === el) {
                        activeRef.current = entry.isIntersecting;
                        schedule();
                    }
                }
            },
            { root: root?.current || null, rootMargin: '0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
        );
        io.observe(el);

        // Force initial update regardless of intersection state
        update(true);
        // Wait for the browser to paint the transform before revealing
        w.requestAnimationFrame(() => {
            w.requestAnimationFrame(() => {
                setIsReady(true);
            });
        });

        scrollTarget.addEventListener('scroll', onScroll, { passive: true });
        w.addEventListener('resize', onResize, { passive: true });

        return () => {
            io.disconnect();
            scrollTarget.removeEventListener('scroll', onScroll);
            w.removeEventListener('resize', onResize);
            if (rafIdRef.current != null) {
                w.cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, [axis, enabled, respectReducedMotion, strength, root]); // Added root dep

    return { ref, style: { willChange: 'transform' }, isReady };
}

export default useParallax;
