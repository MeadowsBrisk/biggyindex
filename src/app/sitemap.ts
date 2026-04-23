import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { readR2JSON, R2Keys } from "@/lib/r2";
import { getMarketFromHost, ALL_MARKETS, type MarketCode, marketToLocale } from "@/lib/market/market";
import { CATEGORIES } from "@/lib/constants";
import type { Item, Seller } from "@/lib/types";

/**
 * Market-aware sitemap — split into static, items, sellers, categories.
 *
 * Uses `generateSitemaps()` so Next.js serves a sitemap index at /sitemap.xml
 * pointing to /sitemap/0.xml (static), /sitemap/1.xml (items), etc.
 *
 * Includes hreflang alternates pointing to all markets where an item exists.
 */

const DOMAINS: Record<MarketCode, string> = {
  GB: "https://biggyindex.com",
  DE: "https://de.biggyindex.com",
  FR: "https://fr.biggyindex.com",
  PT: "https://pt.biggyindex.com",
  IT: "https://it.biggyindex.com",
  ES: "https://es.biggyindex.com",
};

const LOCALE_FOR: Record<MarketCode, string> = {
  GB: "en",
  DE: "de",
  FR: "fr",
  PT: "pt",
  IT: "it",
  ES: "es",
};

export async function generateSitemaps() {
  return [
    { id: "static" },
    { id: "categories" },
    { id: "items" },
    { id: "sellers" },
  ];
}

async function getCurrentMarket(): Promise<MarketCode> {
  const h = await headers();
  return getMarketFromHost(h.get("host"));
}

function altLanguages(markets: MarketCode[]): Record<string, string> {
  const alts: Record<string, string> = {};
  for (const m of markets) {
    alts[LOCALE_FOR[m]] = DOMAINS[m];
  }
  // x-default → GB (English)
  if (markets.includes("GB")) {
    alts["x-default"] = DOMAINS.GB;
  }
  return alts;
}

function altLanguagesForPath(path: string, markets: MarketCode[]): Record<string, string> {
  const alts: Record<string, string> = {};
  for (const m of markets) {
    alts[LOCALE_FOR[m]] = `${DOMAINS[m]}${path}`;
  }
  if (markets.includes("GB")) {
    alts["x-default"] = `${DOMAINS.GB}${path}`;
  }
  return alts;
}

export default async function sitemap({
  id,
}: { id: string }): Promise<MetadataRoute.Sitemap> {
  const market = await getCurrentMarket();
  const baseUrl = DOMAINS[market];

  switch (id) {
    case "static":
      return staticSitemap(baseUrl);
    case "categories":
      return categorySitemap(baseUrl);
    case "items":
      return itemsSitemap(market, baseUrl);
    case "sellers":
      return sellersSitemap(market, baseUrl);
    default:
      return [];
  }
}

// ── Static pages ──────────────────────────────────────────────

function staticSitemap(baseUrl: string): MetadataRoute.Sitemap {
  const pages = ["/", "/browse", "/sellers", "/reviews"];

  return pages.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1.0 : path === "/browse" ? 0.9 : 0.7,
    alternates: {
      languages: altLanguagesForPath(path, ALL_MARKETS),
    },
  }));
}

// ── Categories ────────────────────────────────────────────────

function categorySitemap(baseUrl: string): MetadataRoute.Sitemap {
  return CATEGORIES.map((cat) => ({
    url: `${baseUrl}/browse?cat=${encodeURIComponent(cat)}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
    alternates: {
      languages: altLanguagesForPath(
        `/browse?cat=${encodeURIComponent(cat)}`,
        ALL_MARKETS,
      ),
    },
  }));
}

// ── Items ─────────────────────────────────────────────────────

async function itemsSitemap(
  market: MarketCode,
  baseUrl: string,
): Promise<MetadataRoute.Sitemap> {
  // Load all markets to build cross-market presence for hreflang
  const allResults = await Promise.all(
    ALL_MARKETS.map(async (m) => {
      const items = await readR2JSON<Item[]>(R2Keys.items(m.toLowerCase()));
      return { market: m, items: items ?? [] };
    }),
  );

  // Build presence map: refNum → set of markets
  const presence = new Map<string, Set<MarketCode>>();
  for (const { market: m, items } of allResults) {
    for (const item of items) {
      const ref = String(item.refNum ?? item.id);
      if (!presence.has(ref)) presence.set(ref, new Set());
      presence.get(ref)!.add(m);
    }
  }

  // Get current market's items
  const currentItems =
    allResults.find((r) => r.market === market)?.items ?? [];

  return currentItems.map((item) => {
    const ref = String(item.refNum ?? item.id);
    const itemMarkets = presence.get(ref) ?? new Set([market]);
    const lastmod = item.lua ?? item.fsa;

    return {
      url: `${baseUrl}/item/${encodeURIComponent(ref)}`,
      lastModified: lastmod ? new Date(lastmod) : new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
      alternates: {
        languages: altLanguagesForPath(
          `/item/${encodeURIComponent(ref)}`,
          [...itemMarkets],
        ),
      },
    };
  });
}

// ── Sellers ───────────────────────────────────────────────────

async function sellersSitemap(
  market: MarketCode,
  baseUrl: string,
): Promise<MetadataRoute.Sitemap> {
  const allResults = await Promise.all(
    ALL_MARKETS.map(async (m) => {
      const sellers = await readR2JSON<Seller[]>(R2Keys.sellers(m.toLowerCase()));
      return { market: m, sellers: sellers ?? [] };
    }),
  );

  // Build presence map: sellerId → set of markets
  const presence = new Map<string, Set<MarketCode>>();
  for (const { market: m, sellers } of allResults) {
    for (const s of sellers) {
      const id = String(s.id);
      if (!presence.has(id)) presence.set(id, new Set());
      presence.get(id)!.add(m);
    }
  }

  const currentSellers =
    allResults.find((r) => r.market === market)?.sellers ?? [];

  return currentSellers.map((s) => {
    const id = String(s.id);
    const sellerMarkets = presence.get(id) ?? new Set([market]);

    return {
      url: `${baseUrl}/sellers?seller=${encodeURIComponent(id)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.5,
      alternates: {
        languages: altLanguagesForPath(
          `/sellers?seller=${encodeURIComponent(id)}`,
          [...sellerMarkets],
        ),
      },
    };
  });
}
