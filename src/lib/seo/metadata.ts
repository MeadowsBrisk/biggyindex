import type { Metadata } from "next";
import {
  ALL_MARKETS,
  type MarketCode,
  marketToHost,
  marketToLocale,
} from "@/lib/market/market";

export const SEO_LOCALE_FOR: Record<MarketCode, string> = {
  GB: "en",
  IE: "en-IE",
  DE: "de",
  FR: "fr",
  PT: "pt",
  IT: "it",
  ES: "es",
  GR: "el",
  CZ: "cs",
  PL: "pl",
};

export function normalizeSeoPath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function marketBaseUrl(market: MarketCode): string {
  return `https://${marketToHost(market)}`;
}

export function absoluteUrl(market: MarketCode, path: string): string {
  return `${marketBaseUrl(market)}${normalizeSeoPath(path)}`;
}

export function alternateLanguagesForPath(
  path: string,
  markets: MarketCode[] = ALL_MARKETS,
): Record<string, string> {
  const normalizedPath = normalizeSeoPath(path);
  const languages: Record<string, string> = {};

  for (const market of markets) {
    languages[SEO_LOCALE_FOR[market]] =
      `${marketBaseUrl(market)}${normalizedPath}`;
  }

  const defaultMarket = markets.includes("GB") ? "GB" : markets[0];
  if (defaultMarket) {
    languages["x-default"] = `${marketBaseUrl(defaultMarket)}${normalizedPath}`;
  }

  return languages;
}

export function compactMetaDescription(text: string, maxLength = 155): string {
  const clean = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= maxLength) return clean;

  const cut = clean.lastIndexOf(" ", maxLength - 1);
  const end = cut > maxLength * 0.55 ? cut : maxLength - 1;
  return `${clean.slice(0, end).trimEnd()}...`;
}

interface PageMetadataOptions {
  market: MarketCode;
  path: string;
  title: string;
  description: string;
  alternateMarkets?: MarketCode[];
  images?: Array<{ url: string; alt?: string }>;
  /** og:type override — e.g. "product" for item pages. Default "website". */
  ogType?: "website" | "product";
}

export function pageMetadata({
  market,
  path,
  title,
  description,
  alternateMarkets = ALL_MARKETS,
  images,
  ogType = "website",
}: PageMetadataOptions): Metadata {
  const url = absoluteUrl(market, path);
  const metaDescription = compactMetaDescription(description, 160);
  const validImages = images?.filter((image) => image.url);

  const metadata: Metadata = {
    title,
    description: metaDescription,
    alternates: {
      canonical: url,
      languages: alternateLanguagesForPath(path, alternateMarkets),
    },
    openGraph: {
      type: "website",
      // og:locale uses underscore territory format (en_GB, de_DE, ...).
      locale: marketToLocale(market).replace("-", "_"),
      title,
      description: metaDescription,
      url,
      siteName: "BiggyIndex",
      images: validImages?.length ? validImages : undefined,
    },
    twitter: {
      card: validImages?.length ? "summary_large_image" : "summary",
      title,
      description: metaDescription,
      images: validImages?.map((image) => image.url),
    },
  };

  // Next 16's metadata resolver REJECTS og:type "product" at runtime
  // ("Invalid OpenGraph type: product" — and the throw drops ALL meta
  // tags for the page), so it can't be set here. Instead, suppress the
  // default og:type and let the page render
  // <meta property="og:type" content="product" /> itself — React 19
  // hoists it into <head>.
  if (ogType !== "website" && metadata.openGraph) {
    delete (metadata.openGraph as { type?: string }).type;
  }

  return metadata;
}
