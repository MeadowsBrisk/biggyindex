import { connection, NextResponse } from "next/server";
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
 * Returns pre-aggregated outbound click analytics. The dashboard reads the
 * resulting outbound/summary.json object directly from R2, so this endpoint is
 * only for rebuilds, manual checks, and future scheduled refreshes.
 *
 * Event flow:
 *   - Clicks write append-only files: outbound/events/{YYYY-MM-DD}/{uid}.json
 *   - Rebuilds consolidate those files into outbound/events/{YYYY-MM-DD}.json
 *   - Rebuilds publish one dashboard-friendly outbound/summary.json
 *
 * Query params:
 *   ?rebuild=1  force rebuild regardless of cache age
 */

interface OutboundAggregateSummary {
  clicks1d: number;
  clicks7d: number;
  clicks30d: number;
  clicksAll: number;
}

interface OutboundItemSummary extends OutboundAggregateSummary {
  lastClick: string;
  sn?: string;
  c?: string;
  url?: string;
  mkt?: string;
  n?: string;
}

interface OutboundSummary {
  builtAt: string;
  period: { from: string; to: string };
  items: Record<string, OutboundItemSummary>;
  sellers: Record<string, OutboundAggregateSummary>;
  categories: Record<string, OutboundAggregateSummary>;
  markets: Record<string, OutboundAggregateSummary>;
  daily: Array<{ date: string; count: number }>;
  recent: OutboundEvent[];
}

const SUMMARY_KEY = "outbound/summary.json";
const ONE_HOUR_MS = 60 * 60 * 1000;
const SUMMARY_WINDOW_DAYS = 90;
const RECENT_LIMIT = 100;

const DAILY_RE = /^outbound\/events\/(\d{4}-\d{2}-\d{2})\.json$/;
const EVENT_RE = /^outbound\/events\/(\d{4}-\d{2}-\d{2})\/.+\.json$/;

export async function GET(request: Request) {
  await connection();

  try {
    const url = new URL(request.url);
    const forceRebuild = url.searchParams.get("rebuild") === "1";

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

    const summary = await rebuildSummary();
    await writeR2JSON(SUMMARY_KEY, summary);

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[nav/summary] Error:", message);
    return NextResponse.json(
      { error: "summary_build_failed" },
      { status: 500 },
    );
  }
}

