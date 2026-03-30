import type { IndexResult } from "../../shared/types";
import type { MarketCode } from "../../shared/env/loadEnv";
import { createLogger } from "../../shared/logging/logger";
import { loadEnv } from "../../shared/env/loadEnv";
import { ACCEPT_LANGUAGE, marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { appendRunMeta } from "../../shared/persistence/runMeta";
import { mergeIndexMetaEntry, type IndexMetaEntry } from "../../shared/logic/indexMetaStore";
import axios from "axios";
import { buildMarketSellers } from "./buildSellers";
import { MARKET_TO_FULL_LOCALE } from '../../shared/locale-map';
import { createCookieHttp, warmCookieJar } from "../../shared/http/client";
import { seedLocationFilterCookie } from "../../shared/http/lfCookie";
import { saveCookieJar } from "../../shared/http/cookies";

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
  const primaryUrl = `${hostOverride || "https://littlebiggy.org"}/core/api/items-wall/?shipsTo=${code}`;
  const fallbackUrl = hostOverride ? null : `https://www.littlebiggy.org/core/api/items-wall/?shipsTo=${code}`;

  let itemsCount = 0;
  let rawItems: any[] = [];
  let sellerReviewSummaries: Record<string, any> = {};
  let itemReviewSummaries: Record<string, any> = {};
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
        Referer: "https://littlebiggy.org/",
        Origin: "https://littlebiggy.org",
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
    try { await warmCookieJar(client, primaryUrl); } catch { }
    // Seed location filter cookie to match the target market to avoid extra LF POSTs
    try { await seedLocationFilterCookie(client, code); } catch { }
  }

  const tryFetch = async (url: string) => {
    logger.info(`[index:${code}] GET ${url}`);
    const res = await client.get(url, { responseType: "json" });
    logger.info(`[index:${code}] ← ${res.status} ${url}`);
    const data = res.data;
    const message = data?.data?.message || data?.message || data;
    const items = message?.items || [];
    // Extract review summaries when present
    try {
      const srs = (message as any)?.sellerReviewSummaries || (message as any)?.seller_review_summaries || (message as any)?.sellerReviews || null;
      if (srs && typeof srs === 'object') sellerReviewSummaries = srs as Record<string, any>;
    } catch { }
    try {
      const irs = (message as any)?.itemReviewSummaries || (message as any)?.item_review_summaries || null;
      if (irs && typeof irs === 'object') itemReviewSummaries = irs as Record<string, any>;
    } catch { }
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
      try { await warmCookieJar(client, fallbackUrl); } catch { }
      await tryFetch(fallbackUrl);
    }
  } catch (e: any) {
    logger.warn(`[index:${code}] fetch failed: ${e?.message || e}`);
  }

  // ── Upstream health gate ──
  // Guard 1: If we fetched 0 items but the previous snapshot had items, upstream
  // is likely down. Abort early to prevent data corruption.
  // Guard 2: If item count dropped by >50%, that's a strong signal the upstream
  // is degraded. Abort to prevent mass false-positive change detection.
  {
    const priorMeta = await blob.getJSON<any>(Keys.market.snapshotMeta()).catch(() => null);
    const priorCount = Number(priorMeta?.itemsCount) || 0;

    if (itemsCount === 0 && priorCount > 0) {
      logger.error(`[index:${code}] ⛔ UPSTREAM DOWN: fetched 0 items but prior snapshot had ${priorCount}. Aborting index run to prevent data corruption.`);
      try {
        await appendRunMeta(storeName, Keys.runMeta.market(code), {
          scope: String(code),
          counts: { items: 0 },
          error: { message: `Upstream returned 0 items (prior: ${priorCount}). Aborted to prevent lua corruption.` },
        });
      } catch { }
      return { ok: false, market: code, counts: { items: 0, sellers: 0 }, artifacts: [] };
    }

    if (priorCount > 50 && itemsCount > 0 && itemsCount < priorCount * 0.5) {
      logger.error(`[index:${code}] ⛔ UPSTREAM DEGRADED: fetched ${itemsCount} items but prior snapshot had ${priorCount} (${((itemsCount / priorCount) * 100).toFixed(0)}%). Aborting to prevent mass false-positive changes.`);
      try {
        await appendRunMeta(storeName, Keys.runMeta.market(code), {
          scope: String(code),
          counts: { items: itemsCount },
          error: { message: `Upstream returned ${itemsCount} items but prior had ${priorCount} (>50% drop). Aborted.` },
        });
      } catch { }
      return { ok: false, market: code, counts: { items: 0, sellers: 0 }, artifacts: [] };
    }
  }

  // Build snapshot meta but do not overwrite previous non-empty meta if this run produced zero items (resilience on upstream outage)
  const snapshotMetaKey = Keys.market.snapshotMeta();
  let priorSnapshotMeta: any = null;
  try { priorSnapshotMeta = await blob.getJSON<any>(snapshotMetaKey); } catch { }
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


  // Kick off aggregate loads in parallel: shares, indexMeta, shipSummary, category overrides, translations, and previous index
  const sharedBlob = getBlobClient(env.stores.shared);
  const sharesP = sharedBlob.getJSON<any>(Keys.shared.aggregates.shares()).catch(() => null);
  const indexMetaP = sharedBlob.getJSON<any>(Keys.shared.aggregates.indexMeta()).catch(() => null);
  const shipAggP = blob.getJSON<any>(Keys.market.aggregates.shipSummary()).catch(() => null);

  // Category overrides: Map<itemId, { primary, subcategories }>
  // Can be disabled via DISABLE_CATEGORY_OVERRIDES=1 env var
  const overridesEnabled = process.env.DISABLE_CATEGORY_OVERRIDES !== '1' && process.env.DISABLE_CATEGORY_OVERRIDES !== 'true';
  const overridesP = overridesEnabled ? sharedBlob.getJSON<any>('category-overrides.json').catch(() => null) : Promise.resolve(null);

  // Translations: only load for non-GB markets
  // Format: { [refNum]: { sourceHash, locales: { de-DE: { n, d, v? }, fr-FR: { n, d, v? }, ... } } }
  // v = variant translations: [{ vid, d }]
  const needsTranslation = code !== 'GB';
  const translationsP = needsTranslation
    ? sharedBlob.getJSON<Record<string, { sourceHash: string; locales: Record<string, { n: string; d: string; v?: { vid: string | number; d: string }[] }> }>>(Keys.shared.aggregates.translations()).catch(() => null)
    : Promise.resolve(null);

  // Img optimization: check aggregates/image-meta.json to flag items with optimized images
  const imageMetaP = sharedBlob.getJSON<any>(Keys.shared.aggregates.imageMeta()).catch(() => null);

  // Map market code to FULL locale code for translation lookup (aggregate uses de-DE, fr-FR, etc.)
  const targetLocale = MARKET_TO_FULL_LOCALE[code] || null;

  let sharesAgg: Record<string, string> = {};
  let shipAgg: Record<string, { min?: number; max?: number; free?: number | boolean }> = {};
  let indexMetaAgg: Record<string, IndexMetaEntry> = {};
  let imageMetaAgg: Record<string, { hashes: string[] }> = {};
  let translationsAgg: Record<string, { sourceHash: string; locales: Record<string, { n: string; d: string; v?: { vid: string | number; d: string }[] }> }> = {};
  const categoryOverrides = new Map<string, { primary: string; subcategories: string[] }>();

  // FNV-1a hash function — imported from shared module
  const { hashUrl } = await import('../../shared/hash');

  try {
    const [sRes, imRes, ssRes, oRes, tRes, previousIndex, imgRes] = await Promise.all([sharesP, indexMetaP, shipAggP, overridesP, translationsP, prevIndexP, imageMetaP]);
    if (sRes && typeof sRes === 'object') sharesAgg = sRes as any;
    if (imRes && typeof imRes === 'object') indexMetaAgg = imRes as any;
    if (imgRes && typeof imgRes === 'object') imageMetaAgg = imgRes as any;
    if (ssRes && typeof ssRes === 'object') shipAgg = ssRes as any;
    if (tRes && typeof tRes === 'object') translationsAgg = tRes as any;

    // Log translation aggregate load for non-GB markets
    if (needsTranslation) {
      const translationCount = Object.keys(translationsAgg).length;
      logger.info(`[index:${code}] Loaded ${translationCount} translations for locale '${targetLocale}'.`);
    }

    // Load category overrides (if enabled)
    if (overridesEnabled && oRes && typeof oRes === 'object' && Array.isArray(oRes.overrides)) {
      for (const override of oRes.overrides) {
        if (override.id && override.primary) {
          categoryOverrides.set(String(override.id), {
            primary: override.primary,
            subcategories: Array.isArray(override.subcategories) ? override.subcategories : [],
          });
        }
      }
      logger.info(`[index:${code}] Loaded ${categoryOverrides.size} category overrides.`);
    } else if (!overridesEnabled) {
      logger.info(`[index:${code}] Category overrides disabled via DISABLE_CATEGORY_OVERRIDES env var.`);
    }
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
  } catch { }
  const coldStart = prevByRef.size === 0 && prevByNum.size === 0;

  // ── Cold-start guard ──
  // If we couldn't load the previous index but index-meta shows we've seen
  // items before, something is wrong (R2 read failure, key mismatch, etc.).
  // On cold start, change detection finds no `prev` so it never fires, meaning
  // lua would silently fall back to index-meta only (or be lost entirely for
  // items without a meta entry). Log a prominent warning so it's visible.
  if (coldStart && Object.keys(indexMetaAgg).length > 50) {
    logger.error(`[index:${code}] ⚠️ COLD START with ${Object.keys(indexMetaAgg).length} entries in index-meta — previous index failed to load. lua will be sourced from index-meta only; items not in meta will lose their timestamps.`);
  }

  // Write a lightweight market index with minified fields and normalized variants (USD/BTC) and aggregate enrichments
  // Build maps to support joining endorsement counts by either numeric id or canonical id
  const byNumId = new Map<string, Record<string, any>>();
  const byCanonId = new Map<string, Record<string, any>>();

  let appliedMeta = 0;
  let appliedTranslations = 0;
  let appliedImageMeta = 0;
  const metaUpdates: Record<string, IndexMetaEntry> = {};

  // Import normalizeItem from extracted module
  const { normalizeItem } = await import('./normalizeItem');
  const normalizeCtx: import('./normalizeItem').NormalizeContext = {
    code,
    prevByRef,
    prevByNum,
    coldStart,
    hashUrl,
    sharesAgg,
    shipAgg,
    indexMetaAgg,
    imageMetaAgg,
    translationsAgg,
    categoryOverrides,
    itemReviewSummaries,
    needsTranslation,
    targetLocale,
  };

  // Track per-item change info for circuit breaker analysis
  interface ChangeTrack { entry: Record<string, any>; reasons: string[]; carriedLua?: string; carriedLur?: string | null; }
  const changedItems: ChangeTrack[] = [];

  const marketIndexItems = (Array.isArray(rawItems) ? rawItems : []).map((it: any) => {
    const result = normalizeItem(it, normalizeCtx);
    if (!result) return null;

    const { entry, canonicalKey, numKey, metaUpdate, changeReasons, carriedLua, carriedLur } = result;
    if (result.appliedMeta) appliedMeta++;
    if (result.appliedTranslation) appliedTranslations++;
    if (result.appliedImageMeta) appliedImageMeta++;

    // Track items flagged as changed for circuit breaker
    if (changeReasons.length > 0) {
      changedItems.push({ entry, reasons: changeReasons, carriedLua, carriedLur });
    }

    // Index into lookup maps for later endorsement join
    try {
      if (numKey) byNumId.set(numKey, entry);
      if (canonicalKey) byCanonId.set(canonicalKey, entry);
    } catch { }

    // Accumulate index-meta updates
    if (metaUpdate) {
      metaUpdates[metaUpdate.key] = metaUpdate.next;
      indexMetaAgg[metaUpdate.key] = metaUpdate.next;
    }

    return entry;
  }).filter(Boolean) as Array<Record<string, unknown>>;

  // ── Circuit breaker: detect mass false-positive changes ──
  // If a single change reason covers >50% of all items, it's almost certainly
  // a false positive (e.g., CDN URL change, upstream outage artefact).
  // Revert those items' lua to their carried (pre-change) values.
  const MASS_CHANGE_THRESHOLD = 0.5; // 50%
  if (marketIndexItems.length > 0 && changedItems.length > 0) {
    // Count occurrences of each individual change reason
    const reasonCounts = new Map<string, number>();
    for (const ci of changedItems) {
      for (const r of ci.reasons) {
        reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
      }
    }

    const totalItems = marketIndexItems.length;
    const trippedReasons: string[] = [];
    for (const [reason, count] of reasonCounts) {
      const ratio = count / totalItems;
      if (ratio > MASS_CHANGE_THRESHOLD) {
        trippedReasons.push(reason);
        logger.error(`[index:${code}] ⚠️ CIRCUIT BREAKER: "${reason}" affected ${count}/${totalItems} items (${(ratio * 100).toFixed(1)}%) — reverting lua for affected items`);
      }
    }

    if (trippedReasons.length > 0) {
      // Revert lua on items whose ONLY change reasons are all tripped
      let reverted = 0;
      for (const ci of changedItems) {
        const allTripped = ci.reasons.every(r => trippedReasons.includes(r));
        if (allTripped) {
          // Restore carried lua (the value before the false-positive change)
          if (ci.carriedLua) {
            ci.entry.lua = ci.carriedLua;
            ci.entry.lur = ci.carriedLur ?? undefined;
            if (!ci.entry.lur) delete ci.entry.lur;
          } else {
            delete ci.entry.lua;
            delete ci.entry.lur;
          }
          reverted++;
        }
        // Items with a MIX of tripped and non-tripped reasons keep their new lua
        // (they had a genuine change alongside the false positive)
      }

      // Revert metaUpdates whose lur is entirely composed of tripped reasons
      const trippedSet = new Set(trippedReasons);
      for (const [key, metaEntry] of Object.entries(metaUpdates)) {
        if (!metaEntry.lur) continue;
        // lur can be comma-joined: "Images changed, Price changed"
        const entryReasons = metaEntry.lur.split(', ').map(r => r.trim());
        const allTripped = entryReasons.every(r => trippedSet.has(r));
        if (allTripped) {
          delete metaUpdates[key];
          // Also undo the indexMetaAgg mutation from the map phase
          // by re-reading the original (the metaUpdate was merged into indexMetaAgg in the map)
          // Safe: next run will re-merge from the fresh R2 read anyway
        }
      }

      logger.warn(`[index:${code}] Circuit breaker reverted lua on ${reverted}/${changedItems.length} items (reasons: ${trippedReasons.join(', ')})`);
    }
  }

  // Note: Description is sourced directly from the public API payload only.

  // Embed global endorsement counts (snapshot) from Neon DB when available.
  // This ensures ec is global (same across markets) rather than per-market.
  try {
    if (process.env.NETLIFY_DATABASE_URL && marketIndexItems.length) {
      // Import lazily to avoid bundling when not configured
      const mod = await import('@netlify/neon');
      const sql = mod.neon();
      // Query using both numeric ids (preferred for counters) and canonical ids as fallback
      const canonIds = marketIndexItems.map((e: any) => (e.refNum ? String(e.refNum) : null)).filter(Boolean) as string[];
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
  const indexPackKey = Keys.market.indexPack(code);
  const writeTasks: Promise<any>[] = [];
  if (marketIndexItems.length > 0) {
    const metaNote = appliedMeta ? ` indexMetaHits=${appliedMeta}` : '';
    const transNote = appliedTranslations ? ` translations=${appliedTranslations}` : '';
    const imgNote = appliedImageMeta ? ` optimizedImages=${appliedImageMeta}` : '';
    writeTasks.push(
      blob.putJSON(indexKey, marketIndexItems)
        .then(() => logger.info(`[index:${code}] Wrote ${indexKey} (${marketIndexItems.length} items).${metaNote}${transNote}${imgNote}`))
        .catch((e: any) => logger.warn(`[index:${code}] Failed writing ${indexKey}: ${e?.message || e}`))
    );
    // Pre-build MessagePack binary alongside JSON — served directly by /api/items-pack
    // without on-the-fly encoding, saving CPU on every request
    writeTasks.push(
      (async () => {
        try {
          const { encode } = await import('@msgpack/msgpack');
          const packed = Buffer.from(encode(marketIndexItems));
          await blob.putRaw(indexPackKey, packed, 'application/msgpack');
          logger.info(`[index:${code}] Wrote ${indexPackKey} (${packed.length} bytes, ${marketIndexItems.length} items).`);
        } catch (e: any) {
          logger.warn(`[index:${code}] Failed writing ${indexPackKey}: ${e?.message || e}`);
        }
      })()
    );
  } else {
    logger.warn(`[index:${code}] No items to write for ${indexKey}; leaving previous data intact.`);
  }

  // Build per-market sellers.json via dedicated module (review stats + online flags)
  const sellersKey = `sellers.json`;
  let sellersList: Array<Record<string, any>> = [];
  if (marketIndexItems.length > 0) {
    sellersList = buildMarketSellers({ rawItems, marketIndexItems, sellerReviewSummaries });
    writeTasks.push(
      blob.putJSON(sellersKey, sellersList)
        .then(() => logger.info(`[index:${code}] Wrote ${sellersKey} (${sellersList.length}).`))
        .catch((e: any) => logger.warn(`[index:${code}] Failed writing ${sellersKey}: ${e?.message || e}`))
    );
  } else {
    logger.warn(`[index:${code}] Empty fetch; preserving previous ${sellersKey} if present.`);
    try { sellersList = (await blob.getJSON<any[]>(sellersKey)) || []; } catch { }
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
  try { priorManifest = await blob.getJSON<any>(manifestKey); } catch { }
  const sellerIds = new Set<string>();
  for (const e of marketIndexItems as Entry[]) {
    const sid = (e as any).sid;
    if (sid != null) sellerIds.add(String(sid));
  }
  const sellersCount = (Array.isArray(sellersList) && sellersList.length > 0) ? sellersList.length : sellerIds.size;
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
    try { await Promise.allSettled(writeTasks); } catch { }
  }

  const metaUpdateKeys = Object.keys(metaUpdates);
  if (metaUpdateKeys.length) {
    let latestMeta: Record<string, IndexMetaEntry> = {};
    try {
      const fresh = await sharedBlob.getJSON<any>(Keys.shared.aggregates.indexMeta());
      if (fresh && typeof fresh === 'object') latestMeta = fresh as Record<string, IndexMetaEntry>;

      // ── Daily rotating backup of index-meta ──
      // Keep one backup per calendar day (UTC), retain the latest 6.
      // Key format: aggregates/index-meta.backup.YYYY-MM-DD.json
      // This is the single most important aggregate — it holds fsa/lua/lur
      // for every item and is the source of truth the indexer relies on.
      try {
        const todayUTC = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const dailyBackupKey = `aggregates/index-meta.backup.${todayUTC}.json`;
        await sharedBlob.putJSON(dailyBackupKey, latestMeta);
        logger.info(`[index:${code}] Wrote daily index-meta backup: ${dailyBackupKey}`);

        // Trim old backups beyond the retention window (keep 6)
        const MAX_DAILY_BACKUPS = 6;
        try {
          const allKeys = await sharedBlob.list('aggregates/index-meta.backup.');
          // Filter to only dated backup keys (YYYY-MM-DD pattern)
          const dated = allKeys
            .filter(k => /^aggregates\/index-meta\.backup\.\d{4}-\d{2}-\d{2}\.json$/.test(k))
            .sort(); // lexicographic = chronological for ISO dates
          if (dated.length > MAX_DAILY_BACKUPS) {
            const toDelete = dated.slice(0, dated.length - MAX_DAILY_BACKUPS);
            for (const old of toDelete) {
              await sharedBlob.del(old);
              logger.info(`[index:${code}] Pruned old index-meta backup: ${old}`);
            }
          }
        } catch (trimErr: any) {
          logger.warn(`[index:${code}] index-meta backup trim failed (non-fatal): ${trimErr?.message || trimErr}`);
        }
      } catch (backupErr: any) {
        logger.warn(`[index:${code}] index-meta daily backup failed (non-fatal): ${backupErr?.message || backupErr}`);
      }
    } catch { }
    for (const key of metaUpdateKeys) {
      const { next } = mergeIndexMetaEntry(latestMeta[key], metaUpdates[key]);
      latestMeta[key] = next;
    }
    try {
      await sharedBlob.putJSON(Keys.shared.aggregates.indexMeta(), latestMeta);
    } catch (e: any) {
      logger.warn(`[index:${code}] failed to persist index-meta aggregate: ${e?.message || e}`);
    }
  }

  // Backfills no longer needed when aggregates are present

  // Persist cookies for reuse across stages/markets
  try { if (jar) await saveCookieJar(jar); } catch { }

  // Append per-market run-meta entry for observability
  try {
    const durMs = Date.now() - startedAt;
    const runMetaKey = Keys.runMeta.market(code);
    await appendRunMeta(storeName, runMetaKey, {
      scope: String(code),
      counts: { items: itemsCount },
      notes: { artifacts: ["snapshot_meta.json", "data/manifest.json", "indexed_items.json", "indexed_items.msgpack", "sellers.json"], durationMs: durMs, source: snapshotMeta.source, version: snapshotMeta.version },
    });
    logger.info(`[index:${code}] Appended run-meta (${durMs}ms) to ${runMetaKey}.`);
  } catch (e: any) {
    logger.warn(`[index:${code}] run-meta append failed: ${e?.message || e}`);
  }

  return {
    ok: true,
    market: code,
    counts: { items: itemsCount, sellers: sellersList.length || sellersCount },
    artifacts: [
      "snapshot_meta.json",
      "data/manifest.json",
      "indexed_items.json",
      "indexed_items.msgpack",
      "sellers.json",
    ],
    snapshotMeta,
  };
}
