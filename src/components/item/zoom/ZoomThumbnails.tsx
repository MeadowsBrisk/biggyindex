'use client';

import React from 'react';
import { cx } from '@/lib/cn';

interface ZoomThumbnailsProps {
  images: string[];
  activeIndex: number;
  onSelect: (idx: number) => void;
  show: boolean;
  alt: string;
}

export default function ZoomThumbnails({
  images,
  activeIndex,
  onSelect,
  show,
  alt,
}: ZoomThumbnailsProps) {
  if (!Array.isArray(images) || images.length <= 1) return null;

  return (
    <div
      className={cx(
        'absolute inset-x-0 bottom-2 z-[10030] flex justify-center pointer-events-none select-none',
        'transition-opacity duration-300',
        show ? 'opacity-100' : 'opacity-0',
      )}
      data-thumbs
    >
      <div
        className={cx(
          'pointer-events-auto flex max-w-[90vw] overflow-x-auto rounded-xl px-3 py-2 gap-3 shadow-md',
          'bg-black/60',
          'scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent',
        )}
      >
        {images.map((src, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={i + src}
              type="button"
              aria-label={alt ? `${alt} thumbnail ${i + 1}` : `Thumbnail ${i + 1}`}
              onClick={() => onSelect(i)}
              className={cx(
                'group relative shrink-0 rounded-md overflow-hidden border focus:outline-none focus-visible:ring-2 ring-offset-1 ring-offset-black/40 transition-shadow',
                isActive
                  ? 'border-white ring-2 ring-white/70 shadow-lg shadow-black/40'
                  : 'border-white/25 hover:border-white/60',
              )}
              style={{ width: 96, height: 96 }}
            >
              <img
                src={src}
                alt={alt ? `${alt} thumbnail ${i + 1}` : `Thumbnail ${i + 1}`}
                className={cx(
                  'object-cover w-full h-full transition-transform',
                  isActive ? 'scale-105' : 'group-hover:scale-105',
                )}
                draggable={false}
                loading="lazy"
                decoding="async"
              />
              <span
                className={cx(
                  'absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-sm',
                  isActive ? 'bg-white text-gray-900' : 'bg-black/50 text-white',
                )}
              >
                {i + 1}
              </span>
              {isActive && (
                <span className="absolute inset-0 ring-2 ring-white/70 rounded-md pointer-events-none" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
