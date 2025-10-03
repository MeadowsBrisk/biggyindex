"use client";
import { useEffect, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { pauseGifsAtom } from '@/store/atoms';
import { useGifAsset } from '@/lib/gifAssets';
import { proxyImage } from '@/lib/images';
import cn from '@/app/cn';

// GifMedia simplified: no per-item play/pause button. Uses poster only when global pause active.
export function GifMedia({ url, alt, className, onOpenPreview }) {
  const pauseGlobal = useAtomValue(pauseGifsAtom);
  const { loading, hasEntry, posterProxied, video } = useGifAsset(url);

  // Source selection
  const gifSrc = useMemo(() => proxyImage(url), [url]);
  const posterSrc = useMemo(() => posterProxied || proxyImage(url), [posterProxied, url]);
  const showPoster = pauseGlobal; // only global pause governs poster now

  const Wrapper = onOpenPreview ? 'button' : 'div';

  return (
    <div className={cn('relative w-full h-full group/gif-media', className)}>
      <Wrapper
        type={onOpenPreview ? 'button' : undefined}
        aria-label={onOpenPreview ? (alt ? `Preview ${alt}` : 'Preview image') : undefined}
        onClick={onOpenPreview}
        className={cn(
          'w-full h-full block focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-400 overflow-hidden',
          onOpenPreview && 'cursor-zoom-in'
        )}
      >
        {showPoster ? (
          <img
            src={posterSrc}
            alt={alt || ''}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn(
              'w-full h-full object-cover select-none',
              onOpenPreview && 'cursor-zoom-in transform-gpu transition-transform duration-300 ease-out group-hover:scale-[1.06]'
            )}
          />
        ) : video ? (
          <video
            src={video}
            poster={posterSrc}
            autoPlay
            loop
            muted
            playsInline
            draggable={false}
            className={cn(
              'w-full h-full object-cover select-none',
              onOpenPreview && 'cursor-zoom-in transform-gpu transition-transform duration-300 ease-out group-hover:scale-[1.06]'
            )}
          />
        ) : (
          <img
            src={gifSrc}
            alt={alt || ''}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn(
              'w-full h-full object-cover select-none',
              onOpenPreview && 'cursor-zoom-in transform-gpu transition-transform duration-300 ease-out group-hover:scale-[1.06]'
            )}
          />
        )}
      </Wrapper>

      {/* GIF badge */}
      {hasEntry && (
        <div className="absolute top-1 left-1 flex items-center gap-1 z-20 pointer-events-none select-none">
          <div className="px-1.5 py-0.5 rounded bg-black/55 text-[10px] font-medium text-white tracking-wide">GIF</div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="h-4 w-4 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  );
}
