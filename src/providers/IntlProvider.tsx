"use client";
import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from 'next/router';
import { atom } from 'jotai';
import { atomWithStorage, useHydrateAtoms } from 'jotai/utils';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import enGBCoreMessages from "../messages/en-GB/index.json";
import { IntlProvider as NextIntlProvider } from "next-intl";
import { getMarketFromPath, getLocaleForMarket, getMarketFromHost, isHostBasedEnv } from '@/lib/market/market';

export type Locale = "en-GB" | "de-DE" | "fr-FR" | "pt-PT" | "it-IT" | "es-ES";
type Currency = "GBP" | "EUR" | "USD";

function normalizeLocale(input?: string | null): Locale {
  const raw = (input || "en-GB").toLowerCase();
  if (raw.startsWith("de")) return "de-DE";
  if (raw.startsWith("fr")) return "fr-FR";
  if (raw.startsWith("pt")) return "pt-PT";
  if (raw.startsWith("it")) return "it-IT";
  if (raw.startsWith("es")) return "es-ES";
  return "en-GB";
}

function currencyForLocale(locale: Locale): Currency {
  switch (locale) {
    case "de-DE":
    case "fr-FR":
    case "pt-PT":
    case "it-IT":
    case "es-ES":
      return "EUR";
    default:
      return "GBP";
  }
}

function localeFromEnvironment(pathname: string): Locale {
  // Prefer host-based market only on biggyindex.com subdomains; otherwise use path
  try {
    if (typeof window !== 'undefined') {
      const host = window.location?.hostname || '';
      if (isHostBasedEnv(host)) {
        const marketFromHost = getMarketFromHost(host);
        if (marketFromHost) return getLocaleForMarket(marketFromHost) as Locale;
      }
    }
  } catch {}
  const market = getMarketFromPath(pathname);
  return getLocaleForMarket(market) as Locale;
}

// ── Jotai atoms (replace React contexts for locale, currency, forceEnglish) ──
export const localeAtom = atom<Locale>("en-GB");
export const displayCurrencyAtom = atom<Currency>("GBP");
export const forceEnglishAtom = atomWithStorage<boolean>('forceEnglish', false);

// ── Hooks (same API — consumers don't need changes) ─────────────────────────
export function useLocale() {
  return { locale: useAtomValue(localeAtom), setLocale: useSetAtom(localeAtom) };
}

export function useDisplayCurrency() {
  return { currency: useAtomValue(displayCurrencyAtom), setCurrency: useSetAtom(displayCurrencyAtom) };
}

export function useForceEnglish() {
  return { forceEnglish: useAtomValue(forceEnglishAtom), setForceEnglish: useSetAtom(forceEnglishAtom) };
}

// Load only core messages (always needed)
/** Core message loaders — add 1 line per new locale */
const CORE_MESSAGE_LOADERS: Record<Locale, () => Promise<Record<string, any>>> = {
  'en-GB': () => import('../messages/en-GB/index.json').then(m => m.default),
  'de-DE': () => import('../messages/de-DE/index.json').then(m => m.default),
  'fr-FR': () => import('../messages/fr-FR/index.json').then(m => m.default),
  'pt-PT': () => import('../messages/pt-PT/index.json').then(m => m.default),
  'it-IT': () => import('../messages/it-IT/index.json').then(m => m.default),
  'es-ES': () => import('../messages/es-ES/index.json').then(m => m.default),
};

async function loadCoreMessages(locale: Locale): Promise<Record<string, any>> {
  const loader = CORE_MESSAGE_LOADERS[locale] || CORE_MESSAGE_LOADERS['en-GB'];
  return loader();
}

// Load home messages (only needed on home pages) - exported for HomeMessagesProvider
/** Home message loaders — add 1 line per new locale */
const HOME_MESSAGE_LOADERS: Record<Locale, () => Promise<Record<string, any>>> = {
  'en-GB': () => import('../messages/en-GB/home.json').then(m => m.default),
  'de-DE': () => import('../messages/de-DE/home.json').then(m => m.default),
  'fr-FR': () => import('../messages/fr-FR/home.json').then(m => m.default),
  'pt-PT': () => import('../messages/pt-PT/home.json').then(m => m.default),
  'it-IT': () => import('../messages/it-IT/home.json').then(m => m.default),
  'es-ES': () => import('../messages/es-ES/home.json').then(m => m.default),
};

