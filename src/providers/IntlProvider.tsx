"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  
  // Use Next.js i18n locale from router (set by domain config in next.config.ts)
  // This ensures SSR and client render with the same initial locale
  const initialLocale = normalizeLocale(router.locale);
  
  const [locale, setLocale] = useState<Locale>(initialLocale);
  // Start with English core messages as fallback, load correct locale async
  const [messages, setMessages] = useState<Record<string, any>>(enGBCoreMessages as Record<string, any>);
  const [currency, setCurrency] = useState<Currency>(currencyForLocale(initialLocale));

  // Load core messages for the current locale
  useEffect(() => {
    let cancelled = false;
    loadCoreMessages(locale).then((m) => {
      if (!cancelled) setMessages(m);
    });
    setCurrency(currencyForLocale(locale));
    try { if (typeof window !== 'undefined') window.localStorage.setItem('app:locale', locale); } catch {}
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // Sync locale when router.locale changes (e.g., navigating between localized pages)
  useEffect(() => {
    const routerLocale = normalizeLocale(router.locale);
    if (routerLocale !== locale) {
      setLocale(routerLocale);
    }
  }, [router.locale, locale]);

  // Function to merge in additional messages (e.g., home messages)
  const addMessages = useMemo(() => (extra: Record<string, any>) => {
    setMessages(prev => ({ ...prev, ...extra }));
  }, []);

  const currencyValue = useMemo(() => ({ currency, setCurrency }), [currency]);
  const messagesValue = useMemo(() => ({ messages, addMessages }), [messages, addMessages]);

  return (
    <NextIntlProvider
      locale={locale}
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
        <DisplayCurrencyContext.Provider value={currencyValue}>
          <MessagesContext.Provider value={messagesValue}>
            {children}
          </MessagesContext.Provider>
        </DisplayCurrencyContext.Provider>
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
