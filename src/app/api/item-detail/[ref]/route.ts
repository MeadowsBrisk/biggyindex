import { NextResponse } from "next/server";
import { loadArchivedDetail } from "@/lib/data";
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
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  const url = new URL(request.url);
  const mkt = (url.searchParams.get("mkt") ?? "gb").toLowerCase();

  const live = await readR2JSON<MergedDetailBlob>(
    R2Keys.mergedDetail(mkt, ref),
  );
  const archived = live ? null : await loadArchivedDetail(ref, mkt);
  const detail = live ?? archived;

  if (!detail) {
    return NextResponse.json({ error: "not_found", ref }, { status: 404 });
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
      },
    },
  );
}
