import { defineRouting } from "next-intl/routing";

export const locales = [
  "en-GB",
  "en-IE",
  "de-DE",
  "fr-FR",
  "pt-PT",
  "it-IT",
  "es-ES",
  "el-GR",
  "cs-CZ",
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en-GB";

export const LOCALE_TO_MARKET: Record<Locale, string> = {
  "en-GB": "GB",
  "en-IE": "IE",
  "de-DE": "DE",
  "fr-FR": "FR",
  "pt-PT": "PT",
  "it-IT": "IT",
  "es-ES": "ES",
  "el-GR": "GR",
  "cs-CZ": "CZ",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  domains: [
    {
      domain: "biggyindex.com",
      defaultLocale: "en-GB",
      locales: ["en-GB"],
    },
    {
      domain: "ie.biggyindex.com",
      defaultLocale: "en-IE",
      locales: ["en-IE"],
    },
    {
      domain: "de.biggyindex.com",
      defaultLocale: "de-DE",
      locales: ["de-DE"],
    },
    {
      domain: "fr.biggyindex.com",
      defaultLocale: "fr-FR",
      locales: ["fr-FR"],
    },
    {
      domain: "pt.biggyindex.com",
      defaultLocale: "pt-PT",
      locales: ["pt-PT"],
    },
    {
      domain: "it.biggyindex.com",
      defaultLocale: "it-IT",
      locales: ["it-IT"],
    },
    {
      domain: "es.biggyindex.com",
      defaultLocale: "es-ES",
      locales: ["es-ES"],
    },
    {
      domain: "gr.biggyindex.com",
      defaultLocale: "el-GR",
      locales: ["el-GR"],
    },
    {
      domain: "cz.biggyindex.com",
      defaultLocale: "cs-CZ",
      locales: ["cs-CZ"],
    },
  ],
  // No /en-GB prefix — each domain has exactly one locale
  localePrefix: "as-needed",
  // Domains already pin the locale per host. Disable header/cookie sniffing so
  // localhost (and any unmatched host) always falls back to defaultLocale
  // instead of being pushed to en-IE by a stale NEXT_LOCALE cookie or
  // Accept-Language ambiguity between en-GB / en-IE.
  localeDetection: false,
});
