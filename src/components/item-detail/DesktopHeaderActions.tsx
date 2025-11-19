"use client";
import React from 'react';
import cn from '@/app/cn';
import StarIcon from '@/app/assets/svg/star.svg';
import EndorseButton from '@/components/EndorseButton';
import ShareMenu from '@/components/ShareMenu';
import { useTranslations } from 'next-intl';

type Props = {
  baseItem: any;
  isFav: boolean;
  toggleFav: (id: any) => void;
  shareOpen: boolean;
  setShareOpen: React.Dispatch<React.SetStateAction<boolean>>;
  shareBtnRef?: React.RefObject<HTMLButtonElement | null>;
  shareUrl: string;
};

export default function DesktopHeaderActions({
  baseItem,
  isFav,
  toggleFav,
  shareOpen,
  setShareOpen,
  shareBtnRef,
  shareUrl,
}: Props) {
  const t = useTranslations('UI');
  return (
    <div className="shrink-0 hidden 2xl:flex items-start gap-2">
      <div className="relative">
        <button
          ref={shareBtnRef}
          type="button"
          onClick={() => setShareOpen(v=>!v)}
          title={t('share')}
          className="inline-flex items-center justify-center h-8 px-3 rounded-full border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 shadow-sm"
        >
          {t('share')}
        </button>
        {shareOpen && (
          <ShareMenu url={shareUrl} title={baseItem?.name || 'Item'} onClose={() => setShareOpen(false)} />
        )}
      </div>
      <button
        type="button"
        onClick={() => baseItem && toggleFav(baseItem.id)}
        aria-pressed={isFav}
        title={isFav ? t('removeFavourite') : t('addToFavourites')}
        className={cn(
          'relative inline-flex items-center justify-center w-8 h-8 rounded-full border cursor-pointer transition-colors shadow-sm',
          isFav ? 'fav-star-active-btn' : 'bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700'
        )}
      >
        <StarIcon className="w-4 h-4" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} />
      </button>
      {baseItem?.id != null && (
        <EndorseButton itemId={baseItem.id} onHydrated={() => {}} compact />
      )}
    </div>
  );
}
