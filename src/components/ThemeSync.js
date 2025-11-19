"use client";
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { darkModeAtom, pauseGifsAtom } from '@/store/atoms';
import { loadGifMap, getGifEntry } from '@/lib/gifAssets';
import { proxyImage } from '@/lib/images';

export default function ThemeSync() {
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
    const _ = window.getComputedStyle(css).opacity;

    // Re-enable transitions
    setTimeout(() => {
      document.head.removeChild(css);
    }, 0);
  }, [darkMode]);

  // Global GIF pause using precomputed posters (no /api/image-proxy, no canvas capture)
  useEffect(() => {
    const isGif = (u) => /\.gif($|[?#])/i.test(u || '');
    let cancelled = false;
    let mo; // mutation observer

    function swapToPoster(img) {
      if (!img || !isGif(img.currentSrc || img.src)) return;
      if (!img.dataset.origSrc) img.dataset.origSrc = img.currentSrc || img.src;
      const entry = getGifEntry(img.dataset.origSrc);
      if (!entry || !entry.poster) return; // no processed asset yet
      try {
        const abs = entry.poster.startsWith('http') ? entry.poster : new URL(entry.poster, window.location.origin).href;
        img.src = proxyImage(abs);
        img.dataset.gifPausedMode = 'poster';
      } catch {}
    }

    function restore(img) {
      const orig = img?.dataset?.origSrc;
      if (!orig) return;
      try {
        const hashIdx = orig.indexOf('#');
        const base = hashIdx >= 0 ? orig.slice(0, hashIdx) : orig;
        const sep = base.includes('?') ? '&' : '?';
        img.src = `${base}${sep}play=${Date.now()}`; // force restart
      } catch { img.src = orig; }
      delete img.dataset.origSrc;
      delete img.dataset.gifPausedMode;
    }

    async function applyPause() {
      await loadGifMap().catch(() => {});
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
            if (n.tagName === 'IMG') swapToPoster(n);
            else if (n.querySelectorAll) n.querySelectorAll('img').forEach(swapToPoster);
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
      return () => { cancelled = true; mo && mo.disconnect(); };
    }

    // Unpause: restore originals
    Array.from(document.images).forEach(restore);
    return () => { cancelled = true; mo && mo.disconnect(); };
  }, [pauseGifs]);

  return null;
}
