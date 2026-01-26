"use client";
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { darkModeAtom, pauseGifsAtom } from '@/store/atoms';
import { getGifEntry } from '@/lib/ui/gifAssets';

/**
 * Syncs theme and GIF pause state across the app.
 * Manages dark mode CSS classes and handles GIF pause/play globally.
 */
export default function ThemeSync(): null {
  const darkMode = useAtomValue(darkModeAtom);
  const pauseGifs = useAtomValue(pauseGifsAtom);

  // Theme sync
  useEffect(() => {
    // Disable transitions globally to prevent lag/waves when switching themes
    const css = document.createElement('style');
    css.appendChild(document.createTextNode(`* {
       -webkit-transition: none !important;
       -moz-transition: none !important;
       -o-transition: none !important;
       -ms-transition: none !important;
       transition: none !important;
    }`));
    document.head.appendChild(css);

    const themeValue = darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', themeValue);
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    
    const root = document.documentElement;
    if (darkMode) {
      root.style.setProperty('--background', '#0a0a0a');
      root.style.setProperty('--foreground', '#ededed');
    } else {
      root.style.setProperty('--background', '#ffffff');
      root.style.setProperty('--foreground', '#171717');
    }

    // Force reflow to ensure the class change is applied while transitions are disabled
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = window.getComputedStyle(css).opacity;

    // Re-enable transitions
    setTimeout(() => {
      document.head.removeChild(css);
    }, 0);
  }, [darkMode]);

  // Global GIF pause using R2 posters
  useEffect(() => {
    const isGif = (u: string | null | undefined): boolean => /\.gif($|[?#])/i.test(u || '');
    let cancelled = false;
    let mo: MutationObserver | undefined;

    function swapToPoster(img: HTMLImageElement) {
      if (!img || !isGif(img.currentSrc || img.src)) return;
      if (!img.dataset.origSrc) img.dataset.origSrc = img.currentSrc || img.src;
      const entry = getGifEntry(img.dataset.origSrc);
      if (!entry || !entry.poster) return;
      // entry.poster is already an absolute R2 URL
      img.src = entry.poster;
      img.dataset.gifPausedMode = 'poster';
    }

    function restore(img: HTMLImageElement) {
      const orig = img?.dataset?.origSrc;
      if (!orig) return;
      try {
        const hashIdx = orig.indexOf('#');
        const base = hashIdx >= 0 ? orig.slice(0, hashIdx) : orig;
        const sep = base.includes('?') ? '&' : '?';
        img.src = `${base}${sep}play=${Date.now()}`; // force restart
      } catch { 
        img.src = orig; 
      }
      delete img.dataset.origSrc;
      delete img.dataset.gifPausedMode;
    }

    function applyPause() {
      if (cancelled) return;
      Array.from(document.images).forEach(swapToPoster);
    }

    if (pauseGifs) {
      applyPause();
      // Observe new images while paused
      mo = new MutationObserver((muts) => {
        muts.forEach((m) => {
          m.addedNodes.forEach((n) => {
            if (!(n instanceof HTMLElement)) return;
            if (n.tagName === 'IMG') swapToPoster(n as HTMLImageElement);
            else if (n.querySelectorAll) {
              n.querySelectorAll('img').forEach((el) => swapToPoster(el as HTMLImageElement));
            }
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
      return () => { cancelled = true; mo?.disconnect(); };
    }

    // Unpause: restore originals
    Array.from(document.images).forEach(restore);
    return () => { cancelled = true; mo?.disconnect(); };
  }, [pauseGifs]);

  return null;
}
