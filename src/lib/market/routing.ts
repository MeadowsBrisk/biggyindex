// Central locale routing configuration
// Provides helpers for building canonical item/seller URLs and resolving host per locale.

import { getMarketFromHost, getLocaleForMarket } from '@/lib/market/market';

export const LOCALE_HOST: Record<string, string> = {
  'en': 'https://biggyindex.com',
  'en-GB': 'https://biggyindex.com',
  'fr': 'https://fr.biggyindex.com',
  'fr-FR': 'https://fr.biggyindex.com',
  'de': 'https://de.biggyindex.com',
  'de-DE': 'https://de.biggyindex.com',
  'it': 'https://it.biggyindex.com',
  'it-IT': 'https://it.biggyindex.com',
  'pt': 'https://pt.biggyindex.com',
  'pt-PT': 'https://pt.biggyindex.com'
};

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
