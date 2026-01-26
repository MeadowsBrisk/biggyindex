"use client";
import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { pauseGifsAtom } from '@/store/atoms';
import { useGifAsset } from '@/lib/ui/gifAssets';
import cn from '@/lib/core/cn';

interface GifMediaProps {
  url: string;
  alt?: string;
  className?: string;
  onOpenPreview?: () => void;
}

/**
 * GIF media component with global pause support.
 * Uses R2 poster (thumb.avif) when paused, animated WebP (anim.webp) when playing.
 */
export function GifMedia({ url, alt, className, onOpenPreview }: GifMediaProps) {
  const pauseGlobal = useAtomValue(pauseGifsAtom);
  const { loading, isGif, hasAnim, poster, anim } = useGifAsset(url);

  const showPoster = pauseGlobal || !hasAnim;

  const Wrapper = onOpenPreview ? 'button' : 'div';
  
  const mediaClassName = cn(
    'w-full h-full object-cover select-none'
  );

  const renderMedia = () => {
    const content = (() => {
      if (showPoster) {
        // Show static poster (thumb.avif)
        return <img src={poster} alt={alt || ''} loading="lazy" decoding="async" draggable={false} className={mediaClassName} />;
      }
      // Show animated WebP
      return <img src={anim!} alt={alt || ''} loading="lazy" decoding="async" draggable={false} className={mediaClassName} />;
    })();

    if (onOpenPreview) {
      return (
        <div className="w-full h-full transform-gpu transition-transform duration-900 group-hover:scale-[1.04] ease-out cursor-zoom-in">
          {content}
        </div>
      );
    }
    return content;
  };

  return (
    <div className={cn('relative w-full h-full', className)}>
      <Wrapper
        type={onOpenPreview ? 'button' : undefined}
        aria-label={onOpenPreview ? (alt ? `Preview ${alt}` : 'Preview image') : undefined}
        onClick={onOpenPreview}
        className={cn(
          'w-full h-full block focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-400 overflow-hidden rounded-sm rounded-br-0 rounded-bl-0 group',
          onOpenPreview && 'cursor-zoom-in pointer-events-auto'
        )}
      >
        {renderMedia()}
      </Wrapper>

      {/* GIF badge */}
      {isGif && (
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
