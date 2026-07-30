import type { Metadata } from "next";
import { getOgImageUrl, imageMimeType } from "@/lib/images";
import {
  ALL_MARKETS,
  type MarketCode,
  marketToHost,
  marketToLocale,
} from "@/lib/market/market";

/**
 * Site-wide default social-share image, served from `frontend/public`.
 * 1200x630 PNG — the standard og:image / summary_large_image aspect ratio.
 * Emitted (at the market's absolute host) whenever a page passes no images
 * of its own, so hub and legal pages always yield a rich card instead of a
 * bare `summary` with no preview.
 */
const DEFAULT_OG_IMAGE = {
  path: "/og-image.png",
  width: 1200,
  height: 630,
  type: "image/png",
} as const;

/**
 * Browser-tab + touch icons, declared explicitly rather than left to the
 * app-dir file convention.
 *
 * Chrome picks the LARGEST `rel=icon` it is offered, so the old
 * `src/app/icon.png` convention file (192x192) beat the real 48px brand mark
 * in the tab strip — it has been deleted and the tab icon is pinned here.
 *
 * IMPORTANT: setting `icons` in metadata REPLACES the app-dir icon file
 * convention for that segment and everything below it, which is why the
 * apple-touch entry has to be listed too (`src/app/apple-icon.png` no longer
 * emits anything). `/apple-touch-icon.png` in `public/` is byte-identical to
 * it. The 192/512 PNGs live on in `manifest.json` for install/home-screen use.
 *
 * Shared by the root layout (so the root 404 gets them) and the locale layout
 * (which would otherwise override the root's with nothing).
 */
export const SITE_ICONS: Metadata["icons"] = {
  icon: [
    { url: "/favicon.ico", sizes: "48x48" },
    { url: "/favicon.png", type: "image/png", sizes: "48x48" },
  ],
  apple: [
    { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
  ],
};

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
  images?: Array<{
    url: string;
    alt?: string;
    width?: number;
    height?: number;
    type?: string;
  }>;
  /** og:type override — e.g. "product" for item pages. Default "website". */
  ogType?: "website" | "product";
  /**
   * Emit `robots: noindex, follow` when true. Used for the narrow class of
   * never-translated foreign-market archived items — kept out of the index
   * (the English copy on biggyindex.com is the one that should rank) while
   * still letting crawlers follow the cross-link to it. `follow` stays on so
   * the outbound English link passes crawl signal.
   */
  noindex?: boolean;
}

interface ResolvedOgImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  type?: string;
}

export function pageMetadata({
  market,
  path,
  title,
  description,
  alternateMarkets = ALL_MARKETS,
  images,
  ogType = "website",
  noindex = false,
}: PageMetadataOptions): Metadata {
  const url = absoluteUrl(market, path);
  const metaDescription = compactMetaDescription(description, 160);
  const validImages = images?.filter((image) => image.url);

  // Page-supplied images (item/seller/category): rewrite optimised AVIF CDN
  // URLs to WebP so social scrapers can decode them, and tag each with its
  // MIME type. When a page supplies no image, fall back to the site-wide
  // default so EVERY page (hubs, legal, ...) yields a rich share card.
  const ogImages: ResolvedOgImage[] = validImages?.length
    ? validImages.map((image) => {
        const ogUrl = getOgImageUrl(image.url) ?? image.url;
        return {
          url: ogUrl,
          alt: image.alt,
          width: image.width,
          height: image.height,
          type: image.type ?? imageMimeType(ogUrl),
        };
      })
    : [
        {
          url: `${marketBaseUrl(market)}${DEFAULT_OG_IMAGE.path}`,
          alt: title,
          width: DEFAULT_OG_IMAGE.width,
          height: DEFAULT_OG_IMAGE.height,
          type: DEFAULT_OG_IMAGE.type,
        },
      ];

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
      images: ogImages,
    },
    twitter: {
      // We always emit at least the default image, so the large card is
      // always valid.
      card: "summary_large_image",
      title,
      description: metaDescription,
      images: ogImages.map((image) => image.url),
    },
  };

  // noindex,follow: keep this URL out of the index but let crawlers follow
  // its links (notably the English cross-link on never-translated foreign
  // archived items). Canonical/hreflang stay as-is — Google ignores hreflang
  // on a noindexed page, so a self-only cluster here is harmless.
  if (noindex) {
    metadata.robots = { index: false, follow: true };
  }

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
