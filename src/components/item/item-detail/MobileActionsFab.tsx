"use client";
import React from 'react';
import cn from '@/app/cn';
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
}: Props) {
  const t = useTranslations('UI');
  return (
    <div className="md:hidden absolute left-3 bottom-25 md:bottom-20 z-20">
      <div className="relative w-10 h-10" ref={fabRef}>
        <button
          type="button"
          aria-expanded={fabOpen}
          onClick={() => setFabOpen(v=>!v)}
          title={fabOpen ? t('closeActions') : t('actions')}
          className="absolute left-0 bottom-0 w-10 h-10 rounded-full bg-white/95 dark:bg-gray-800/95 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 shadow"
        >
          {fabOpen ? '×' : '⋯'}
        </button>
        {baseItem?.id != null && (
          <div
            className={cn(
              'absolute left-0 bottom-0 transition-all duration-200',
              fabOpen ? 'translate-x-[56px] translate-y-[-8px] opacity-100' : 'translate-x-0 translate-y-0 opacity-0 pointer-events-none'
            )}
            onMouseDown={(e: React.SyntheticEvent)=>e.stopPropagation()}
            onTouchStart={(e: React.SyntheticEvent)=>e.stopPropagation()}
          >
            <EndorseButton itemId={baseItem.id} onHydrated={() => {}} compact />
          </div>
        )}
        <button
          type="button"
          onMouseDown={(e: React.SyntheticEvent)=>e.stopPropagation()}
          onTouchStart={(e: React.SyntheticEvent)=>e.stopPropagation()}
          onClick={() => { baseItem && toggleFav(baseItem.id); }}
          aria-pressed={isFav}
          className={cn(
            'absolute left-0 bottom-0 w-10 h-10 rounded-full border shadow flex items-center justify-center',
            isFav ? 'fav-star-active-btn' : 'bg-white/95 dark:bg-gray-800/95 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700',
            fabOpen ? 'translate-x-[34px] translate-y-[-54px] opacity-100' : 'translate-x-0 translate-y-0 opacity-0 pointer-events-none',
            'transition-all duration-200'
          )}
          title={isFav ? t('removeFavourite') : t('addToFavourites')}
          aria-label={isFav ? t('removeFavourite') : t('addToFavourites')}
        >
          <StarIcon className="w-5 h-5" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} />
        </button>
        <div
          className={cn(
            'absolute left-0 bottom-0 transition-all duration-200',
            fabOpen ? 'translate-x-[8px] translate-y-[-92px] opacity-100' : 'translate-x-0 translate-y-0 opacity-0 pointer-events-none'
          )}
        >
          <div className="relative">
          <button
            ref={shareBtnRef}
            type="button"
            onMouseDown={(e)=>e.stopPropagation()}
            onTouchStart={(e)=>e.stopPropagation()}
            onClick={() => { setShareOpen(v=>!v); }}
            className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 bg-white/95 text-gray-700 dark:bg-gray-800/95 dark:text-gray-200 shadow flex items-center justify-center"
            title={t('share')}
            aria-label={t('share')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/>
              <path d="M12 16V3"/>
              <path d="M8 7l4-4 4 4"/>
            </svg>
          </button>
          {shareOpen && (
            <ShareMenu url={shareUrl} title={(baseItem as any)?.n || 'Item'} onClose={() => setShareOpen(false)} />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
