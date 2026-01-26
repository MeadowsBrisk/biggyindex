import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import cn from '@/lib/core/cn';
import { StarIcon } from '@/components/common/icons';
import { favouritesSetAtom, toggleFavouriteAtom, favouritesOnlyAtom } from '@/store/atoms';

export type FavButtonProps = {
  itemId: string | number;
  className?: string;
};

/**
 * FavButton
 * Shared favourite toggle button used across cards and overlays.
 */
export default function FavButton({ itemId, className }: FavButtonProps): React.ReactElement {
  const toggleFav = useSetAtom(toggleFavouriteAtom as any);
  // Use shared Set atom for O(1) lookup instead of per-item selectAtom
  const favSet = useAtomValue(favouritesSetAtom);
  const active = favSet.has(itemId);
  const favouritesOnly = useAtomValue(favouritesOnlyAtom as any);

  const onClick = React.useCallback(() => {
    // Prefer transition to keep UI responsive
    // @ts-ignore startTransition available in React 18 runtime
    React.startTransition(() => (toggleFav as any)(itemId));
  }, [toggleFav, itemId]);

  const alwaysShow = active && !favouritesOnly;

  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? 'Remove from favourites' : 'Add to favourites'}
      aria-label={active ? 'Remove from favourites' : 'Add to favourites'}
      aria-pressed={!!active}
      className={cn(
        'relative z-10 inline-flex items-center justify-center w-8 h-8 rounded-full border cursor-pointer transition-all duration-200 ease-out shadow-sm hover:shadow',
        active
          ? cn('fav-star-active-btn', alwaysShow && 'always-show')
          : 'bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700',
        className
      )}
    >
      <StarIcon
        className="w-4 h-4"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      />
    </button>
  );
}
