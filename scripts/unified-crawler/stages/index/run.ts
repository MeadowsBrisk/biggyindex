import type { IndexResult } from "../../shared/types";
import type { MarketCode } from "../../shared/env/loadEnv";
import { createLogger } from "../../shared/logging/logger";
import { loadEnv } from "../../shared/env/loadEnv";
import { ACCEPT_LANGUAGE, marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { appendRunMeta } from "../../shared/persistence/runMeta";
import { diffMarketIndexEntries } from "../../shared/logic/changes";
import axios from "axios";
import { createCookieHttp, warmCookieJar } from "../../shared/http/client";
import { seedLocationFilterCookie } from "../../shared/http/lfCookie";
import { saveCookieJar } from "../../shared/http/cookies";
import { categorize } from "../../shared/categorization/index";
import { isTipListing, isCustomListing } from "../../shared/exclusions/listing";
// Aggregates approach: index consumes precomputed share links and shipping summaries
// Temporary: reuse legacy categorization pipeline until TS port lands
// Note: categorize() currently delegates to the legacy pipeline to preserve behavior.

/**
 * runIndexMarket — Unified TS indexer stage (Phase A skeleton)
 * Contract: return counts and known artifacts; do not change blob key schemas.
 * Future: implement full fetch → normalize → categorize → persist for market.
 */
export async function runIndexMarket(code: MarketCode): Promise<IndexResult> {
  const startedAt = Date.now();
  const env = loadEnv();
  const logger = createLogger();
  if (!env.markets.includes(code)) {
    logger.warn(`[index:${code}] Market not enabled in config; skipping.`);
    return { ok: true, market: code, counts: { items: 0, sellers: 0 }, artifacts: [] };
  }

  // Phase A1: minimal fetch + snapshot meta write (no schema changes yet)
  const storeName = marketStore(code, env.stores as any);
  const blob = getBlobClient(storeName);
  // Load previous index to preserve per-item fields like firstSeenAt, share, endorsementCount
  const prevIndexP = blob.getJSON<any[]>(Keys.market.index(code)).catch(() => []) as Promise<any[]>;
  const prevByRef = new Map<string, any>();
  const prevByNum = new Map<string, any>();

  // Legacy seed removed from hot path: use aggregates/index-meta.json instead (produced by one-time migrator)

  // Use a browser-like UA to avoid upstream filtering; keep our tag at the end for traceability
  const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 UnifiedCrawler/PhaseA`;
  const headers = {
    "Accept-Language": ACCEPT_LANGUAGE[code],
    "Accept": "application/json, text/plain, */*",
    "User-Agent": ua,
  } as Record<string, string>;

  const hostOverride = process.env.LB_ENDPOINT?.replace(/\/$/, "");
  // Prefer apex by default; only try www as a fallback when NOT overriding host.
  const primaryUrl = `${hostOverride || "https://littlebiggy.net"}/core/api/items-wall/?shipsTo=${code}`;
  const fallbackUrl = hostOverride ? null : `https://www.littlebiggy.net/core/api/items-wall/?shipsTo=${code}`;

  let itemsCount = 0;
  let rawItems: any[] = [];
  let chosen: string | null = null;
  logger.info(`[index:${code}] Starting fetch: primary=${primaryUrl}${fallbackUrl ? " " : ""}`);
  // Build an axios client with cookie jar via shared HTTP factory
  let client = axios as any;
  let jar: any | undefined;
  try {
    const { client: c, jar: j } = await createCookieHttp({
      headers: {
        "User-Agent": ua,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": ACCEPT_LANGUAGE[code],
        Referer: "https://littlebiggy.net/",
        Origin: "https://littlebiggy.net",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    client = c;
    jar = j;
  } catch {
    client = axios.create({ headers, timeout: 30000 });
  }

  // Optional fast mode: skip warm/seed to reduce round-trips
  const fastFetch = process.env.CRAWLER_FAST === '1' || process.env.CRAWLER_FAST === 'true';
  if (fastFetch) {
    logger.info(`[index:${code}] FAST mode enabled: skipping warm/seed.`);
  } else {
    // Warm once against the primary host (non-API) to establish baseline cookies
    try { await warmCookieJar(client, primaryUrl); } catch {}
    // Seed location filter cookie to match the target market to avoid extra LF POSTs
    try { await seedLocationFilterCookie(client, code); } catch {}
  }

  const tryFetch = async (url: string) => {
    logger.info(`[index:${code}] GET ${url}`);
    const res = await client.get(url, { responseType: "json" });
    logger.info(`[index:${code}] ← ${res.status} ${url}`);
    const data = res.data;
    const message = data?.data?.message || data?.message || data;
    const items = message?.items || [];
    if (Array.isArray(items)) {
      itemsCount = items.length;
      rawItems = items;
      chosen = url;
      logger.info(`[index:${code}] Selected source ${url} with ${itemsCount} items.`);
      return true;
    }
    return false;
  };

  try {
    const ok = await tryFetch(primaryUrl);
    if (!ok && fallbackUrl) {
      // Warm fallback host only if needed
      try { await warmCookieJar(client, fallbackUrl); } catch {}
      await tryFetch(fallbackUrl);
    }
  } catch (e: any) {
    logger.warn(`[index:${code}] fetch failed: ${e?.message || e}`);
  }

  // Build snapshot meta but do not overwrite previous non-empty meta if this run produced zero items (resilience on upstream outage)
  const snapshotMetaKey = Keys.market.snapshotMeta();
  let priorSnapshotMeta: any = null;
  try { priorSnapshotMeta = await blob.getJSON<any>(snapshotMetaKey); } catch {}
  const newSnapshotMeta = {
    updatedAt: new Date().toISOString(),
    itemsCount,
    source: chosen || null,
    version: Date.now().toString(36),
  };
  const shouldWriteSnapshot = itemsCount > 0 || !priorSnapshotMeta || typeof priorSnapshotMeta !== 'object' || !Number.isFinite(Number(priorSnapshotMeta.itemsCount)) || Number(priorSnapshotMeta.itemsCount) <= 0;
  const snapshotMeta = shouldWriteSnapshot ? newSnapshotMeta : priorSnapshotMeta;
  if (shouldWriteSnapshot) {
    await blob.putJSON(snapshotMetaKey, snapshotMeta);
    logger.info(`[index:${code}] Wrote ${snapshotMetaKey} (itemsCount=${itemsCount}) in store "${storeName}".`);
  } else {
    logger.warn(`[index:${code}] Upstream fetch empty; preserved previous snapshot_meta.json (itemsCount=${priorSnapshotMeta.itemsCount}).`);
  }

  
  // Kick off aggregate loads in parallel: shares, indexMeta, shipSummary, and previous index
  const sharedBlob = getBlobClient(env.stores.shared);
  const sharesP = sharedBlob.getJSON<any>(Keys.shared.aggregates.shares()).catch(() => null);
  const indexMetaP = sharedBlob.getJSON<any>(Keys.shared.aggregates.indexMeta()).catch(() => null);
  const shipAggP = blob.getJSON<any>(Keys.market.aggregates.shipSummary()).catch(() => null);
  let sharesAgg: Record<string, string> = {};
  let shipAgg: Record<string, { min?: number; max?: number; free?: number | boolean }> = {};
  let indexMetaAgg: Record<string, { fsa?: string; lua?: string; lur?: string }> = {};
  try {
    const [sRes, imRes, ssRes, previousIndex] = await Promise.all([sharesP, indexMetaP, shipAggP, prevIndexP]);
    if (sRes && typeof sRes === 'object') sharesAgg = sRes as any;
    if (imRes && typeof imRes === 'object') indexMetaAgg = imRes as any;
    if (ssRes && typeof ssRes === 'object') shipAgg = ssRes as any;
    // Build prev maps for change detection and carry-forward
    if (Array.isArray(previousIndex)) {
      for (const e of previousIndex) {
        if (!e) continue;
        const pidNum = (e.id != null) ? String(e.id).trim() : "";
        const pidRef = (e.refNum != null) ? String(e.refNum).trim() : (e.ref != null ? String(e.ref).trim() : "");
        if (pidRef) prevByRef.set(pidRef, e);
        if (pidNum) prevByNum.set(pidNum, e);
      }
    }
  } catch {}
  const coldStart = prevByRef.size === 0 && prevByNum.size === 0;

  // Write a lightweight market index with minified fields and normalized variants (USD/BTC) and aggregate enrichments
  // Build maps to support joining endorsement counts by either numeric id or canonical id
  const byNumId = new Map<string, Record<string, any>>();
  const byCanonId = new Map<string, Record<string, any>>();

  let appliedMeta = 0;
  const marketIndexItems = (Array.isArray(rawItems) ? rawItems : []).map((it: any) => {
  // Canonical ID: use refNum everywhere now
  const ref = it?.refNum ?? it?.refnum ?? it?.ref;
  const numId = it?.id; // kept for endorsements join only
  const id = ref ? String(ref) : (numId != null ? String(numId) : undefined);
    if (!id) return null;
    const name = it?.name;
    const description = it?.description || "";
    // Exclusions: tip jars, custom orders/listings (legacy-compatible heuristics)
    try {
      if (isTipListing(name, description) || isCustomListing(name, description)) {
        return null; // skip excluded listings
      }
    } catch {}
    const images: string[] = Array.isArray(it?.images) ? it.images : [];
    const primaryImg = images[0] || undefined;
    const imgSmall = images.length ? images.slice(0, 3) : undefined;

    // Normalize varieties into compact variant entries with USD/BTC
    const varieties: any[] = Array.isArray(it?.varieties) ? it.varieties : [];
    const v = varieties.map((vv: any) => {
      const usdStr = vv?.basePrice?.amount ?? vv?.basePrice?.value ?? undefined;
      const usd = typeof usdStr === "string" ? parseFloat(usdStr) : (typeof usdStr === "number" ? usdStr : undefined);
      const d = vv?.description;
      const vid = vv?.id;
      const out: Record<string, unknown> = {};
      if (vid != null) out.vid = vid;
      if (d) out.d = d;
      if (typeof usd === "number" && Number.isFinite(usd)) out.usd = usd;
      return out;
    }).filter((o: any) => Object.keys(o).length > 0);

    // Compute USD price bounds
    const usdVals = v.map((x: any) => x.usd).filter((n: any) => typeof n === "number" && Number.isFinite(n)) as number[];
    const uMin = usdVals.length ? Math.min(...usdVals) : undefined;
    const uMax = usdVals.length ? Math.max(...usdVals) : undefined;

    // Seller minimal info
    const sid = it?.seller?.id ?? it?.sellerId;
    const sn = it?.seller?.name;
    const h = it?.hotness;
  const sf = it?.shipsFrom ?? it?.ships_from;

  const entry: Record<string, any> = { id };
  if (ref) entry.refNum = String(ref);
  if (name) entry.n = name;
  if (description) entry.d = description;
    if (primaryImg) entry.i = primaryImg;
    if (imgSmall && imgSmall.length) entry.is = imgSmall;
    if (v.length) entry.v = v;
    if (uMin != null) entry.uMin = uMin;
    if (uMax != null) entry.uMax = uMax;
    if (sid != null) entry.sid = sid;
    if (sn) entry.sn = sn;
    if (h != null) entry.h = h;
  if (sf) entry.sf = sf;

    // Categorization (temporary via legacy pipeline through TS facade)
    try {
      if (name || description) {
        const cat = categorize(name || "", description || "");
        if (cat?.primary) entry.c = cat.primary;
        if (Array.isArray(cat?.subcategories) && cat.subcategories.length) entry.sc = cat.subcategories;
      }
    } catch {}

  // Change detection vs previous index to update lua/lur like legacy indexer (modified: strict semantics)
    let prev = prevByRef.get(String(ref || ''));
    if (!prev && numId != null) prev = prevByNum.get(String(numId));
    const nowIso = new Date().toISOString();
    // Timestamps (minified keys). Prefer previously written short keys; fallback to legacy long keys.
  const metaHit = indexMetaAgg[id];
    if (metaHit) appliedMeta++;
    const { changed, reasons: changeReasons } = diffMarketIndexEntries(prev, entry);
  // Timestamp policy (PARITY + REQUIREMENTS):
  //  firstSeenAt (fsa):
  //    - Carry prev/aggregate when present
  //    - If new item (no prev, no aggregate) and NOT cold start, stamp now
  //    - If cold start (baseline run), DO NOT synthesize fsa (leave undefined for existing legacy items)
  //  lastUpdatedAt (lua):
  //    - ONLY set when we detect a change (diff) THIS run
  //    - Otherwise carry forward existing lua (prev or aggregate) if it exists
  //    - Never derive lua from fsa; never default lua to now on baseline/cold start
  //  lastUpdateReason (lur):
  //    - Set when change detected
  //    - Carry forward existing lur if we carried an existing lua; else omit
  // This ensures initial baseline run does not incorrectly stamp lua for every item.
  const fsa = prev?.fsa || prev?.firstSeenAt || (metaHit?.fsa);
  if (fsa) entry.fsa = fsa;
  else if (!prev && !metaHit?.fsa && !coldStart) entry.fsa = nowIso;
  // Last updated + reason: if we detected a change this run, stamp now + reasons; otherwise carry forward
  let carriedLua: string | undefined = undefined;
  if (prev?.lua) carriedLua = prev.lua;
  else if (prev?.lastUpdatedAt) carriedLua = prev.lastUpdatedAt;
  else if (metaHit?.lua) carriedLua = metaHit.lua;
  const carriedLur = prev?.lur ?? prev?.lastUpdateReason ?? (metaHit?.lur ?? null);
  if (changed && changeReasons.length > 0) {
    // Real change detected: stamp lua + lur
    entry.lua = nowIso;
    entry.lur = changeReasons.join(', ');
  } else if (carriedLua) {
    // Only carry forward lua if it existed previously; do NOT synthesize
    entry.lua = carriedLua;
    if (carriedLur != null) entry.lur = carriedLur;
  }
    // Endorsements (minified key): preserve or default 0
    entry.ec = typeof prev?.ec === 'number'
      ? prev.ec
      : (typeof prev?.endorsementCount === 'number' ? prev.endorsementCount : 0);
  // Share link (compact): carry forward if previously embedded; else use aggregate if present
  if (prev?.sl) entry.sl = prev.sl;
  else if (id && sharesAgg[id]) entry.sl = sharesAgg[id];
    // Shipping summary (minified key): carry forward if present; else will attempt backfill below when available
    // Normalize older shapes: convert free:boolean -> 1/0 and drop cnt
    function normalizeSh(x: any) {
      if (!x || typeof x !== 'object') return undefined;
      const out: any = {};
      if (typeof x.min === 'number') out.min = x.min;
      if (typeof x.max === 'number') out.max = x.max;
      if (typeof x.free === 'number') out.free = x.free ? 1 : 0;
      else if (typeof x.free === 'boolean') out.free = x.free ? 1 : 0;
      return Object.keys(out).length ? out : undefined;
    }
    const sh1 = prev?.sh ? normalizeSh(prev.sh) : undefined;
    const sh2 = !sh1 && prev?.ship ? normalizeSh(prev.ship) : undefined;
    const sh3 = id && shipAgg[id] ? normalizeSh(shipAgg[id]) : undefined;
    if (sh1) entry.sh = sh1;
    else if (sh2) entry.sh = sh2;
    else if (sh3) entry.sh = sh3;
    // Index into lookup maps for later endorsement join
    try {
      if (numId != null) byNumId.set(String(numId), entry as Record<string, any>);
      if (id) byCanonId.set(String(id), entry as Record<string, any>);
    } catch {}
    return entry;
  }).filter(Boolean) as Array<Record<string, unknown>>;

  // Note: Description is sourced directly from the public API payload only.

  // Embed global endorsement counts (snapshot) from Neon DB when available.
  // This ensures ec is global (same across markets) rather than per-market.
  try {
    if (process.env.NETLIFY_DATABASE_URL && marketIndexItems.length) {
      // Import lazily to avoid bundling when not configured
      const mod = await import('@netlify/neon');
      const sql = mod.neon();
      // Query using both numeric ids (preferred for counters) and canonical ids as fallback
      const canonIds = marketIndexItems.map((e: any) => String(e.id)).filter(Boolean);
      const numIds = Array.from(byNumId.keys());
      const ids = Array.from(new Set([...numIds, ...canonIds]));
      if (ids.length) {
        const rows = await sql`SELECT item_id, count FROM votes_counters WHERE item_id = ANY(${ids})` as any[];
        const map = new Map<string, number>();
        for (const r of rows) map.set(String((r as any).item_id), Number((r as any).count) || 0);
        let applied = 0;
        // Apply counts by matching numeric id first, then canonical id
        for (const [k, v] of map.entries()) {
          const hit = byNumId.get(k) || byCanonId.get(k);
          if (hit) { (hit as any).ec = v; applied++; }
        }
        // Default missing ec to 0 where not set
        for (const e of marketIndexItems as Array<Record<string, any>>) {
          if (typeof (e as any).ec !== 'number') (e as any).ec = 0;
        }
        logger.info(`[index:${code}] Embedded global endorsement counts for ${applied}/${ids.length} items.`);
      }
    }
  } catch (err: any) {
    logger.warn(`[index:${code}] endorsements embed failed: ${err?.message || err}`);
  }

  const indexKey = Keys.market.index(code);
  const writeTasks: Promise<any>[] = [];
  if (marketIndexItems.length > 0) {
    const metaNote = appliedMeta ? ` indexMetaHits=${appliedMeta}` : '';
    writeTasks.push(
      blob.putJSON(indexKey, marketIndexItems)
        .then(() => logger.info(`[index:${code}] Wrote ${indexKey} (${marketIndexItems.length} items).${metaNote}`))
        .catch((e: any) => logger.warn(`[index:${code}] Failed writing ${indexKey}: ${e?.message || e}`))
    );
  } else {
    logger.warn(`[index:${code}] No items to write for ${indexKey}; leaving previous data intact.`);
  }

  // Derive categories and manifest from the finalized marketIndexItems
  type Entry = Record<string, any>;
  const byCat = new Map<string, Entry[]>();
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = 0;
  for (const e of marketIndexItems as Entry[]) {
    if (typeof e.uMin === 'number') minPrice = Math.min(minPrice, e.uMin);
    if (typeof e.uMax === 'number') maxPrice = Math.max(maxPrice, e.uMax);
    const cat = (e.c && String(e.c)) || null;
    if (!cat) continue;
    const arr = byCat.get(cat) || [];
    arr.push(e);
    byCat.set(cat, arr);
  }

  // Write per-category item lists under data/items-<category>.json
  const catObj: Record<string, any> = {};
  const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  for (const [cat, arr] of byCat) {
    const slug = slugify(cat);
    const ckey = `data/items-${slug}.json`;
    writeTasks.push(
      blob.putJSON(ckey, arr)
        .then(() => logger.info(`[index:${code}] Wrote ${ckey} (${arr.length}).`))
        .catch((e: any) => logger.warn(`[index:${code}] Failed writing ${ckey}: ${e?.message || e}`))
    );
    // Subcategory counts
    const subCounts: Record<string, number> = {};
    for (const it of arr) {
      const subs: string[] = Array.isArray(it.sc) ? it.sc : [];
      for (const s of subs) {
        const k = String(s);
        subCounts[k] = (subCounts[k] || 0) + 1;
      }
    }
    catObj[cat] = {
      count: arr.length,
      file: `/data/items-${slug}.json`,
      subcategories: subCounts,
    };
  }

  if (!Number.isFinite(minPrice)) minPrice = 0;
  if (!Number.isFinite(maxPrice)) maxPrice = 0;

  // Write manifest with totals and categories (+ lightweight sellersCount) unless empty fetch with prior manifest
  const manifestKey = Keys.market.manifest(code);
  let priorManifest: any = null;
  try { priorManifest = await blob.getJSON<any>(manifestKey); } catch {}
  const sellerIds = new Set<string>();
  for (const e of marketIndexItems as Entry[]) {
    const sid = (e as any).sid;
    if (sid != null) sellerIds.add(String(sid));
  }
  const sellersCount = sellerIds.size;
  const newManifest = {
    totalItems: (marketIndexItems as Entry[]).length,
    minPrice,
    maxPrice,
    sellersCount,
    categories: catObj,
  } as const;
  const shouldWriteManifest = (marketIndexItems.length > 0) || !priorManifest || typeof priorManifest !== 'object' || !Number.isFinite(Number(priorManifest.totalItems)) || Number(priorManifest.totalItems) <= 0;
  const manifest = shouldWriteManifest ? newManifest : priorManifest;
  if (shouldWriteManifest) {
    writeTasks.push(
      blob.putJSON(manifestKey, manifest)
        .then(() => logger.info(`[index:${code}] Wrote ${manifestKey} (cats=${Object.keys(catObj).length}, sellers=${sellersCount}).`))
        .catch((e: any) => logger.warn(`[index:${code}] Failed writing ${manifestKey}: ${e?.message || e}`))
    );
  } else {
    logger.warn(`[index:${code}] Empty fetch; preserved previous manifest (totalItems=${priorManifest.totalItems}, sellers=${priorManifest.sellersCount || 'n/a'}).`);
  }

  // Flush all writes concurrently
  if (writeTasks.length) {
    try { await Promise.allSettled(writeTasks); } catch {}
  }

  // Backfills no longer needed when aggregates are present

  // Persist cookies for reuse across stages/markets
  try { if (jar) await saveCookieJar(jar); } catch {}

  // Append per-market run-meta entry for observability
  try {
    const durMs = Date.now() - startedAt;
    const runMetaKey = Keys.runMeta.market(code);
    await appendRunMeta(storeName, runMetaKey, {
      scope: String(code),
      counts: { items: itemsCount },
      notes: { artifacts: ["snapshot_meta.json", "data/manifest.json", "indexed_items.json"], durationMs: durMs, source: snapshotMeta.source, version: snapshotMeta.version },
    });
    logger.info(`[index:${code}] Appended run-meta (${durMs}ms) to ${runMetaKey}.`);
  } catch (e: any) {
    logger.warn(`[index:${code}] run-meta append failed: ${e?.message || e}`);
  }

  return {
    ok: true,
    market: code,
    counts: { items: itemsCount, sellers: sellersCount },
    artifacts: [
      "snapshot_meta.json",
      "data/manifest.json",
      "indexed_items.json",
    ],
    snapshotMeta,
  };
}