export async function loadHomeMessages(locale: Locale): Promise<Record<string, any>> {
  const loader = HOME_MESSAGE_LOADERS[locale] || HOME_MESSAGE_LOADERS['en-GB'];
  return loader();
}

// Context for merged messages (core + home when available)
const MessagesContext = createContext<{
  messages: Record<string, any>;
  addMessages: (extra: Record<string, any>) => void;
} | undefined>(undefined);

export function useMessages() {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error("useMessages must be used within IntlProvider");
  return ctx;
}

interface IntlProviderProps {
  children: React.ReactNode;
  /** SSR-loaded messages from getStaticProps (avoids async loading flash) */
  ssrMessages?: Record<string, any> | null;
}

export function IntlProvider({ children, ssrMessages }: IntlProviderProps) {
  const router = useRouter();

  // Use router.locale for SSR consistency (avoids hydration mismatch)
  const initialLocale = normalizeLocale(router.locale);

  // Hydrate atoms with SSR-correct values on first render
  useHydrateAtoms([
    [localeAtom, initialLocale],
    [displayCurrencyAtom, currencyForLocale(initialLocale)],
  ]);

  const [locale, setLocale] = useAtom(localeAtom);
  const setCurrency = useSetAtom(displayCurrencyAtom);
  const forceEnglish = useAtomValue(forceEnglishAtom);

  // Use SSR messages if available, otherwise fall back to English core messages
  const [messages, setMessages] = useState<Record<string, any>>(
    ssrMessages && Object.keys(ssrMessages).length > 0
      ? ssrMessages
      : enGBCoreMessages as Record<string, any>
  );

  // Track if we've received SSR messages to skip initial async load
  const hadSsrMessages = useRef(ssrMessages && Object.keys(ssrMessages).length > 0);

  // Load core messages for the current locale (or English if forced)
  // Skip initial load if we already have SSR messages for the correct locale
  useEffect(() => {
    let cancelled = false;
    const messageLocale = forceEnglish ? 'en-GB' : locale;

    // Skip async load if we have SSR messages and locale matches (first render)
    if (hadSsrMessages.current && messageLocale === initialLocale && !forceEnglish) {
      hadSsrMessages.current = false;
      return;
    }

    loadCoreMessages(messageLocale).then((m) => {
      if (!cancelled) setMessages(m);
    });
    setCurrency(currencyForLocale(locale));
    return () => { cancelled = true; };
  }, [locale, forceEnglish, initialLocale, setCurrency]);

  // Sync locale when router changes (path or locale)
  useEffect(() => {
    const pathLocale = typeof window !== 'undefined'
      ? localeFromEnvironment(window.location.pathname)
      : 'en-GB';
    const routerLocale = normalizeLocale(router.locale);
    const detectedLocale = pathLocale !== 'en-GB' ? pathLocale : routerLocale;

    if (detectedLocale !== locale) {
      setLocale(detectedLocale);
    }
  }, [router.locale, router.asPath, locale, setLocale]);

  // Function to merge in additional messages (e.g., home messages)
  const addMessages = useMemo(() => (extra: Record<string, any>) => {
    setMessages(prev => ({ ...prev, ...extra }));
  }, []);

  const messagesValue = useMemo(() => ({ messages, addMessages }), [messages, addMessages]);

  return (
    <NextIntlProvider
      locale={forceEnglish ? 'en-GB' : locale}
      messages={messages}
      timeZone="UTC"
      onError={(err: any) => {
        if (err?.code === 'MISSING_MESSAGE') return;
        if (process.env.NODE_ENV !== 'production') console.warn('[i18n]', err);
      }}
      getMessageFallback={({ key }: any) => key}
    >
      <MessagesContext.Provider value={messagesValue}>
        {children}
      </MessagesContext.Provider>
    </NextIntlProvider>
  );
}
