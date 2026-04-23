import { NextResponse } from "next/server";
import { readR2JSON, R2Keys } from "@/lib/r2";

/**
 * Proxy for seller detail from R2.
 * Client components can't fetch R2 directly (CORS), so this
 * route proxies the read server-side and caches the response.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const detail = await readR2JSON(R2Keys.sellerDetail(id));

  if (!detail) {
    return NextResponse.json(
      { error: "not_found", id },
      { status: 404 },
    );
  }

  return NextResponse.json(detail, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=43200, stale-while-revalidate=86400",
    },
  });
}
