"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from 'next/router';
import enGBMessages from "../messages/en-GB.json";
import { IntlProvider as NextIntlProvider, useTranslations } from "next-intl";
import { getMarketFromPath, getLocaleForMarket, getMarketFromHost, isHostBasedEnv } from '@/lib/market';

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

// Lightweight messages loader; in production you may want to code-split messages by locale.
async function loadMessages(locale: Locale) {
  let core: any;
  let home: any;
  switch (locale) {
    case "de-DE":
      core = (await import("../messages/de-DE.json")).default;
      home = (await import("../home-messages/de-DE.json")).default;
      break;
    case "fr-FR":
      core = (await import("../messages/fr-FR.json")).default;
      home = (await import("../home-messages/fr-FR.json")).default;
      break;
    case "pt-PT":
      core = (await import("../messages/pt-PT.json")).default;
      home = (await import("../home-messages/pt-PT.json")).default;
      break;
    case "it-IT":
      core = (await import("../messages/it-IT.json")).default;
      home = (await import("../home-messages/it-IT.json")).default;
      break;
    default:
      core = (await import("../messages/en-GB.json")).default;
      home = (await import("../home-messages/en-GB.json")).default;
  }
  // Shallow merge; Home lives under its own namespace, so no collisions expected
  return { ...core, ...home };
}

export function IntlProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Important: keep initial SSR and first client render identical to avoid hydration mismatch
  const [locale, setLocale] = useState<Locale>("en-GB");
  const [messages, setMessages] = useState<Record<string, any> | null>(enGBMessages as any);
  const [currency, setCurrency] = useState<Currency>("GBP");

  useEffect(() => {
    let cancelled = false;
    loadMessages(locale).then((m) => {
      if (!cancelled) setMessages(m);
    });
    setCurrency(currencyForLocale(locale));
    try { if (typeof window !== 'undefined') window.localStorage.setItem('app:locale', locale); } catch {}
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // Keep locale in sync with route or host (e.g., fr.biggyindex.com or /fr)
  useEffect(() => {
    if (!router || typeof router.pathname !== 'string') return;
    const envLocale = localeFromEnvironment(router.asPath || router.pathname);
    if (envLocale && envLocale !== locale) setLocale(envLocale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router?.pathname, router?.asPath]);

  // On mount, derive locale from URL param or localStorage if no path prefix was provided
  useEffect(() => {
    if (typeof window === 'undefined') return;
  const envLocale = localeFromEnvironment(window.location?.pathname || '/');
  if (envLocale && envLocale !== locale) { setLocale(envLocale); return; }
    try {
      const url = new URL(window.location.href);
      const qp = url.searchParams.get('lang');
      if (qp) { setLocale(normalizeLocale(qp)); return; }
      const saved = window.localStorage.getItem('app:locale');
      if (saved) setLocale(normalizeLocale(saved));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose a simple API to change locale later if needed
  const value = useMemo(() => ({ currency, setCurrency }), [currency]);

  return (
    <NextIntlProvider
      locale={locale}
      messages={messages || {}}
      timeZone="UTC"
      onError={(err: any) => {
        // Suppress hard errors for missing messages during first render; show warnings in dev for other issues
        if (err?.code === 'MISSING_MESSAGE') return;
        if (process.env.NODE_ENV !== 'production') console.warn('[i18n]', err);
      }}
      getMessageFallback={({ key }: any) => key}
    >
      <LocaleContext.Provider value={{ locale, setLocale }}>
        <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>
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
