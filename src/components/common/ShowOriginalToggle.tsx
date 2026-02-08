/**
 * Inline language toggle for item/seller detail views.
 * Shows "EN" when forcing English, locale code when showing translated.
 * Compact track-and-thumb switch consistent with sidebar toggles.
 * Only renders on non-GB markets.
 */
import { useForceEnglish } from '@/providers/IntlProvider';
import { getMarketFromHost, getMarketFromPath } from '@/lib/market/market';
import cn from '@/lib/core/cn';

interface ShowOriginalToggleProps {
  /** Override market detection (useful for SSR-rendered pages) */
  market?: string;
  className?: string;
}

const MARKET_LABEL: Record<string, string> = {
  DE: 'DE', FR: 'FR', PT: 'PT', IT: 'IT', ES: 'ES',
};

export default function ShowOriginalToggle({ market: marketProp, className = '' }: ShowOriginalToggleProps) {
  const { forceEnglish, setForceEnglish } = useForceEnglish();

  // Detect market
  const market = marketProp
    || (typeof window !== 'undefined'
      ? getMarketFromHost(window.location.hostname) || getMarketFromPath(window.location.pathname)
      : 'GB');

  if (market === 'GB') return null;

  const localeLabel = MARKET_LABEL[market] || market;

  return (
    <button
      type="button"
      onClick={() => setForceEnglish(!forceEnglish)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase transition-colors',
        forceEnglish
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
        className
      )}
      aria-label={forceEnglish ? `Showing English — switch to ${localeLabel}` : `Showing ${localeLabel} — switch to English`}
      aria-pressed={forceEnglish}
      role="switch"
    >
      <span className={cn(
        'inline-block w-1.5 h-1.5 rounded-full',
        forceEnglish ? 'bg-blue-500' : 'bg-gray-400 dark:bg-gray-500'
      )} />
      {forceEnglish ? 'EN' : localeLabel}
    </button>
  );
}
