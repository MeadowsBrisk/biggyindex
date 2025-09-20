import React from 'react';
import { useAtom, useAtomValue } from 'jotai';
import cn from '@/app/cn';
import { includedSellersAtom, excludedSellersAtom } from '@/store/atoms';

function ExcludeSellerButton({ sellerName }) {
  const [excluded, setExcluded] = useAtom(excludedSellersAtom);
  const [included, setIncluded] = useAtom(includedSellersAtom);
  const lower = (sellerName || '').toLowerCase();
  const isExcluded = excluded.includes(lower);
  const toggle = () => {
    if (!lower) return;
    if (isExcluded) setExcluded(excluded.filter((e) => e !== lower));
    else {
      setExcluded([...excluded, lower]);
      if (included.includes(lower)) setIncluded(included.filter((e) => e !== lower));
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title={isExcluded ? 'Remove from excluded' : 'Exclude seller'}
      aria-pressed={isExcluded}
      className={cn(
        'inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs cursor-pointer transition-colors shadow-sm',
        isExcluded
          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700'
      )}
    >
      {isExcluded ? '✓' : '×'}
    </button>
  );
}

function IncludeSellerButton({ sellerName }) {
  const [included, setIncluded] = useAtom(includedSellersAtom);
  const [excluded, setExcluded] = useAtom(excludedSellersAtom);
  const lower = (sellerName || '').toLowerCase();
  const isIncluded = included.includes(lower);
  const toggle = () => {
    if (!lower) return;
    if (isIncluded) setIncluded(included.filter((e) => e !== lower));
    else {
      setIncluded([...included, lower]);
      if (excluded.includes(lower)) setExcluded(excluded.filter((e) => e !== lower));
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title={isIncluded ? 'Remove from included' : 'Only include this seller'}
      aria-pressed={isIncluded}
      className={cn(
        'inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs cursor-pointer transition-colors shadow-sm',
        isIncluded
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700'
      )}
    >
      {isIncluded ? '✓' : '+'}
    </button>
  );
}

export default function SellerFilterButtons({ sellerName, className }) {
  const included = useAtomValue(includedSellersAtom);
  const excluded = useAtomValue(excludedSellersAtom);
  const lower = (sellerName || '').toLowerCase();
  const isIncluded = included.includes(lower);
  const isExcluded = excluded.includes(lower);
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {isIncluded ? (
        <IncludeSellerButton sellerName={sellerName} />
      ) : isExcluded ? (
        <ExcludeSellerButton sellerName={sellerName} />
      ) : (
        <>
          <IncludeSellerButton sellerName={sellerName} />
          <ExcludeSellerButton sellerName={sellerName} />
        </>
      )}
    </div>
  );
}
