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
 * for scheduled refreshes, manual checks, and full rebuild recovery.
 *
 * Event flow:
 *   - Clicks write append-only pending files: outbound/pending/{YYYY-MM-DD}/{uid}.json
 *   - Refreshes read pending files only, merge them into outbound/events/{YYYY-MM-DD}.json
 *   - Refreshes roll outbound/summary.json forward from its internal day buckets
 *
 * Query params:
 *   ?refresh=1  bypass cache and drain pending files incrementally
 *   ?rebuild=1  force full rebuild from the 90-day daily archive
 */

interface DayCounts {
  [date: string]: number;
}

interface OutboundAggregateSummary {
  clicks1d: number;
  clicks7d: number;
  clicks30d: number;
  clicksAll: number;
  byDay?: DayCounts;
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
  version?: number;
  builtAt: string;
  period: { from: string; to: string };
  items: Record<string, OutboundItemSummary>;
  sellers: Record<string, OutboundAggregateSummary>;
  categories: Record<string, OutboundAggregateSummary>;
  markets: Record<string, OutboundAggregateSummary>;
  daily: Array<{ date: string; count: number }>;
  recent: OutboundEvent[];
  processedEvents?: Record<string, string[]>;
}

interface PendingEvent {
  key: string;
  date: string;
  event: OutboundEvent;
  eventKey: string;
}

interface SummaryBuildResult {
  summary: OutboundSummary;
  keysToDelete: string[];
  shouldWrite?: boolean;
}

const SUMMARY_VERSION = 2;
const SUMMARY_KEY = "outbound/summary.json";
const ONE_HOUR_MS = 60 * 60 * 1000;
const SUMMARY_WINDOW_DAYS = 90;
const RECENT_LIMIT = 100;

const ARCHIVE_PREFIX = "outbound/events/";
const PENDING_PREFIX = "outbound/pending/";

const DAILY_RE = /^outbound\/events\/(\d{4}-\d{2}-\d{2})\.json$/;
const LEGACY_EVENT_RE = /^outbound\/events\/(\d{4}-\d{2}-\d{2})\/.+\.json$/;
const PENDING_RE = /^outbound\/pending\/(\d{4}-\d{2}-\d{2})\/.+\.json$/;

