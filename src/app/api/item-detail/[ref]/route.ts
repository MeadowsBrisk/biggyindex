import { NextResponse } from "next/server";
import { readR2JSON, R2Keys } from "@/lib/r2";
import type { MergedDetailBlob } from "@/lib/types";

/**
 * Proxy for merged item detail blobs from R2.
 * Client components can't fetch R2 directly (CORS), so this
 * route proxies the read server-side.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  const url = new URL(request.url);
  const mkt = (url.searchParams.get("mkt") ?? "gb").toLowerCase();

  const detail = await readR2JSON<MergedDetailBlob>(
    R2Keys.mergedDetail(mkt, ref),
  );

  if (!detail) {
    return NextResponse.json(
      { error: "not_found", ref },
      { status: 404 },
    );
  }

  return NextResponse.json(detail, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=43200, stale-while-revalidate=86400",
    },
  });
}
