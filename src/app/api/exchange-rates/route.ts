import { NextResponse } from "next/server";

/**
 * Exchange rate proxy — caches for 1 hour at the CDN.
 * Base currency: USD (all item prices are stored in USD).
 * Returns: { base: "USD", rates: { GBP: 0.79, EUR: 0.92, ... } }
 *
 * Only the currencies the UI can display are returned (the upstream
 * response carries ~160). Extend SUPPORTED_CURRENCIES when adding a
 * market with a new currency — keep it in sync with `DisplayCurrency`
 * in store/atoms.ts.
 */

const CACHE_SECONDS = 3600; // 1 hour

const SUPPORTED_CURRENCIES = ["USD", "GBP", "EUR", "CZK", "PLN"] as const;

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: CACHE_SECONDS },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream rate fetch failed" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const upstreamRates = data?.rates;

    if (!upstreamRates || typeof upstreamRates !== "object") {
      return NextResponse.json({ error: "Invalid rate data" }, { status: 502 });
    }

    const rates: Record<string, number> = {};
    for (const code of SUPPORTED_CURRENCIES) {
      const rate = (upstreamRates as Record<string, unknown>)[code];
      if (typeof rate === "number" && rate > 0) rates[code] = rate;
    }

    return NextResponse.json(
      { base: "USD", rates },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`,
          // Durable: cached once across Netlify's whole CDN instead of
          // per-edge-node, so the function (and upstream API) rarely runs.
          "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`,
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Exchange rate fetch failed" },
      { status: 502 },
    );
  }
}
