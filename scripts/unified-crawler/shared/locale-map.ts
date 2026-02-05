/**
 * Central market↔locale mapping for the crawler pipeline.
 * Single source of truth — import from here instead of defining inline.
 */
import type { MarketCode } from './types';
import { MARKET_CODES } from './env/markets';

/** Market code → full BCP-47 locale (e.g. 'DE' → 'de-DE') */
export const MARKET_TO_FULL_LOCALE: Record<string, string> = {
  GB: 'en-GB',
  DE: 'de-DE',
  FR: 'fr-FR',
  PT: 'pt-PT',
  IT: 'it-IT',
};

/** Market code → short Azure translation target (e.g. 'DE' → 'de'). GB excluded (source lang). */
export const MARKET_TO_AZURE_LOCALE: Record<string, string> = {
  DE: 'de',
  FR: 'fr',
  PT: 'pt',
  IT: 'it',
};

/** Reverse: short Azure locale → market code (e.g. 'de' → 'DE') */
export const AZURE_LOCALE_TO_MARKET: Record<string, MarketCode> = Object.fromEntries(
  Object.entries(MARKET_TO_AZURE_LOCALE).map(([m, l]) => [l, m as MarketCode])
) as Record<string, MarketCode>;

/** All non-GB markets (for iteration in translation/index stages) */
export const NON_GB_MARKETS: MarketCode[] = MARKET_CODES.filter(m => m !== 'GB');
