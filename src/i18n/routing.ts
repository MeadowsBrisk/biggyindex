import { defineRouting } from "next-intl/routing";

export const locales = [
  "en-GB",
  "de-DE",
  "fr-FR",
  "pt-PT",
  "it-IT",
  "es-ES",
  "el-GR",
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en-GB";

export const LOCALE_TO_MARKET: Record<Locale, string> = {
  "en-GB": "GB",
  "de-DE": "DE",
  "fr-FR": "FR",
  "pt-PT": "PT",
  "it-IT": "IT",
  "es-ES": "ES",
  "el-GR": "GR",
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
  ],
  // No /en-GB prefix — each domain has exactly one locale
  localePrefix: "as-needed",
});
