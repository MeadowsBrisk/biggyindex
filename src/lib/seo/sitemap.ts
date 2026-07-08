import type { MetadataRoute } from "next";
import { ALL_MARKETS, type MarketCode } from "@/lib/market/market";
import { R2Keys, readR2JSON } from "@/lib/r2";
import { alternateLanguagesForPath, marketBaseUrl } from "@/lib/seo/metadata";
import type { Item, Seller } from "@/lib/types";

export const SITEMAP_IDS = ["static", "items", "sellers"] as const;

export type SitemapId = (typeof SITEMAP_IDS)[number];

export function normalizeSitemapId(rawId: string): SitemapId | null {
  const id = rawId.endsWith(".xml") ? rawId.slice(0, -4) : rawId;
  return SITEMAP_IDS.includes(id as SitemapId) ? (id as SitemapId) : null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function sitemapIndexXml(market: MarketCode): string {
  const baseUrl = marketBaseUrl(market);
  const entries = SITEMAP_IDS.map(
    (id) =>
      `  <sitemap><loc>${escapeXml(baseUrl)}/sitemap/${id}.xml</loc></sitemap>`,
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;
}

export function sitemapEntriesXml(entries: MetadataRoute.Sitemap): string {
  const urls = entries
    .map((entry) => {
      const lastModified = entry.lastModified
        ? new Date(entry.lastModified).toISOString()
        : null;
      const alternates = Object.entries(entry.alternates?.languages ?? {})
        .map(([language, href]) =>
          href
            ? `<xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(href)}"/>`
            : "",
        )
        .join("");

      return `<url><loc>${escapeXml(entry.url)}</loc>${lastModified ? `<lastmod>${lastModified}</lastmod>` : ""}<changefreq>${entry.changeFrequency ?? "weekly"}</changefreq><priority>${entry.priority ?? 0.5}</priority>${alternates}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
}

export async function getSitemapEntries(
  id: SitemapId,
  market: MarketCode,
): Promise<MetadataRoute.Sitemap> {
  const baseUrl = marketBaseUrl(market);

  switch (id) {
    case "static":
      return staticSitemap(baseUrl);
    case "items":
      return itemsSitemap(market, baseUrl);
    case "sellers":
      return sellersSitemap(market, baseUrl);
  }
}

function staticSitemap(baseUrl: string): MetadataRoute.Sitemap {
  const pages = ["/", "/browse", "/sellers", "/reviews"];
  const legalPages = ["/privacy", "/terms", "/cookies"];

  // No lastModified for static pages — stamping new Date() on every render is
  // a lying signal; Google's own crawl signals are more reliable than that.
  return [
    ...pages.map((path) => ({
      url: `${baseUrl}${path}`,
      changeFrequency: path === "/" ? ("daily" as const) : ("weekly" as const),
      priority: path === "/" ? 1.0 : path === "/browse" ? 0.9 : 0.7,
      alternates: {
        languages: alternateLanguagesForPath(path, ALL_MARKETS),
      },
    })),
    ...legalPages.map((path) => ({
      url: `${baseUrl}${path}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
      alternates: {
        languages: alternateLanguagesForPath(path, ALL_MARKETS),
      },
    })),
  ];
}

async function itemsSitemap(
  market: MarketCode,
  baseUrl: string,
): Promise<MetadataRoute.Sitemap> {
  const allResults = await Promise.all(
    ALL_MARKETS.map(async (candidateMarket) => {
      const items = await readR2JSON<Item[]>(
        R2Keys.items(candidateMarket.toLowerCase()),
      );
      return { market: candidateMarket, items: items ?? [] };
    }),
  );

  const presence = new Map<string, Set<MarketCode>>();
  for (const { market: candidateMarket, items } of allResults) {
    for (const item of items) {
      const ref = String(item.refNum ?? item.id);
      let itemMarkets = presence.get(ref);
      if (!itemMarkets) {
        itemMarkets = new Set();
        presence.set(ref, itemMarkets);
      }
      itemMarkets.add(candidateMarket);
    }
  }

  const currentItems =
    allResults.find((result) => result.market === market)?.items ?? [];

  return currentItems.map((item) => {
    const ref = String(item.refNum ?? item.id);
    const itemMarkets = presence.get(ref) ?? new Set([market]);
    const path = `/item/${encodeURIComponent(ref)}`;
    const lastmod = item.lua ?? item.fsa;

    return {
      url: `${baseUrl}${path}`,
      lastModified: lastmod ? new Date(lastmod) : new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
      alternates: {
        languages: alternateLanguagesForPath(path, [...itemMarkets]),
      },
    };
  });
}

async function sellersSitemap(
  market: MarketCode,
  baseUrl: string,
): Promise<MetadataRoute.Sitemap> {
  const allResults = await Promise.all(
    ALL_MARKETS.map(async (candidateMarket) => {
      const sellers = await readR2JSON<Seller[]>(
        R2Keys.sellers(candidateMarket.toLowerCase()),
      );
      return { market: candidateMarket, sellers: sellers ?? [] };
    }),
  );

  const presence = new Map<string, Set<MarketCode>>();
  for (const { market: candidateMarket, sellers } of allResults) {
    for (const seller of sellers) {
      if (seller.id == null) continue;
      const id = String(seller.id);
      let sellerMarkets = presence.get(id);
      if (!sellerMarkets) {
        sellerMarkets = new Set();
        presence.set(id, sellerMarkets);
      }
      sellerMarkets.add(candidateMarket);
    }
  }

  const currentSellers =
    allResults.find((result) => result.market === market)?.sellers ?? [];

  return currentSellers.flatMap((seller) => {
    if (seller.id == null) return [];
    const id = String(seller.id);
    const sellerMarkets = presence.get(id) ?? new Set([market]);
    const path = `/seller/${encodeURIComponent(id)}`;

    // No lastModified — no reliable per-seller signal here today; a real one
    // (e.g. latest review date) can be added later.
    return [
      {
        url: `${baseUrl}${path}`,
        changeFrequency: "weekly" as const,
        priority: 0.5,
        alternates: {
          languages: alternateLanguagesForPath(path, [...sellerMarkets]),
        },
      },
    ];
  });
}
