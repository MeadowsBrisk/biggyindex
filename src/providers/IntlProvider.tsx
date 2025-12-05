"use client";
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from 'next/router';
import enGBCoreMessages from "../messages/en-GB/index.json";
import { IntlProvider as NextIntlProvider, useTranslations } from "next-intl";
import { getMarketFromPath, getLocaleForMarket, getMarketFromHost, isHostBasedEnv } from '@/lib/market/market';

export type Locale = "en-GB" | "de-DE" | "fr-FR" | "pt-PT" | "it-IT";
type Currency = "GBP" | "EUR" | "USD";

function normalizeLocale(input?: string | null): Locale {
  const raw = (input || "en-GB").toLowerCase();
  if (raw.startsWith("de")) return "de-DE";
  if (raw.startsWith("fr")) return "fr-FR";
  if (raw.startsWith("pt")) return "pt-PT";
  if (raw.startsWith("it")) return "it-IT";
  return "en-GB";
}

function currencyForLocale(locale: Locale): Currency {
  switch (locale) {
    case "de-DE":
    case "fr-FR":
    case "pt-PT":
    case "it-IT":
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

type DisplayCurrencyContextValue = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
};

const DisplayCurrencyContext = createContext<DisplayCurrencyContextValue | undefined>(undefined);

export function useDisplayCurrency(): DisplayCurrencyContextValue {
  const ctx = useContext(DisplayCurrencyContext);
  if (!ctx) {
    // Fallback during early render; defaults to en-GB/GBP
    return { currency: "GBP", setCurrency: () => {} };
  }
  return ctx;
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) return { locale: "en-GB", setLocale: () => {} };
  return ctx;
}

// Force English context - allows components to force UI to English regardless of locale
type ForceEnglishContextValue = {
  forceEnglish: boolean;
  setForceEnglish: (v: boolean) => void;
};

const ForceEnglishContext = createContext<ForceEnglishContextValue | undefined>(undefined);

export function useForceEnglish(): ForceEnglishContextValue {
  const ctx = useContext(ForceEnglishContext);
  if (!ctx) return { forceEnglish: false, setForceEnglish: () => {} };
  return ctx;
}

// Load only core messages (always needed)
async function loadCoreMessages(locale: Locale): Promise<Record<string, any>> {
  switch (locale) {
    case "de-DE":
      return (await import("../messages/de-DE/index.json")).default;
    case "fr-FR":
      return (await import("../messages/fr-FR/index.json")).default;
    case "pt-PT":
      return (await import("../messages/pt-PT/index.json")).default;
    case "it-IT":
      return (await import("../messages/it-IT/index.json")).default;
    default:
      return (await import("../messages/en-GB/index.json")).default;
  }
}

// Load home messages (only needed on home pages) - exported for HomeMessagesProvider
export async function loadHomeMessages(locale: Locale): Promise<Record<string, any>> {
  switch (locale) {
    case "de-DE":
      return (await import("../messages/de-DE/home.json")).default;
    case "fr-FR":
      return (await import("../messages/fr-FR/home.json")).default;
    case "pt-PT":
      return (await import("../messages/pt-PT/home.json")).default;
    case "it-IT":
      return (await import("../messages/it-IT/home.json")).default;
    default:
      return (await import("../messages/en-GB/home.json")).default;
  }
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

export function IntlProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  
  // Use router.locale for SSR consistency (avoids hydration mismatch)
  // Path-based locale detection happens in useEffect on client
  const initialLocale = normalizeLocale(router.locale);
  
  const [locale, setLocale] = useState<Locale>(initialLocale);
  // Start with English core messages as fallback, load correct locale async
  const [messages, setMessages] = useState<Record<string, any>>(enGBCoreMessages as Record<string, any>);
  const [currency, setCurrency] = useState<Currency>(currencyForLocale(initialLocale));
  
  // Force English preference - default false on SSR, sync from localStorage in effect
  const [forceEnglish, setForceEnglishState] = useState<boolean>(false);
  
  // Callback to update force English and persist to localStorage
  const setForceEnglish = useCallback((value: boolean) => {
    setForceEnglishState(value);
    try {
      window.localStorage.setItem('forceEnglish', JSON.stringify(value));
    } catch {}
  }, []);

  // Sync forceEnglish from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('forceEnglish');
      if (stored === 'true') setForceEnglishState(true);
    } catch {}
  }, []);

  // Load core messages for the current locale (or English if forced)
  useEffect(() => {
    let cancelled = false;
    // If forceEnglish is enabled, always load English messages
    const messageLocale = forceEnglish ? 'en-GB' : locale;
    loadCoreMessages(messageLocale).then((m) => {
      if (!cancelled) setMessages(m);
    });
    setCurrency(currencyForLocale(locale)); // Keep currency based on actual locale
    try { if (typeof window !== 'undefined') window.localStorage.setItem('app:locale', locale); } catch {}
    return () => {
      cancelled = true;
    };
  }, [locale, forceEnglish]);

  // Sync locale when router changes (path or locale)
  useEffect(() => {
    // Check path-based locale first (for localhost /de, /fr paths)
    const pathLocale = typeof window !== 'undefined' 
      ? localeFromEnvironment(window.location.pathname) 
      : 'en-GB';
    const routerLocale = normalizeLocale(router.locale);
    
    // Prefer path-based locale on localhost, router.locale in production
    const detectedLocale = pathLocale !== 'en-GB' ? pathLocale : routerLocale;
    
    if (detectedLocale !== locale) {
      setLocale(detectedLocale);
    }
  }, [router.locale, router.asPath, locale]);

  // Function to merge in additional messages (e.g., home messages)
  const addMessages = useMemo(() => (extra: Record<string, any>) => {
    setMessages(prev => ({ ...prev, ...extra }));
  }, []);

  const currencyValue = useMemo(() => ({ currency, setCurrency }), [currency]);
  const messagesValue = useMemo(() => ({ messages, addMessages }), [messages, addMessages]);
  const forceEnglishValue = useMemo(() => ({ forceEnglish, setForceEnglish }), [forceEnglish, setForceEnglish]);

  return (
    <NextIntlProvider
      locale={forceEnglish ? 'en-GB' : locale}
      messages={messages}
      timeZone="UTC"
      onError={(err: any) => {
        // Suppress hard errors for missing messages during first render; show warnings in dev for other issues
        if (err?.code === 'MISSING_MESSAGE') return;
        if (process.env.NODE_ENV !== 'production') console.warn('[i18n]', err);
      }}
      getMessageFallback={({ key }: any) => key}
    >
      <LocaleContext.Provider value={{ locale, setLocale }}>
        <ForceEnglishContext.Provider value={forceEnglishValue}>
          <DisplayCurrencyContext.Provider value={currencyValue}>
            <MessagesContext.Provider value={messagesValue}>
              {children}
            </MessagesContext.Provider>
          </DisplayCurrencyContext.Provider>
        </ForceEnglishContext.Provider>
      </LocaleContext.Provider>
    </NextIntlProvider>
  );
}

// Convenience hook example (not used yet)
export function useSidebarLabels() {
  const t = useTranslations("Sidebar");
  return {
    filters: t("filters"),
    search: t("search"),
    category: t("category"),
    price: t("price"),
    sellers: t("sellers"),
    allSellers: t("allSellers"),
    reviews: t("reviews"),
    reset: t("reset"),
    sort: t("sort"),
    openFilters: t("openFilters"),
    closeFilters: t("closeFilters"),
  } as const;
}
