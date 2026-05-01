import { type NextRequest, NextResponse } from "next/server";
import { getMarketFromHost } from "@/lib/market/market";
import {
  getSitemapEntries,
  normalizeSitemapId,
  sitemapEntriesXml,
} from "@/lib/seo/sitemap";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id: rawId } = await context.params;
  const id = normalizeSitemapId(rawId);
  if (!id) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const market = getMarketFromHost(request.headers.get("host"));
  const entries = await getSitemapEntries(id, market);

  return new NextResponse(sitemapEntriesXml(entries), {
    headers: {
      "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
