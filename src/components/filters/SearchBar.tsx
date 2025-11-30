import { useAtom } from 'jotai';
import { searchQueryAtom } from '@/store/atoms';
import cn from '@/app/cn';
import React, { useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';

export default function SearchBar(): React.ReactElement {
  const t = useTranslations('UI');
  const [searchQuery, setSearchQuery] = useAtom<string>(searchQueryAtom as any);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const clear = useCallback(() => {
    if (searchQuery !== '') {
      setSearchQuery('');
      // restore focus for fast follow-up typing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchQuery, setSearchQuery]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && searchQuery) {
      e.stopPropagation();
      clear();
    }
  };

  return (
    <div className="w-full relative group">
      {/* Leading search icon */}
      <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-500 transition-colors" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchAria')}
        className={cn(
          'w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-8 pr-8 py-2 text-sm',
          'shadow-sm outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900',
          'transition-[box-shadow,background-color] placeholder:text-gray-400 dark:placeholder:text-gray-500'
        )}
        maxLength={160}
        autoComplete="off"
        spellCheck={false}
      />
      {searchQuery && (
        <button
          type="button"
          onClick={clear}
          aria-label={t('clearSearch')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  );
}
