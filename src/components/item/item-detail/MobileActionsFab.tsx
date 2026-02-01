"use client";
import React from 'react';
import cn from '@/lib/core/cn';
import { StarIcon } from '@/components/common/icons';
import EndorseButton from '@/components/actions/EndorseButton';
import ShareMenu from '@/components/actions/ShareMenu';
import { useTranslations } from 'next-intl';

type Props = {
  baseItem: any;
  isFav: boolean;
  toggleFav: (id: any) => void;
  fabOpen: boolean;
  setFabOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fabRef?: React.RefObject<HTMLDivElement | null>;
  shareBtnRef?: React.RefObject<HTMLButtonElement | null>;
  setShareOpen: React.Dispatch<React.SetStateAction<boolean>>;
  shareOpen: boolean;
  shareUrl: string;
  className?: string;
};

export default function MobileActionsFab({
  baseItem,
  isFav,
  toggleFav,
  fabOpen,
  setFabOpen,
  fabRef,
  shareBtnRef,
  setShareOpen,
  shareOpen,
  shareUrl,
  className,
}: Props) {
  const t = useTranslations('UI');
  return (
    <div className={cn("md:hidden relative z-20", className)}>
      <div className="relative w-10 h-10" ref={fabRef}>
        <button
          type="button"
          aria-expanded={fabOpen}
          onClick={() => setFabOpen(v => !v)}
          title={fabOpen ? t('closeActions') : t('actions')}
          className="absolute left-0 bottom-0 w-10 h-10 rounded-full bg-white/95 dark:bg-gray-800/95 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 shadow"
        >
          {fabOpen ? '×' : '⋯'}
        </button>
        {baseItem?.id != null && (
          <div
            className={cn(
              'absolute left-0 bottom-0 transition-all duration-300 cubic-bezier(0.34, 1.56, 0.64, 1)',
              fabOpen ? 'translate-y-[-70px] opacity-100' : 'translate-y-0 opacity-0 pointer-events-none'
            )}
            onMouseDown={(e: React.SyntheticEvent) => e.stopPropagation()}
            onTouchStart={(e: React.SyntheticEvent) => e.stopPropagation()}
          >
            <EndorseButton itemId={baseItem.id} onHydrated={() => { }} compact />
          </div>
        )}
        <button
          type="button"
          onMouseDown={(e: React.SyntheticEvent) => e.stopPropagation()}
          onTouchStart={(e: React.SyntheticEvent) => e.stopPropagation()}
          onClick={() => { baseItem && toggleFav(baseItem.id); }}
          aria-pressed={isFav}
          className={cn(
            'absolute left-0 bottom-0 w-10 h-10 rounded-full border shadow flex items-center justify-center',
            isFav ? 'fav-star-active-btn' : 'bg-white/95 dark:bg-gray-800/95 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700',
            fabOpen ? 'translate-y-[-120px] opacity-100' : 'translate-y-0 opacity-0 pointer-events-none',
            'transition-all duration-300 cubic-bezier(0.34, 1.56, 0.64, 1)'
          )}
          title={isFav ? t('removeFavourite') : t('addToFavourites')}
          aria-label={isFav ? t('removeFavourite') : t('addToFavourites')}
        >
          <StarIcon className="w-5 h-5" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} />
        </button>
        <div
          className={cn(
            'absolute left-0 bottom-0 transition-all duration-300 cubic-bezier(0.34, 1.56, 0.64, 1)',
            fabOpen ? 'translate-y-[-170px] opacity-100' : 'translate-y-0 opacity-0 pointer-events-none'
          )}
        >
          <div className="relative">
            <button
              ref={shareBtnRef}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={() => { setShareOpen(v => !v); }}
              className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 bg-white/95 text-gray-700 dark:bg-gray-800/95 dark:text-gray-200 shadow flex items-center justify-center top-0.5 relative"
              title={t('share')}
              aria-label={t('share')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            {shareOpen && (
              <ShareMenu
                url={shareUrl}
                title={(baseItem as any)?.n || 'Item'}
                onClose={() => setShareOpen(false)}
                className="absolute left-full bottom-0 ml-1 mb-8"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
