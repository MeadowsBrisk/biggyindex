import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getMarketFromHost } from "@/lib/market/market";

/**
 * Market-aware robots.txt — blocks known bad bots and disallows
 * filter query param URLs to avoid duplicate content.
 */

const DOMAINS: Record<string, string> = {
  GB: "https://biggyindex.com",
  IE: "https://ie.biggyindex.com",
  DE: "https://de.biggyindex.com",
  FR: "https://fr.biggyindex.com",
  PT: "https://pt.biggyindex.com",
  IT: "https://it.biggyindex.com",
  ES: "https://es.biggyindex.com",
  GR: "https://gr.biggyindex.com",
  CZ: "https://cz.biggyindex.com",
  PL: "https://pl.biggyindex.com",
};

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const market = getMarketFromHost(h.get("host"));
  const baseUrl = DOMAINS[market] ?? DOMAINS.GB;

  return {
    rules: [
      {
        userAgent: "*",
        // Explicit /api allows so the WRS renderer can fetch the browse
        // dataset + rates and render the full catalog during the rendering
        // wave. Google resolves by most-specific path, but explicit Allow
        // entries above the blanket /api/ disallow make the intent clear.
        //
        // "/browse?cat=" re-opens ONLY the category-filter form for crawling.
        // Under Google's longest-match rule the allow's 12 literal chars beat
        // the "/browse?*" disallow's 8 ("/browse?"), so /browse?cat=Flower is
        // fetchable while every other filter combo (q/pmin/pmax/sellers/sub/
        // excl) stays blocked. Crawlable != indexable: these responses carry
        // X-Robots-Tag: noindex, follow (next.config headers) + canonical to
        // /browse, so Googlebot follows the links and passes equity without
        // indexing the filtered URL.
        allow: ["/", "/api/browse", "/api/exchange-rates", "/browse?cat="],
        disallow: [
          "/api/",
          "/browse?*", // Filter combos — let Google discover /browse itself
          "/*?q=*",
          "/*?ref=*",
          "/*?pmin=*",
          "/*?pmax=*",
          "/*?sellers=*",
          "/*?sub=*",
          "/*?excl=*",
        ],
      },
      {
        userAgent: ["BabbarBot", "Barkrowler", "PetalBot"],
        disallow: ["/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
