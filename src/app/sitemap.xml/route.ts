import { type NextRequest, NextResponse } from "next/server";
import { getMarketFromHost } from "@/lib/market/market";
import { sitemapIndexXml } from "@/lib/seo/sitemap";

export function GET(request: NextRequest): NextResponse {
  const market = getMarketFromHost(request.headers.get("host"));

  return new NextResponse(sitemapIndexXml(market), {
    headers: {
      "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
