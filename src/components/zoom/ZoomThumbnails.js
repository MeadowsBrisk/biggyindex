"use client";
import React from 'react';
import { proxyImage } from '@/lib/images';
import cn from '@/app/cn';

/* Minimal thumbnail strip extracted from ImageZoomPreview.
   Props:
   - images: string[]
   - activeIndex: number
   - onSelect: (idx:number)=>void
   - useProxy: boolean to enable/disable proxying
   - isUltrawide/isSuperwide: layout flags for sizing
   - show: boolean (controls opacity)
   - alt: string (base alt text)
*/
export default function ZoomThumbnails({ images, activeIndex, onSelect, useProxy = true, isUltrawide, isSuperwide, show, alt }) {
  if (!Array.isArray(images) || images.length <= 1) return null;
  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-2 z-[10030] flex justify-center pointer-events-none select-none',
        'transition-opacity duration-300',
        show ? 'opacity-100' : 'opacity-0'
      )}
      data-thumbs
    >
      <div
        className={cn(
          'pointer-events-auto flex max-w-[90vw] overflow-x-auto rounded-xl px-3 py-2 gap-3 shadow-md',
          'bg-black/60', // ~60% opacity dark background
          'scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent'
        )}
      >
        {images.map((src, i) => {
          const isActive = i === activeIndex;
          const size = isSuperwide ? 148 : isUltrawide ? 132 : 96;
          // Use shared proxyImage for consistent URL generation across all domains
          const thumbSrc = useProxy ? proxyImage(src) : src;
          return (
            <button
              key={i + src}
              type="button"
              aria-label={alt ? `${alt} thumbnail ${i + 1}` : `Thumbnail ${i + 1}`}
              onClick={() => onSelect(i)}
              className={cn(
                'group relative shrink-0 rounded-md overflow-hidden border focus:outline-none focus-visible:ring-2 ring-offset-1 ring-offset-black/40 transition-shadow',
                isActive ? 'border-white ring-2 ring-white/70 shadow-lg shadow-black/40' : 'border-white/25 hover:border-white/60'
              )}
              style={{ width: size, height: size }}
            >
              <img
                src={thumbSrc}
                alt={alt ? `${alt} thumbnail ${i + 1}` : `Thumbnail ${i + 1}`}
                className={cn('object-cover w-full h-full transition-transform', isActive ? 'scale-105' : 'group-hover:scale-105')}
                draggable={false}
                loading="lazy"
                decoding="async"
              />
              <span
                className={cn(
                  'absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-sm',
                  isActive ? 'bg-white text-gray-900' : 'bg-black/50 text-white'
                )}
              >{i + 1}</span>
              {isActive && <span className="absolute inset-0 ring-2 ring-white/70 rounded-md pointer-events-none" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
