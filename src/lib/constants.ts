import type { Market } from "./types";

/** v2 categories (11) — order matches sidebar display */
export const CATEGORIES = [
  "Flower",
  "Shake",
  "Hash",
  "Concentrates",
  "Distillate",
  "Vapes",
  "PreRolls",
  "Edibles",
  "Tincture",
  "Psychedelics",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Display names for categories (camelCase → human-readable) */
export const CATEGORY_LABELS: Record<string, string> = {
  PreRolls: "Pre-Rolls",
};

/** Supported markets */
export const MARKETS: Market[] = [
  {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    currencySymbol: "£",
    locale: "en-GB",
    flag: "🇬🇧",
  },
  {
    code: "DE",
    name: "Germany",
    currency: "EUR",
    currencySymbol: "€",
    locale: "de-DE",
    flag: "🇩🇪",
  },
  {
    code: "FR",
    name: "France",
    currency: "EUR",
    currencySymbol: "€",
    locale: "fr-FR",
    flag: "🇫🇷",
  },
  {
    code: "PT",
    name: "Portugal",
    currency: "EUR",
    currencySymbol: "€",
    locale: "pt-PT",
    flag: "🇵🇹",
  },
  {
    code: "IT",
    name: "Italy",
    currency: "EUR",
    currencySymbol: "€",
    locale: "it-IT",
    flag: "🇮🇹",
  },
  {
    code: "ES",
    name: "Spain",
    currency: "EUR",
    currencySymbol: "€",
    locale: "es-ES",
    flag: "🇪🇸",
  },
];

export const DEFAULT_MARKET = "GB";

/** R2 public base URLs (set via env vars at runtime) */
export const R2_DATA_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_DATA_URL ?? "";
export const R2_IMAGES_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_IMAGES_URL ?? "";
