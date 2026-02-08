/**
 * Inline "Show original" toggle for item detail views.
 * Lets users switch between translated and original English content.
 * Only renders on non-GB markets.
 */
import { useForceEnglish } from '@/providers/IntlProvider';
import { getMarketFromHost, getMarketFromPath } from '@/lib/market/market';
import { useTranslations } from 'next-intl';

interface ShowOriginalToggleProps {
  /** Override market detection (useful for SSR-rendered pages) */
  market?: string;
  className?: string;
}

export default function ShowOriginalToggle({ market: marketProp, className = '' }: ShowOriginalToggleProps) {
  const { forceEnglish, setForceEnglish } = useForceEnglish();
  const t = useTranslations('Options');

  // Detect market
  const market = marketProp
    || (typeof window !== 'undefined'
      ? getMarketFromHost(window.location.hostname) || getMarketFromPath(window.location.pathname)
      : 'GB');

  if (market === 'GB') return null;

  return (
    <button
      type="button"
      onClick={() => setForceEnglish(!forceEnglish)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
        ${forceEnglish
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}
        ${className}`}
      aria-pressed={forceEnglish}
      title={forceEnglish ? t('showTranslated') : t('showOriginal')}
    >
      <span className="text-[11px]">🌐</span>
      {forceEnglish ? t('showTranslated') : t('showOriginal')}
    </button>
  );
}
