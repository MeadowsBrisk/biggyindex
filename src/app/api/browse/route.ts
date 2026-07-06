import { browseDataVersion, loadItems } from "@/lib/data";
import { ALL_MARKETS } from "@/lib/market/market";

/**
 * Browse dataset endpoint — serves the full (browse-stripped) item array
 * that the /browse page previously inlined into its RSC payload (~900KB of
 * flight data per market). Pattern from food-aggregator's /api/browse.
 *
 * Caching model:
 * - Pages embed `?v={browseDataVersion}` so the URL changes when the data
 *   does. Version-pinned responses are browser-cached immutably — repeat
 *   visits and tab-return refreshes cost zero requests.
 * - Unpinned requests fall back to ETag revalidation (cheap 304s).
 * - Netlify's CDN holds it durably at the edge (compressed), refreshing in
 *   the background, so the function body rarely runs.
 */

const VALID_MARKETS = new Set(ALL_MARKETS.map((code) => code.toLowerCase()));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mktParam = (url.searchParams.get("mkt") ?? "gb").toLowerCase();
  // Reject junk markets — each unique query string is a CDN cache key, so
  // unvalidated values would let anyone fill the cache with 404 payloads.
  const mkt = VALID_MARKETS.has(mktParam) ? mktParam : "gb";

  const items = await loadItems(mkt);
  const version = browseDataVersion(items);
  const etag = `"${mkt}-${version}"`;
  const pinned = url.searchParams.has("v");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ETag: etag,
    "Cache-Control": pinned
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control":
      "public, durable, s-maxage=900, stale-while-revalidate=86400",
    Vary: "Accept-Encoding",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(JSON.stringify(items), { headers });
}
