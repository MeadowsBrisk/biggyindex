import { NextResponse } from "next/server";
import { readR2JSON, R2Keys } from "@/lib/r2";
import type { Item } from "@/lib/types";

/**
 * Client-side item fetch endpoint.
 * Used for modal overlays / SPA navigation when item data
 * isn't already in the Jotai store.
 *
 * Accepts ?mkt=gb query param (injected by proxy.ts for production,
 * passed explicitly by client in dev).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  const url = new URL(request.url);
  const mkt = (url.searchParams.get("mkt") ?? "gb").toLowerCase();

  const items = await readR2JSON<Item[]>(R2Keys.items(mkt));
  if (!items) {
    return NextResponse.json(
      { error: "data_unavailable" },
      { status: 503 },
    );
  }

  const item = items.find(
    (i) => String(i.refNum) === ref || String(i.id) === ref,
  );

  if (!item) {
    return NextResponse.json(
      { error: "not_found", ref },
      { status: 404 },
    );
  }

  return NextResponse.json(item);
}
