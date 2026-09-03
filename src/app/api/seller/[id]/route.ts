import { NextResponse } from "next/server";
import { R2Keys, readR2JSON } from "@/lib/r2";

/**
 * Proxy for seller detail from R2.
 * Client components can't fetch R2 directly (CORS), so this
 * route proxies the read server-side and caches the response.
 *
 * Seller detail is shared across markets, so the CDN entry is keyed only on
 * the framework's own params — no `mkt` to vary on.
 */

const NETLIFY_VARY = "query=__nextDataReq|_rsc";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let detail: unknown;
  try {
    detail = await readR2JSON(R2Keys.sellerDetail(id));
  } catch {
    // Transient R2 failure — never cache it as a 404.
    return NextResponse.json(
      { error: "unavailable", id },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!detail) {
    return NextResponse.json(
      { error: "not_found", id },
      {
        status: 404,
        headers: {
          // Short and cacheable: unknown ids are otherwise a pure invocation
          // firehose, but a new seller must appear without a long wait.
          "Cache-Control": "public, max-age=60, s-maxage=300",
          "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300",
          "Netlify-Vary": NETLIFY_VARY,
        },
      },
    );
  }

  return NextResponse.json(detail, {
    headers: {
      "Cache-Control":
        "public, max-age=60, s-maxage=600, stale-while-revalidate=3600",
      // Durable: one cached copy across Netlify's whole CDN (not per edge
      // node) — the function and R2 read run far less often.
      "Netlify-CDN-Cache-Control":
        "public, durable, s-maxage=600, stale-while-revalidate=3600",
      "Netlify-Vary": NETLIFY_VARY,
    },
  });
}
