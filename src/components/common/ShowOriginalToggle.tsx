/**
 * Inline "Show original" toggle for item detail views.
 * Lets users switch between translated and original English content.
 * Styled as a track-and-thumb switch consistent with sidebar toggles.
 * Only renders on non-GB markets.
 */
import { useForceEnglish } from '@/providers/IntlProvider';
import { getMarketFromHost, getMarketFromPath } from '@/lib/market/market';
import { useTranslations } from 'next-intl';
import cn from '@/lib/core/cn';

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

  const label = forceEnglish ? t('showTranslated') : t('showOriginal');

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      <button
        type="button"
        onClick={() => setForceEnglish(!forceEnglish)}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50',
          forceEnglish ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700'
        )}
        aria-label={label}
        aria-pressed={forceEnglish}
        role="switch"
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
            forceEnglish ? 'translate-x-[1.125rem]' : 'translate-x-[0.1875rem]'
          )}
        />
      </button>
    </div>
  );
}
