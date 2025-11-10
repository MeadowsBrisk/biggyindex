import React from 'react';
import cn from '@/app/cn';
import { useTranslations } from 'next-intl';

export default function SellerIncludeExclude({
  isIncluded,
  isExcluded,
  onToggleInclude,
  onToggleExclude,
  size = 'xs', // 'xs' for desktop, 'sm' for mobile
}) {
  const t = useTranslations('UI');
  const base = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-6 h-6 text-xs';
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToggleInclude}
        aria-pressed={isIncluded}
        title={isIncluded ? t('removeInclude') : t('include')}
        aria-label={isIncluded ? t('removeInclude') : t('include')}
        className={cn(
          `inline-flex items-center justify-center rounded-full border cursor-pointer transition-colors shadow-sm ${base}`,
          isIncluded
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700'
        )}
      >
        {isIncluded ? '✓' : '+'}
      </button>
      <button
        type="button"
        onClick={onToggleExclude}
        aria-pressed={isExcluded}
        title={isExcluded ? t('removeExclude') : t('exclude')}
        aria-label={isExcluded ? t('removeExclude') : t('exclude')}
        className={cn(
          `inline-flex items-center justify-center rounded-full border cursor-pointer transition-colors shadow-sm ${base}`,
          isExcluded
            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700'
        )}
      >
        {isExcluded ? '✓' : '×'}
      </button>
    </div>
  );
}
