import { NextResponse } from "next/server";
import { type ArchivedDetailBlob, loadArchivedDetail } from "@/lib/data";
import { ALL_MARKETS, getMarketFromHost } from "@/lib/market/market";
import { R2Keys, readR2JSON } from "@/lib/r2";
import type { MergedDetailBlob } from "@/lib/types";

/**
 * Proxy for merged item detail blobs from R2.
 * Client components can't fetch R2 directly (CORS), so this
 * route proxies the read server-side.
 *
 * Delisted items fall back to the manifest-gated archive snapshot;
 * those responses carry `archived: true` so clients can tell.
 */

const VALID_MARKETS = new Set(ALL_MARKETS.map((code) => code.toLowerCase()));

// The CDN entry must be keyed on `mkt`, or the first market to populate it
// serves its own prices and shipping to every other market for the whole TTL.
const NETLIFY_VARY = "query=mkt|__nextDataReq|_rsc";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  const url = new URL(request.url);
  // Default the market from the Host, not "gb", and reject anything outside
  // the known set — an arbitrary `mkt` would otherwise become an R2 key.
  const hostMarket = getMarketFromHost(
    request.headers.get("host"),
  ).toLowerCase();
  const mktParam = (url.searchParams.get("mkt") ?? hostMarket).toLowerCase();
  const mkt = VALID_MARKETS.has(mktParam) ? mktParam : hostMarket;

  let live: MergedDetailBlob | null;
  let archived: ArchivedDetailBlob | null;
  try {
    live = await readR2JSON<MergedDetailBlob>(R2Keys.mergedDetail(mkt, ref));
    archived = live ? null : await loadArchivedDetail(ref, mkt);
  } catch {
    // Transient R2 failure — never cache it as a 404.
    return NextResponse.json(
      { error: "unavailable", ref },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const detail = live ?? archived;

  if (!detail) {
    return NextResponse.json(
      { error: "not_found", ref },
      {
        status: 404,
        headers: {
          // Short and cacheable: unknown refs are otherwise a pure invocation
          // firehose, but a ref probed before its item exists must recover
          // quickly.
          "Cache-Control": "public, max-age=60, s-maxage=300",
          "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300",
          "Netlify-Vary": NETLIFY_VARY,
        },
      },
    );
  }

  return NextResponse.json(
    archived ? { ...archived, archived: true } : detail,
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=43200, stale-while-revalidate=86400",
        // Durable: one cached copy across Netlify's whole CDN (not per edge
        // node) — the function and R2 read run far less often.
        "Netlify-CDN-Cache-Control":
          "public, durable, s-maxage=43200, stale-while-revalidate=86400",
        "Netlify-Vary": NETLIFY_VARY,
      },
    },
  );
}
