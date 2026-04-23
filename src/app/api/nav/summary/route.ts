import { NextResponse } from "next/server";
import {
  deleteR2Keys,
  listR2Keys,
  readR2JSON,
  writeR2JSON,
} from "@/lib/r2-server";
import type { OutboundEvent } from "@/lib/tracking/outbound";

/**
 * GET /api/nav/summary
 *
 * Returns pre-aggregated outbound click summary.
 * If the cached summary is fresh (< 1 hour old), returns it directly.
 * Otherwise rebuilds from daily event files.
 *
 * Handles two R2 key formats:
 *   - Legacy daily arrays:    outbound/events/{YYYY-MM-DD}.json  (OutboundEvent[])
 *   - Individual event files: outbound/events/{YYYY-MM-DD}/{uid}.json (OutboundEvent)
 *
 * Individual events are consolidated into daily arrays during rebuild,
 * then the originals are deleted — keeping future rebuilds fast.
 *
 * Query params:
 *   ?rebuild=1  — force rebuild regardless of age
 */

interface OutboundItemSummary {
  clicks7d: number;
  clicks30d: number;
  clicksAll: number;
  lastClick: string;
  sn?: string;
  c?: string;
}

interface OutboundAggregateSummary {
  clicks7d: number;
  clicks30d: number;
  clicksAll: number;
}

interface OutboundSummary {
  builtAt: string;
  period: { from: string; to: string };
  items: Record<string, OutboundItemSummary>;
  sellers: Record<string, OutboundAggregateSummary>;
  categories: Record<string, OutboundAggregateSummary>;
  daily: Array<{ date: string; count: number }>;
}

const SUMMARY_KEY = "outbound/summary.json";
const ONE_HOUR_MS = 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRebuild = url.searchParams.get("rebuild") === "1";

    // Check existing summary freshness
    if (!forceRebuild) {
      const existing = await readR2JSON<OutboundSummary>(SUMMARY_KEY);
      if (existing?.builtAt) {
        const age = Date.now() - new Date(existing.builtAt).getTime();
        if (age < ONE_HOUR_MS) {
          return NextResponse.json(existing, {
            headers: { "Cache-Control": "public, max-age=300" },
          });
        }
      }
    }

    // Rebuild from event files (consolidates as it goes)
    const summary = await rebuildSummary();

    await writeR2JSON(SUMMARY_KEY, summary);

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[nav/summary] Error:", msg);
    return NextResponse.json(
      { error: "summary_build_failed" },
      { status: 500 },
    );
  }
}

// ─── Key format detection ───────────────────────────────────────

/** Legacy/consolidated daily array: outbound/events/2026-04-01.json */
const DAILY_RE = /^outbound\/events\/(\d{4}-\d{2}-\d{2})\.json$/;
/** Individual event file: outbound/events/2026-04-01/m1abc.json */
const EVENT_RE = /^outbound\/events\/(\d{4}-\d{2}-\d{2})\/.+\.json$/;

// ─── Helpers ────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function readBatch<T>(
  keys: string[],
  batchSize = 10,
): Promise<Array<T | null>> {
  const results: Array<T | null> = [];
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((key) => readR2JSON<T>(key)),
    );
    results.push(...batchResults);
  }
  return results;
}

// ─── Rebuild + consolidate ──────────────────────────────────────