function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function windowStartDate(days: number): string {
  return fmtDate(daysAgo(days - 1));
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

function createAggregate(): OutboundAggregateSummary {
  return {
    clicks1d: 0,
    clicks7d: 0,
    clicks30d: 0,
    clicksAll: 0,
  };
}

function bumpAggregate(
  aggregate: OutboundAggregateSummary,
  date: string,
  thresholds: { oneDay: string; sevenDays: string; thirtyDays: string },
): void {
  aggregate.clicksAll++;
  if (date >= thresholds.thirtyDays) aggregate.clicks30d++;
  if (date >= thresholds.sevenDays) aggregate.clicks7d++;
  if (date >= thresholds.oneDay) aggregate.clicks1d++;
}

function eventTimestamp(event: OutboundEvent, date: string): number {
  if (typeof event.ts === "number" && Number.isFinite(event.ts)) {
    return event.ts;
  }
  return Date.parse(`${date}T00:00:00.000Z`);
}

function eventKey(event: OutboundEvent): string {
  return `${event.id}|${event.url}|${event.ts ?? ""}`;
}

function getOrCreateEvents(
  eventsByDate: Map<string, OutboundEvent[]>,
  date: string,
): OutboundEvent[] {
  const existing = eventsByDate.get(date);
  if (existing) return existing;

  const events: OutboundEvent[] = [];
  eventsByDate.set(date, events);
  return events;
}

function getOrCreateDedupe(
  dedupeByDate: Map<string, Set<string>>,
  date: string,
): Set<string> {
  const existing = dedupeByDate.get(date);
  if (existing) return existing;

  const dedupe = new Set<string>();
  dedupeByDate.set(date, dedupe);
  return dedupe;
}

function addEvent(
  eventsByDate: Map<string, OutboundEvent[]>,
  dedupeByDate: Map<string, Set<string>>,
  date: string,
  event: OutboundEvent,
): void {
  if (!event?.id || !event?.url) return;

  const events = getOrCreateEvents(eventsByDate, date);
  const dedupe = getOrCreateDedupe(dedupeByDate, date);
  const key = eventKey(event);
  if (dedupe.has(key)) return;

  dedupe.add(key);
  events.push({
    ...event,
    id: String(event.id),
    url: String(event.url),
    ts: eventTimestamp(event, date),
  });
}

async function rebuildSummary(): Promise<OutboundSummary> {
  const now = new Date();
  const cutoffDate = windowStartDate(SUMMARY_WINDOW_DAYS);

  const allKeys = await listR2Keys("outbound/events/");

  const dailyKeys: Array<{ key: string; date: string }> = [];
  const individualKeys: Array<{ key: string; date: string }> = [];

  for (const key of allKeys) {
    const dailyMatch = key.match(DAILY_RE);
    if (dailyMatch && dailyMatch[1] >= cutoffDate) {
      dailyKeys.push({ key, date: dailyMatch[1] });
      continue;
    }

    const eventMatch = key.match(EVENT_RE);
    if (eventMatch && eventMatch[1] >= cutoffDate) {
      individualKeys.push({ key, date: eventMatch[1] });
    }
  }

  const eventsByDate = new Map<string, OutboundEvent[]>();
  const dedupeByDate = new Map<string, Set<string>>();

  const dailyResults = await readBatch<OutboundEvent[]>(
    dailyKeys.map((daily) => daily.key),
  );
  for (let i = 0; i < dailyKeys.length; i++) {
    const { date } = dailyKeys[i];
    for (const event of dailyResults[i] ?? []) {
      addEvent(eventsByDate, dedupeByDate, date, event);
    }
  }

  const keysToDelete: string[] = [];

  if (individualKeys.length > 0) {
    const groupedByDate = new Map<string, string[]>();
    for (const { key, date } of individualKeys) {
      const keys = groupedByDate.get(date);
      if (keys) {
        keys.push(key);
      } else {
        groupedByDate.set(date, [key]);
      }
    }

    const individualResults = await readBatch<OutboundEvent>(
      individualKeys.map((event) => event.key),
    );

    for (let i = 0; i < individualKeys.length; i++) {
      const { key, date } = individualKeys[i];
      const event = individualResults[i];
      if (!event) continue;
      addEvent(eventsByDate, dedupeByDate, date, event);
      keysToDelete.push(key);
    }

    for (const date of groupedByDate.keys()) {
      await writeR2JSON(
        `outbound/events/${date}.json`,
        eventsByDate.get(date) ?? [],
      );
    }

    deleteR2Keys(keysToDelete).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[nav/summary] cleanup error:", message);
    });

    console.log(
      `[nav/summary] consolidated ${keysToDelete.length} events into ${groupedByDate.size} daily files`,
    );
  }

  const thresholds = {
    oneDay: windowStartDate(1),
    sevenDays: windowStartDate(7),
    thirtyDays: windowStartDate(30),
  };

  const items: Record<string, OutboundItemSummary> = {};
  const sellers: Record<string, OutboundAggregateSummary> = {};
  const categories: Record<string, OutboundAggregateSummary> = {};
  const markets: Record<string, OutboundAggregateSummary> = {};
  const dailyCounts: Record<string, number> = {};
  const recent: OutboundEvent[] = [];

  for (const [date, events] of eventsByDate) {
    dailyCounts[date] = (dailyCounts[date] ?? 0) + events.length;

    for (const event of events) {
      const timestamp = eventTimestamp(event, date);
      const eventIso = new Date(timestamp).toISOString();

      if (!items[event.id]) {
        items[event.id] = {
          ...createAggregate(),
          lastClick: eventIso,
          sn: event.sn,
          c: event.c,
          url: event.url,
          mkt: event.mkt,
          n: event.n,
        };
      }
      const item = items[event.id];
      bumpAggregate(item, date, thresholds);
      if (eventIso > item.lastClick) item.lastClick = eventIso;
      if (event.sn) item.sn = event.sn;
      if (event.c) item.c = event.c;
      if (event.url) item.url = event.url;
      if (event.mkt) item.mkt = event.mkt;
      if (event.n) item.n = event.n;

      if (event.sid) {
        if (!sellers[event.sid]) sellers[event.sid] = createAggregate();
        bumpAggregate(sellers[event.sid], date, thresholds);
      }

      if (event.c) {
        if (!categories[event.c]) categories[event.c] = createAggregate();
        bumpAggregate(categories[event.c], date, thresholds);
      }

      if (event.mkt) {
        if (!markets[event.mkt]) markets[event.mkt] = createAggregate();
        bumpAggregate(markets[event.mkt], date, thresholds);
      }

      recent.push({ ...event, ts: timestamp });
    }
  }

  const daily: Array<{ date: string; count: number }> = [];
  for (let i = SUMMARY_WINDOW_DAYS - 1; i >= 0; i--) {
    const date = fmtDate(daysAgo(i));
    daily.push({ date, count: dailyCounts[date] ?? 0 });
  }

  return {
    builtAt: now.toISOString(),
    period: {
      from: cutoffDate,
      to: fmtDate(now),
    },
    items,
    sellers,
    categories,
    markets,
    daily,
    recent: recent
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, RECENT_LIMIT),
  };
}
