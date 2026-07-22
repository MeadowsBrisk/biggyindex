import { browseDataVersion, loadItems, loadVariantWidths } from "@/lib/data";
import { itemVariantMasks } from "@/lib/images";
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

  // Augment each item with a compact responsive-variant field `vw` (bitmask
  // per image slot over CARD_VARIANT_WIDTHS) so client cards can build a
  // srcset with no extra fetch of image-meta. Omitted when an item has no
  // variants; animated slots are zeroed. Adds < 1KB brotli to the payload.
  const variantWidths = await loadVariantWidths();
  const lookup = (hash: string): number[] | undefined => variantWidths[hash];
  const payload = items.map((item) => {
    const vw = itemVariantMasks(item, lookup);
    return vw ? { ...item, vw } : item;
  });

  const version = browseDataVersion(items);
  const etag = `"${mkt}-${version}"`;

  // ── Cache-Control is UNCONDITIONAL. Do not reintroduce a `?v=` ternary. ────
  // Until 2026-07-21 this read:
  //   const pinned = url.searchParams.has("v");
  //   "Cache-Control": pinned ? "public, max-age=31536000, immutable"
  //                           : "public, max-age=0, must-revalidate"
  // That is unsafe here, and it is the SAME shape as the July 13 /browse
  // noindex incident (see next.config.ts headers()): Netlify's cache key for
  // this route is `netlify-vary: query=__nextDataReq|_rsc` — our `v` param is
  // NOT part of it. So whichever request populates the durable entry decides
  // the Cache-Control served to EVERYONE. Measured live: a `?v=1` request came
  // back `public,max-age=0,must-revalidate` (the pin silently did nothing), and
  // the reverse race would pin a YEAR of immutable browser caching on clients
  // that never asked for it — unfixable without a purge users can't receive.
  // Freshness is already governed by the ETag (content-addressed on
  // browseDataVersion), which is the correct mechanism. Keep one value.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ETag: etag,
    "Cache-Control": "public, max-age=0, must-revalidate",
    // s-maxage 900 → 21600 (2026-07-21): the payload is content-addressed by
    // ETag, so a longer edge TTL costs no correctness — a stale entry still
    // revalidates to a 304 against the same version. 15 min was forcing a
    // billed origin render every quarter hour per market during the Netlify
    // Free-tier invocation incident.
    "Netlify-CDN-Cache-Control":
      "public, durable, s-maxage=21600, stale-while-revalidate=86400",
    Vary: "Accept-Encoding",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(JSON.stringify(payload), { headers });
}
