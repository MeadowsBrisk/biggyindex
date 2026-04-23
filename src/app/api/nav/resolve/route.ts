import { type NextRequest, NextResponse } from "next/server";
import { writeR2JSON } from "@/lib/r2-server";
import type { OutboundEvent } from "@/lib/tracking/outbound";

/**
 * POST /api/nav/resolve
 *
 * Outbound click event endpoint. Receives sendBeacon payloads
 * from the client when a user clicks through to a seller page.
 *
 * Named "nav/resolve" to avoid ad-blocker heuristics.
 *
 * Each event is written as its own R2 key — no read-modify-write,
 * so concurrent requests cannot race. The summary endpoint
 * consolidates individual events into daily arrays periodically.
 *
 * Key format: outbound/events/{YYYY-MM-DD}/{uid}.json
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate minimum required fields
    const { id, url } = body;
    if (!id || !url) {
      return new NextResponse(null, { status: 204 });
    }

    const event: OutboundEvent = {
      id: String(id),
      url: String(url),
      sid: body.sid ? String(body.sid) : undefined,
      sn: body.sn || undefined,
      c: body.c || undefined,
      mkt: body.mkt || "GB",
      ts: body.ts || Date.now(),
    };

    // Unique key per event — no read needed, no race possible
    const dateStr = new Date().toISOString().slice(0, 10);
    const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const key = `outbound/events/${dateStr}/${uid}.json`;

    await writeR2JSON(key, event);

    console.log(
      `[nav] ${event.mkt} | ${event.id} → ${event.sn ?? "unknown"}`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[nav] write error:", msg);
  }

  return new NextResponse(null, { status: 204 });
}
