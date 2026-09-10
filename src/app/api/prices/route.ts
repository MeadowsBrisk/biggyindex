import { browseDataVersion, loadItems } from "@/lib/data";
import { getServerCurrency } from "@/lib/market/currency";
import {
  ALL_MARKETS,
  getMarketFromHost,
  type MarketCode,
} from "@/lib/market/market";
import {
  buildDistillateBands,
  buildPriceIndex,
  buildWeightTable,
  type WeightCell,
} from "@/lib/prices/price-index";
import { buildVapeTiles } from "@/lib/prices/vapes";
import { absoluteUrl } from "@/lib/seo/metadata";

/**
 * Price index as JSON — the same computation as /prices, in the market
 * currency. Public and CORS-open: it only mirrors what the page renders.
 * Caching follows /api/browse (durable edge TTL, freshness via ETag).
 */

const VALID_MARKETS = new Set(ALL_MARKETS.map((code) => code.toLowerCase()));

/** Self-describing band names — the internal keys carry no units. */
const DISTILLATE_BANDS = {
  bandSmall: "upTo5ml",
  bandMid: "5to50ml",
  bandLarge: "over50ml",
} as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  // Default the market from the Host, not "gb": the CDN collapses query
  // variants into one entry per host, so a bare-URL fetch on a locale host
  // must still serve that host's own market.
  const hostMarket = getMarketFromHost(
    request.headers.get("host"),
  ).toLowerCase();
  const mktParam = (url.searchParams.get("mkt") ?? hostMarket).toLowerCase();
  const mkt = VALID_MARKETS.has(mktParam) ? mktParam : hostMarket;
  const market = mkt.toUpperCase() as MarketCode;

  let items: Awaited<ReturnType<typeof loadItems>>;
  try {
    items = await loadItems(mkt);
  } catch {
    // Transient R2 failure — a durably cached empty index would outlive the
    // outage by hours, so serve an uncacheable 503 instead.
    return new Response(JSON.stringify({ error: "unavailable" }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  // Keeps the market currency on a shared approximate rate if the live rate
  // is unavailable, rather than handing back USD amounts labelled GBP.
  const currency = await getServerCurrency(market, {
    approximateFallback: true,
  });
  const money = (usd: number): number =>
    Number((usd * currency.rate).toFixed(2));

  const index = buildPriceIndex(items);
  const weights = buildWeightTable(items);
  const vapes = buildVapeTiles(items);
  const distillate = buildDistillateBands(items);

  const payload = {
    market,
    currency: currency.code,
    /** Multiplier applied to the stored USD amounts to reach `currency`. */
    usdRate: Number(currency.rate.toFixed(6)),
    /** Freshest listing stamp behind the figures, not the time of the request. */
    updatedAt: index?.updatedAt ?? null,
    listings: index?.listingCount ?? 0,
    medianPerGram: index ? money(index.overallMedian) : null,
    cheapestPerGram: index ? money(index.cheapest) : null,
    categories:
      index?.categories.map((stats) => ({
        category: stats.category,
        listings: stats.listings,
        medianPerGram: money(stats.median),
        p25PerGram: money(stats.p25),
        p75PerGram: money(stats.p75),
        minPerGram: money(stats.min),
      })) ?? [],
    weights: weights.map((row) => ({
      category: row.category,
      // Grams, matched exactly and listed smallest first; a size appears only
      // where enough listings sell it for a median to mean anything.
      sizes: row.cells
        .filter((cell): cell is WeightCell => cell !== null)
        .map((cell) => ({
          grams: cell.size,
          median: money(cell.median),
          listings: cell.listings,
        })),
    })),
    vapeCarts: vapes.map((tile) => ({
      sizeMl: tile.size,
      median: money(tile.median),
      listings: tile.items,
      sellers: tile.sellers,
    })),
    distillate: distillate.map((band) => ({
      band: DISTILLATE_BANDS[band.key],
      medianPerMl: money(band.median),
      listings: band.count,
    })),
    source: absoluteUrl(market, "/prices"),
    note: "Asking prices from live Little Biggy listings, converted to the market currency. Medians, not completed sales.",
  };

  // Content-addressed on the catalogue version plus the conversion rate —
  // both of which move the numbers below.
  const etag = `"${mkt}-${browseDataVersion(items)}-${currency.code}-${currency.rate.toFixed(4)}"`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ETag: etag,
    // Unconditional, as on /api/browse: whichever request fills the durable
    // CDN entry decides the Cache-Control everyone gets, so there is exactly
    // one value and the ETag does the freshness work.
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control":
      "public, durable, s-maxage=21600, stale-while-revalidate=86400",
    "Netlify-Vary": "query=mkt|__nextDataReq|_rsc",
    Vary: "Accept-Encoding",
    // The same figures the page renders — no reason to fence them off.
    "Access-Control-Allow-Origin": "*",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(JSON.stringify(payload), { headers });
}
