import React, { useState, useCallback, useEffect } from 'react';
import cn from '@/lib/core/cn';
import { proxyImage } from '@/lib/ui/images';
import { GifMedia } from '@/components/media/GifMedia';
import FavButton from '@/components/actions/FavButton';
import ImageZoomPreview from '@/components/item/ImageZoomPreview';
import { useTranslations } from 'next-intl';
import { useAtomValue } from 'jotai';
import { categoryAtom, highResImagesAtom } from '@/store/atoms';

// Hoisted regex for GIF detection (avoids re-creation on each render)
const GIF_REGEX = /\.gif($|[?#])/i;

export interface ItemCardImageProps {
  itemId: string | number;
  imageUrl: string | null | undefined;
  imageUrls: string[] | null | undefined;
  name: string;
  nameDecoded: string;
  refNum: string | number | null | undefined;
  shareLink: string | null | undefined;
  itemCategory: string | null | undefined;
  showFavAccent: boolean;
  aspectClass: string;
  priority?: boolean;
  isOptimized?: boolean;
}

/**
 * Renders the image section of ItemCard including:
 * - Thumbnail (static or GIF)
 * - Favourite button
 * - Little Biggy external link
 * - Image zoom preview
 * - Category badge (when viewing "All")
 */
function ItemCardImageInner({
  itemId,
  imageUrl,
  imageUrls,
  name,
  nameDecoded,
  refNum,
  shareLink,
  itemCategory,
  showFavAccent,
  aspectClass,
  priority = false,
  isOptimized = false,
}: ItemCardImageProps) {
  const tItem = useTranslations('Item');
  const tCats = useTranslations('Categories');
  const category = useAtomValue(categoryAtom);
  const highResImages = useAtomValue(highResImagesAtom);

  // GIF detection
  const isGif = typeof imageUrl === 'string' && GIF_REGEX.test(imageUrl);

  // Thumbnail source with optimization check
  // If isOptimized (io=1), we can safely proxy. Otherwise use raw URL.
  const thumbSrc = isOptimized ? proxyImage(imageUrl || '', highResImages ? undefined : 800) : (imageUrl || '');

  // Zoom preview signal
  const [openPreviewSignal, setOpenPreviewSignal] = useState<number | null>(null);
  const handleOpenPreview = useCallback((e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setOpenPreviewSignal(Date.now());
  }, []);

  // Category translation helper
  const categoryLabel = React.useMemo(() => {
    if (!itemCategory) return null;
    try {
      const map: Record<string, string> = {
        Flower: 'flower', Hash: 'hash', Edibles: 'edibles',
        Concentrates: 'concentrates', Vapes: 'vapes', Tincture: 'tincture',
        Psychedelics: 'psychedelics', Other: 'other'
      };
      const key = map[itemCategory] || String(itemCategory).toLowerCase();
      return tCats(key);
    } catch {
      return itemCategory;
    }
  }, [itemCategory, tCats]);

  return (
    <div className={cn(
      "relative item-card-image rounded-br-0 rounded-bl-0 overflow-hidden m-[4px] border pointer-events-none",
      "group/image",
      showFavAccent
        ? cn("fav-thumb-background", "fav-thumb-border", "fav-thumb-shadow")
        : "bg-gray-200 dark:bg-gray-800/40 border-[#e5e5e5] dark:border-gray-700"
    )}>
      <div className={cn("block overflow-hidden", aspectClass)}>
        {imageUrl ? (
          isGif ? (
            <GifMedia
              url={imageUrl}
              alt={nameDecoded}
              onOpenPreview={handleOpenPreview}
              className="w-full h-full"
            />
          ) : (
            <button
              type="button"
              aria-label={nameDecoded ? tItem('previewWithName', { name: nameDecoded }) : tItem('previewImage')}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                e.stopPropagation();
                setOpenPreviewSignal(Date.now());
              }}
              className="card-preview-trigger relative w-full h-full overflow-hidden focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-400 rounded-sm rounded-br-0 rounded-bl-0 pointer-events-auto"
            >
              <img
                src={thumbSrc}
                alt={nameDecoded}
                className="motion-img-fade gpu-smooth card-image"
                loading={priority ? 'eager' : 'lazy'}
                decoding={priority ? 'sync' : 'async'}
                fetchPriority={priority ? 'high' : undefined}
                draggable={false}
              />
            </button>
          )
        ) : (
          <div className="w-full h-full bg-black/5 dark:bg-white/10" />
        )}
      </div>
      {imageUrl && (
        <>
          <div className="absolute right-2 top-2 z-10 flex items-center gap-2 card-controls pointer-events-auto">
            <FavButton itemId={itemId as any} className="" />
          </div>
          <div className="absolute right-2 bottom-2 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-auto">
            <a
              href={shareLink || (refNum ? `https://littlebiggy.net/item/${refNum}/view/p` : undefined)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${nameDecoded} on Little Biggy`}
              className="group/button inline-flex items-center gap-1.5 text-[10px] font-medium bg-white/60 dark:bg-gray-800/55 hover:bg-white/90 dark:hover:bg-gray-800/90 border border-gray-200/80 dark:border-gray-700/80 text-gray-800 dark:text-gray-200 rounded-full px-3 py-1 shadow-sm backdrop-blur-md transition-colors duration-250 focus:outline-none focus-visible:ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 ring-gray-300/60 dark:ring-gray-600/70"
            >
              <span>Little Biggy</span>
              <span aria-hidden="true" className="inline-block text-base leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1 motion-reduce:transition-none">→</span>
            </a>
          </div>
          <ImageZoomPreview
            imageUrl={imageUrl}
            imageUrls={imageUrls as any}
            alt={name}
            openSignal={openPreviewSignal as any}
            hideTrigger
            onOpenChange={() => { }}
          />
        </>
      )}
      {category === 'All' && itemCategory && (
        <div className="absolute left-2 bottom-2 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide bg-black/60 dark:bg-black/50 text-white backdrop-blur-sm shadow-sm">
            {categoryLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export const ItemCardImage = React.memo(ItemCardImageInner);
