// Central locale routing configuration
// Provides helpers for building canonical item/seller URLs and resolving host per locale.

import { getMarketFromHost, getLocaleForMarket, MARKETS } from '@/lib/market/market';

/**
 * Locale-to-host mapping, auto-generated from MARKETS.
 * GB maps to apex biggyindex.com; others map to {market}.biggyindex.com subdomains.
 * Both short ('de') and full ('de-DE') locale keys are included.
 */
export const LOCALE_HOST: Record<string, string> = Object.fromEntries(
  MARKETS.flatMap(m => {
    const locale = getLocaleForMarket(m);
    const short = locale.split('-')[0];
    const host = m === 'GB'
      ? 'https://biggyindex.com'
      : `https://${m.toLowerCase()}.biggyindex.com`;
    return [[locale, host], [short, host]];
  })
);

function short(locale: string): string { return (locale || '').split('-')[0]; }

export function hostForLocale(locale: string): string {
  return LOCALE_HOST[locale] || LOCALE_HOST[short(locale)] || LOCALE_HOST.en;
}

export function itemPathSegment(locale: string): string {
  return 'item';
}
export function sellerPathSegment(locale: string): string {
  return 'seller';
}

export function buildItemUrl(ref: string, locale: string): string {
  const host = hostForLocale(locale);
  const seg = itemPathSegment(locale);
  return `${host}/${seg}/${encodeURIComponent(ref)}`;
}
export function buildSellerUrl(id: string | number, locale: string): string {
  const host = hostForLocale(locale);
  const seg = sellerPathSegment(locale);
  return `${host}/${seg}/${encodeURIComponent(String(id))}`;
}

// Attempt to detect locale from an incoming host header
// Delegates to getMarketFromHost() to avoid duplicate subdomain logic
export function localeFromHost(host?: string | null): string {
  const market = getMarketFromHost(host ?? undefined);
  return getLocaleForMarket(market);
}
