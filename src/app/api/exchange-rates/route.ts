import { NextResponse } from "next/server";

/**
 * Exchange rate proxy — caches for 1 hour on Vercel edge.
 * Base currency: USD (all item prices are stored in USD).
 * Returns: { base: "USD", rates: { GBP: 0.79, EUR: 0.92, ... } }
 */

const CACHE_SECONDS = 3600; // 1 hour

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
    const rates = data?.rates;

    if (!rates || typeof rates !== "object") {
      return NextResponse.json(
        { error: "Invalid rate data" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { base: "USD", rates },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`,
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
