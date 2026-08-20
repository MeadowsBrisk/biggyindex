import { browseDataVersion, loadItems, loadVariantWidths } from "@/lib/data";
import { itemVariantMasks } from "@/lib/images";
import { ALL_MARKETS } from "@/lib/market/market";

/**
 * Browse dataset endpoint — serves the full (browse-stripped) item array for
 * a market, keeping it out of the /browse page's RSC payload (~900KB/market).
 *
 * Caching model: pages embed `?v={browseDataVersion}` so the URL changes when
 * the data does; freshness is governed by the ETag (cheap 304s), and Netlify's
 * CDN holds the response durably so the function body rarely runs.
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

  // Cache-Control must stay UNCONDITIONAL — never branch it on `?v=`.
  // Netlify's cache key here is `netlify-vary: query=__nextDataReq|_rsc`, which
  // excludes `v`, so whichever request populates the durable entry decides the
  // Cache-Control served to everyone: a pin would either silently do nothing or
  // stick a year of immutable browser caching on clients that never asked for
  // it, unpurgeable. The ETag (content-addressed on browseDataVersion) is the
  // correct freshness mechanism. Keep one value.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ETag: etag,
    "Cache-Control": "public, max-age=0, must-revalidate",
    // A long edge TTL costs no correctness here: the payload is
    // content-addressed by ETag, so a stale entry still revalidates to a 304
    // against the same version. A short TTL just buys billed origin renders.
    "Netlify-CDN-Cache-Control":
      "public, durable, s-maxage=21600, stale-while-revalidate=86400",
    Vary: "Accept-Encoding",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(JSON.stringify(payload), { headers });
}