async function rebuildSummary(): Promise<OutboundSummary> {
  const now = new Date();
  const cutoff90 = fmtDate(daysAgo(90));

  // List all keys under outbound/events/
  const allKeys = await listR2Keys("outbound/events/");

  // Classify keys
  const dailyKeys: Array<{ key: string; date: string }> = [];
  const individualKeys: Array<{ key: string; date: string }> = [];

  for (const key of allKeys) {
    const dailyMatch = key.match(DAILY_RE);
    if (dailyMatch && dailyMatch[1] >= cutoff90) {
      dailyKeys.push({ key, date: dailyMatch[1] });
      continue;
    }
    const eventMatch = key.match(EVENT_RE);
    if (eventMatch && eventMatch[1] >= cutoff90) {
      individualKeys.push({ key, date: eventMatch[1] });
    }
  }

  // Load daily arrays (already consolidated)
  const eventsByDate = new Map<string, OutboundEvent[]>();

  const dailyResults = await readBatch<OutboundEvent[]>(
    dailyKeys.map((d) => d.key),
  );
  for (let i = 0; i < dailyKeys.length; i++) {
    const { date } = dailyKeys[i];
    const events = dailyResults[i] ?? [];
    eventsByDate.set(date, events);
  }

  // Load individual events and merge into daily groups
  const keysToDelete: string[] = [];

  if (individualKeys.length > 0) {
    // Group individual keys by date
    const groupedByDate = new Map<string, string[]>();
    for (const { key, date } of individualKeys) {
      if (!groupedByDate.has(date)) groupedByDate.set(date, []);
      groupedByDate.get(date)!.push(key);
    }

    // Read all individual events
    const indivResults = await readBatch<OutboundEvent>(
      individualKeys.map((e) => e.key),
    );

    let idx = 0;
    for (const { date } of individualKeys) {
      const event = indivResults[idx++];
      if (!event) continue;
      if (!eventsByDate.has(date)) eventsByDate.set(date, []);
      eventsByDate.get(date)!.push(event);
    }

    // Consolidate: write merged daily arrays, queue individual keys for deletion
    for (const [date, keys] of groupedByDate) {
      const merged = eventsByDate.get(date) ?? [];
      await writeR2JSON(`outbound/events/${date}.json`, merged);
      keysToDelete.push(...keys);
    }

    // Fire-and-forget cleanup of individual event files
    deleteR2Keys(keysToDelete).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[nav/summary] cleanup error:", msg);
    });

    console.log(
      `[nav/summary] consolidated ${keysToDelete.length} events into ${groupedByDate.size} daily files`,
    );
  }

  // ─── Aggregate ────────────────────────────────────────────────

  const threshold30 = fmtDate(daysAgo(30));
  const threshold7 = fmtDate(daysAgo(7));

  const items: Record<string, OutboundItemSummary> = {};
  const sellers: Record<string, OutboundAggregateSummary> = {};
  const categories: Record<string, OutboundAggregateSummary> = {};
  const dailyCounts: Record<string, number> = {};

  for (const [date, events] of eventsByDate) {
    dailyCounts[date] = (dailyCounts[date] ?? 0) + events.length;
    const is30d = date >= threshold30;
    const is7d = date >= threshold7;

    for (const event of events) {
      // Items
      if (!items[event.id]) {
        items[event.id] = {
          clicks7d: 0,
          clicks30d: 0,
          clicksAll: 0,
          lastClick: new Date(event.ts ?? 0).toISOString(),
          sn: event.sn,
          c: event.c,
        };
      }
      const item = items[event.id];
      item.clicksAll++;
      if (is30d) item.clicks30d++;
      if (is7d) item.clicks7d++;
      const eventIso = new Date(event.ts ?? 0).toISOString();
      if (eventIso > item.lastClick) item.lastClick = eventIso;
      if (event.sn) item.sn = event.sn;
      if (event.c) item.c = event.c;

      // Sellers
      if (event.sid) {
        if (!sellers[event.sid]) {
          sellers[event.sid] = { clicks7d: 0, clicks30d: 0, clicksAll: 0 };
        }
        sellers[event.sid].clicksAll++;
        if (is30d) sellers[event.sid].clicks30d++;
        if (is7d) sellers[event.sid].clicks7d++;
      }

      // Categories
      if (event.c) {
        if (!categories[event.c]) {
          categories[event.c] = { clicks7d: 0, clicks30d: 0, clicksAll: 0 };
        }
        categories[event.c].clicksAll++;
        if (is30d) categories[event.c].clicks30d++;
        if (is7d) categories[event.c].clicks7d++;
      }
    }
  }

  // Build daily trend (last 30 days)
  const daily: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = fmtDate(daysAgo(i));
    daily.push({ date: d, count: dailyCounts[d] ?? 0 });
  }

  return {
    builtAt: now.toISOString(),
    period: {
      from: cutoff90,
      to: fmtDate(now),
    },
    items,
    sellers,
    categories,
    daily,
  };
}
