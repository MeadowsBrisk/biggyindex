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
        allow: "/",
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