export async function GET(request: Request) {
  await connection();

  try {
    const url = new URL(request.url);
    const forceRebuild = url.searchParams.get("rebuild") === "1";
    const forceRefresh =
      forceRebuild || url.searchParams.get("refresh") === "1";
    const existing = forceRebuild
      ? null
      : await readR2JSON<OutboundSummary>(SUMMARY_KEY);

    if (!forceRefresh && existing?.builtAt) {
      const age = Date.now() - new Date(existing.builtAt).getTime();
      if (age < ONE_HOUR_MS) {
        return NextResponse.json(existing, {
          headers: { "Cache-Control": "public, max-age=300" },
        });
      }
    }

    const result =
      !forceRebuild && isIncrementalSummary(existing)
        ? await refreshSummary(existing)
        : await rebuildSummary();

    if (result.shouldWrite !== false) {
      await writeR2JSON(SUMMARY_KEY, result.summary);
    }
    await cleanupKeys(result.keysToDelete);

    return NextResponse.json(result.summary, {
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

function isIncrementalSummary(
  summary: OutboundSummary | null,
): summary is OutboundSummary {
  return Boolean(
    summary &&
      summary.version === SUMMARY_VERSION &&
      summary.processedEvents &&
      typeof summary.processedEvents === "object",
  );
}

function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number, from = new Date()): Date {
  const date = new Date(from);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function windowStartDate(days: number, from = new Date()): string {
  return fmtDate(daysAgo(days - 1, from));
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

async function cleanupKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  try {
    await deleteR2Keys(Array.from(new Set(keys)));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[nav/summary] cleanup error:", message);
  }
}

function createAggregate(): OutboundAggregateSummary {
  return {
    clicks1d: 0,
    clicks7d: 0,
    clicks30d: 0,
    clicksAll: 0,
    byDay: {},
  };
}

function eventTimestamp(event: OutboundEvent, date: string): number {
  const timestamp = Number(event.ts);
  if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  return Date.parse(`${date}T00:00:00.000Z`);
}

function normalizeEvent(
  event: OutboundEvent | null | undefined,
  date: string,
): OutboundEvent | null {
  if (!event?.id || !event?.url) return null;

  return {
    id: String(event.id),
    url: String(event.url),
    n: event.n || undefined,
    sid: event.sid ? String(event.sid) : undefined,
    sn: event.sn || undefined,
    c: event.c || undefined,
    mkt: event.mkt || "GB",
    ts: eventTimestamp(event, date),
  };
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
  event: OutboundEvent | null | undefined,
): void {
  const normalized = normalizeEvent(event, date);
  if (!normalized) return;

  const dedupe = getOrCreateDedupe(dedupeByDate, date);
  const key = eventKey(normalized);
  if (dedupe.has(key)) return;

  dedupe.add(key);
  getOrCreateEvents(eventsByDate, date).push(normalized);
}

function cloneDayCounts(
  counts: DayCounts | undefined,
  cutoffDate: string,
): DayCounts {
  const next: DayCounts = {};
  for (const [date, count] of Object.entries(counts ?? {})) {
    if (date < cutoffDate || !Number.isFinite(count) || count <= 0) continue;
    next[date] = count;
  }
  return next;
}

function cloneAggregate(
  aggregate: OutboundAggregateSummary | undefined,
  cutoffDate: string,
): OutboundAggregateSummary {
  return {
    clicks1d: 0,
    clicks7d: 0,
    clicks30d: 0,
    clicksAll: 0,
    byDay: cloneDayCounts(aggregate?.byDay, cutoffDate),
  };
}

function cloneProcessedEvents(
  processedEvents: Record<string, string[]> | undefined,
  cutoffDate: string,
): Map<string, Set<string>> {
  const processed = new Map<string, Set<string>>();

  for (const [date, keys] of Object.entries(processedEvents ?? {})) {
    if (date < cutoffDate || !Array.isArray(keys)) continue;
    processed.set(date, new Set(keys.map(String)));
  }

  return processed;
}

function processedEventsToObject(
  processedEvents: Map<string, Set<string>>,
  cutoffDate: string,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};

  for (const [date, keys] of processedEvents) {
    if (date < cutoffDate || keys.size === 0) continue;
    next[date] = Array.from(keys);
  }

  return next;
}

function getOrCreateProcessed(
  processedEvents: Map<string, Set<string>>,
  date: string,
): Set<string> {
  const existing = processedEvents.get(date);
  if (existing) return existing;

  const keys = new Set<string>();
  processedEvents.set(date, keys);
  return keys;
}

function incrementAggregateDay(
  aggregate: OutboundAggregateSummary,
  date: string,
): void {
  aggregate.byDay ??= {};
  aggregate.byDay[date] = (aggregate.byDay[date] ?? 0) + 1;
}

function recalculateAggregate(
  aggregate: OutboundAggregateSummary,
  thresholds: { oneDay: string; sevenDays: string; thirtyDays: string },
  cutoffDate: string,
): void {
  const byDay = aggregate.byDay ?? {};
  let clicksAll = 0;
  let clicks30d = 0;
  let clicks7d = 0;
  let clicks1d = 0;

  for (const [date, count] of Object.entries(byDay)) {
    if (date < cutoffDate || !Number.isFinite(count) || count <= 0) {
      delete byDay[date];
      continue;
    }

    clicksAll += count;
    if (date >= thresholds.thirtyDays) clicks30d += count;
    if (date >= thresholds.sevenDays) clicks7d += count;
    if (date >= thresholds.oneDay) clicks1d += count;
  }

  aggregate.clicksAll = clicksAll;
  aggregate.clicks30d = clicks30d;
  aggregate.clicks7d = clicks7d;
  aggregate.clicks1d = clicks1d;
  aggregate.byDay = byDay;
}

function finalizeAggregateMap<T extends OutboundAggregateSummary>(
  aggregates: Record<string, T>,
  thresholds: { oneDay: string; sevenDays: string; thirtyDays: string },
  cutoffDate: string,
): void {
  for (const [key, aggregate] of Object.entries(aggregates)) {
    recalculateAggregate(aggregate, thresholds, cutoffDate);
    if (aggregate.clicksAll <= 0) delete aggregates[key];
  }
}

function createBaseSummary(
  base: OutboundSummary | null,
  now: Date,
  cutoffDate: string,
): OutboundSummary {
  const summary: OutboundSummary = {
    version: SUMMARY_VERSION,
    builtAt: now.toISOString(),
    period: {
      from: cutoffDate,
      to: fmtDate(now),
    },
    items: {},
    sellers: {},
    categories: {},
    markets: {},
    daily: [],
    recent: [],
    processedEvents: {},
  };

  for (const [id, item] of Object.entries(base?.items ?? {})) {
    summary.items[id] = {
      ...cloneAggregate(item, cutoffDate),
      lastClick: item.lastClick,
      sn: item.sn,
      c: item.c,
      url: item.url,
      mkt: item.mkt,
      n: item.n,
    };
  }

  for (const [id, aggregate] of Object.entries(base?.sellers ?? {})) {
    summary.sellers[id] = cloneAggregate(aggregate, cutoffDate);
  }

  for (const [category, aggregate] of Object.entries(base?.categories ?? {})) {
    summary.categories[category] = cloneAggregate(aggregate, cutoffDate);
  }

  for (const [market, aggregate] of Object.entries(base?.markets ?? {})) {
    summary.markets[market] = cloneAggregate(aggregate, cutoffDate);
  }

  return summary;
}

function buildDailyCounts(
  base: OutboundSummary | null,
  cutoffDate: string,
): Map<string, number> {
  const dailyCounts = new Map<string, number>();

  for (const day of base?.daily ?? []) {
    if (
      day.date < cutoffDate ||
      !Number.isFinite(day.count) ||
      day.count <= 0
    ) {
      continue;
    }
    dailyCounts.set(day.date, day.count);
  }

  return dailyCounts;
}

function recentEventsByKey(
  base: OutboundSummary | null,
  cutoffDate: string,
): Map<string, OutboundEvent> {
  const recent = new Map<string, OutboundEvent>();

  for (const event of base?.recent ?? []) {
    const timestamp = Number(event.ts);
    if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
    const date = fmtDate(new Date(timestamp));
    if (date < cutoffDate) continue;

    const normalized = normalizeEvent(event, date);
    if (normalized) recent.set(eventKey(normalized), normalized);
  }

  return recent;
}

function buildDailyTrend(
  dailyCounts: Map<string, number>,
  now: Date,
): Array<{ date: string; count: number }> {
  const daily: Array<{ date: string; count: number }> = [];

  for (let i = SUMMARY_WINDOW_DAYS - 1; i >= 0; i--) {
    const date = fmtDate(daysAgo(i, now));
    daily.push({ date, count: dailyCounts.get(date) ?? 0 });
  }

  return daily;
}

function applyEventsToSummary(
  base: OutboundSummary | null,
  eventsByDate: Map<string, OutboundEvent[]>,
  processedEvents: Record<string, string[]>,
  now: Date,
): OutboundSummary {
  const cutoffDate = windowStartDate(SUMMARY_WINDOW_DAYS, now);
  const thresholds = {
    oneDay: windowStartDate(1, now),
    sevenDays: windowStartDate(7, now),
    thirtyDays: windowStartDate(30, now),
  };

  const summary = createBaseSummary(base, now, cutoffDate);
  const dailyCounts = buildDailyCounts(base, cutoffDate);
  const recent = recentEventsByKey(base, cutoffDate);

  for (const [date, events] of eventsByDate) {
    for (const event of events) {
      const normalized = normalizeEvent(event, date);
      if (!normalized) continue;

      const timestamp = eventTimestamp(normalized, date);
      const eventIso = new Date(timestamp).toISOString();
      dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);

      if (!summary.items[normalized.id]) {
        summary.items[normalized.id] = {
          ...createAggregate(),
          lastClick: eventIso,
          sn: normalized.sn,
          c: normalized.c,
          url: normalized.url,
          mkt: normalized.mkt,
          n: normalized.n,
        };
      }

      const item = summary.items[normalized.id];
      incrementAggregateDay(item, date);
      if (eventIso > item.lastClick) item.lastClick = eventIso;
      if (normalized.sn) item.sn = normalized.sn;
      if (normalized.c) item.c = normalized.c;
      if (normalized.url) item.url = normalized.url;
      if (normalized.mkt) item.mkt = normalized.mkt;
      if (normalized.n) item.n = normalized.n;

      if (normalized.sid) {
        summary.sellers[normalized.sid] ??= createAggregate();
        incrementAggregateDay(summary.sellers[normalized.sid], date);
      }

      if (normalized.c) {
        summary.categories[normalized.c] ??= createAggregate();
        incrementAggregateDay(summary.categories[normalized.c], date);
      }

      if (normalized.mkt) {
        summary.markets[normalized.mkt] ??= createAggregate();
        incrementAggregateDay(summary.markets[normalized.mkt], date);
      }

      recent.set(eventKey(normalized), normalized);
    }
  }

  finalizeAggregateMap(summary.items, thresholds, cutoffDate);
  finalizeAggregateMap(summary.sellers, thresholds, cutoffDate);
  finalizeAggregateMap(summary.categories, thresholds, cutoffDate);
  finalizeAggregateMap(summary.markets, thresholds, cutoffDate);

  summary.daily = buildDailyTrend(dailyCounts, now);
  summary.recent = Array.from(recent.values())
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    .slice(0, RECENT_LIMIT);
  summary.processedEvents = processedEvents;

  return summary;
}

async function readPendingEvents(
  keys: Array<{ key: string; date: string }>,
): Promise<PendingEvent[]> {
  const results = await readBatch<OutboundEvent>(
    keys.map((entry) => entry.key),
  );
  const events: PendingEvent[] = [];

  for (let i = 0; i < keys.length; i++) {
    const { key, date } = keys[i];
    const event = normalizeEvent(results[i], date);
    if (!event) continue;
    events.push({ key, date, event, eventKey: eventKey(event) });
  }

  return events;
}

async function mergePendingIntoArchives(
  pendingEvents: PendingEvent[],
): Promise<Map<string, OutboundEvent[]>> {
  const archivedEventsByDate = new Map<string, OutboundEvent[]>();
  const groupedByDate = new Map<string, PendingEvent[]>();

  for (const pendingEvent of pendingEvents) {
    const events = groupedByDate.get(pendingEvent.date);
    if (events) {
      events.push(pendingEvent);
    } else {
      groupedByDate.set(pendingEvent.date, [pendingEvent]);
    }
  }

  for (const [date, events] of groupedByDate) {
    const archiveKey = `${ARCHIVE_PREFIX}${date}.json`;
    const archived = await readR2JSON<OutboundEvent[]>(archiveKey);
    const archivedEvents: OutboundEvent[] = [];
    const archiveDedupe = new Set<string>();
    let archiveChanged = false;

    for (const event of Array.isArray(archived) ? archived : []) {
      const normalized = normalizeEvent(event, date);
      if (!normalized) continue;
      const key = eventKey(normalized);
      if (archiveDedupe.has(key)) continue;
      archiveDedupe.add(key);
      archivedEvents.push(normalized);
    }

    for (const event of events) {
      if (archiveDedupe.has(event.eventKey)) continue;
      archiveDedupe.add(event.eventKey);
      archivedEvents.push(event.event);
      archiveChanged = true;
    }

    if (archiveChanged) {
      await writeR2JSON(archiveKey, archivedEvents);
    }

    archivedEventsByDate.set(date, archivedEvents);
  }

  return archivedEventsByDate;
}

async function refreshSummary(
  existing: OutboundSummary,
): Promise<SummaryBuildResult> {
  const now = new Date();
  const cutoffDate = windowStartDate(SUMMARY_WINDOW_DAYS, now);
  const pendingKeys = await listR2Keys(PENDING_PREFIX);
  const keysToDelete: string[] = [];
  const pendingRefs: Array<{ key: string; date: string }> = [];

  for (const key of pendingKeys) {
    const match = key.match(PENDING_RE);
    if (!match) continue;

    if (match[1] < cutoffDate) {
      keysToDelete.push(key);
    } else {
      pendingRefs.push({ key, date: match[1] });
    }
  }

  const pendingEvents = await readPendingEvents(pendingRefs);
  keysToDelete.push(...pendingRefs.map((entry) => entry.key));
  const windowNeedsRefresh = existing.period?.to !== fmtDate(now);

  const processedMap = cloneProcessedEvents(
    existing.processedEvents,
    cutoffDate,
  );
  const unprocessedEvents: PendingEvent[] = [];

  for (const event of pendingEvents) {
    const processed = getOrCreateProcessed(processedMap, event.date);
    if (processed.has(event.eventKey)) continue;
    processed.add(event.eventKey);
    unprocessedEvents.push(event);
  }

  const archivedEventsByDate = await mergePendingIntoArchives(pendingEvents);
  const newEventsByDate = new Map<string, OutboundEvent[]>();

  for (const event of unprocessedEvents) {
    const events = getOrCreateEvents(newEventsByDate, event.date);
    events.push(event.event);
  }

  if (unprocessedEvents.length === 0 && !windowNeedsRefresh) {
    console.log(
      `[nav/summary] refresh noop pending=${pendingEvents.length} archiveDays=${archivedEventsByDate.size}`,
    );
    return { summary: existing, keysToDelete, shouldWrite: false };
  }

  const summary = applyEventsToSummary(
    existing,
    newEventsByDate,
    processedEventsToObject(processedMap, cutoffDate),
    now,
  );

  console.log(
    `[nav/summary] refreshed pending=${pendingEvents.length} new=${unprocessedEvents.length} archiveDays=${archivedEventsByDate.size}`,
  );

  return { summary, keysToDelete };
}

async function rebuildSummary(): Promise<SummaryBuildResult> {
  const now = new Date();
  const cutoffDate = windowStartDate(SUMMARY_WINDOW_DAYS, now);
  const [archiveKeys, pendingKeys] = await Promise.all([
    listR2Keys(ARCHIVE_PREFIX),
    listR2Keys(PENDING_PREFIX),
  ]);

  const dailyKeys: Array<{ key: string; date: string }> = [];
  const individualKeys: Array<{ key: string; date: string }> = [];
  const keysToDelete: string[] = [];

  for (const key of archiveKeys) {
    const dailyMatch = key.match(DAILY_RE);
    if (dailyMatch) {
      if (dailyMatch[1] >= cutoffDate) {
        dailyKeys.push({ key, date: dailyMatch[1] });
      }
      continue;
    }

    const eventMatch = key.match(LEGACY_EVENT_RE);
    if (!eventMatch) continue;

    if (eventMatch[1] >= cutoffDate) {
      individualKeys.push({ key, date: eventMatch[1] });
    } else {
      keysToDelete.push(key);
    }
  }

  for (const key of pendingKeys) {
    const pendingMatch = key.match(PENDING_RE);
    if (!pendingMatch) continue;

    if (pendingMatch[1] >= cutoffDate) {
      individualKeys.push({ key, date: pendingMatch[1] });
    } else {
      keysToDelete.push(key);
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

  const individualResults = await readBatch<OutboundEvent>(
    individualKeys.map((event) => event.key),
  );
  const archiveDates = new Set<string>();

  for (let i = 0; i < individualKeys.length; i++) {
    const { key, date } = individualKeys[i];
    addEvent(eventsByDate, dedupeByDate, date, individualResults[i]);
    archiveDates.add(date);
    keysToDelete.push(key);
  }

  for (const date of archiveDates) {
    await writeR2JSON(
      `${ARCHIVE_PREFIX}${date}.json`,
      eventsByDate.get(date) ?? [],
    );
  }

  const processedMap = new Map<string, Set<string>>();
  for (const [date, events] of eventsByDate) {
    const processed = getOrCreateProcessed(processedMap, date);
    for (const event of events) {
      processed.add(eventKey(event));
    }
  }

  const summary = applyEventsToSummary(
    null,
    eventsByDate,
    processedEventsToObject(processedMap, cutoffDate),
    now,
  );

  console.log(
    `[nav/summary] rebuilt daily=${dailyKeys.length} individual=${individualKeys.length} archiveDays=${archiveDates.size}`,
  );

  return { summary, keysToDelete };
}
