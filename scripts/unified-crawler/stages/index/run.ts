import type { IndexResult } from "../../shared/types";
import type { MarketCode } from "../../shared/env/loadEnv";
import { createLogger } from "../../shared/logging/logger";
import { loadEnv } from "../../shared/env/loadEnv";
import { ACCEPT_LANGUAGE, marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { appendRunMeta } from "../../shared/persistence/runMeta";
import { diffMarketIndexEntries } from "../../shared/logic/changes";
import { mergeIndexMetaEntry, type IndexMetaEntry } from "../../shared/logic/indexMetaStore";
import axios from "axios";
import { buildMarketSellers } from "./buildSellers";
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
  const MARKET_TO_LOCALE: Record<string, string> = { 'DE': 'de-DE', 'FR': 'fr-FR', 'PT': 'pt-PT', 'IT': 'it-IT' };
  const targetLocale = MARKET_TO_LOCALE[code] || null;

  let sharesAgg: Record<string, string> = {};
  let shipAgg: Record<string, { min?: number; max?: number; free?: number | boolean }> = {};
  let indexMetaAgg: Record<string, IndexMetaEntry> = {};
  let imageMetaAgg: Record<string, { hashes: string[] }> = {};
  let translationsAgg: Record<string, { sourceHash: string; locales: Record<string, { n: string; d: string; v?: { vid: string | number; d: string }[] }> }> = {};
  const categoryOverrides = new Map<string, { primary: string; subcategories: string[] }>();

  // FNV-1a hash function (must match image-optimizer.ts and frontend)
  function hashUrl(url: string): string {
    let hash = 2166136261;
    for (let i = 0; i < url.length; i++) {
      hash ^= url.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

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

  // Write a lightweight market index with minified fields and normalized variants (USD/BTC) and aggregate enrichments
  // Build maps to support joining endorsement counts by either numeric id or canonical id
  const byNumId = new Map<string, Record<string, any>>();
  const byCanonId = new Map<string, Record<string, any>>();

  let appliedMeta = 0;
  let appliedTranslations = 0;
  let appliedImageMeta = 0;
  const metaUpdates: Record<string, IndexMetaEntry> = {};

  const marketIndexItems = (Array.isArray(rawItems) ? rawItems : []).map((it: any) => {
    // Canonical ID: use refNum everywhere now
    const ref = it?.refNum ?? it?.refnum ?? it?.ref;
    const numId = it?.id;
    const refKey = ref != null ? String(ref) : null;
    const numKey = numId != null ? String(numId) : null;
    const canonicalKey = refKey ?? numKey;
    if (!canonicalKey) return null;
    const numericValue = typeof numId === 'number' ? numId : (numKey && /^\d+$/.test(numKey) ? Number(numKey) : null);
    const entryId = (numericValue != null ? numericValue : (numKey ?? canonicalKey));
    const name = it?.name;
    const description = it?.description || "";
    // Exclusions: tip jars, custom orders/listings (legacy-compatible heuristics)
    try {
      if (isTipListing(name, description) || isCustomListing(name, description)) {
        return null; // skip excluded listings
      }
    } catch { }
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

    const entry: Record<string, any> = { id: entryId };
    if (canonicalKey) entry.refNum = canonicalKey;

    // IMPORTANT: For change detection, we must use the ENGLISH name/description
    // Translation is applied AFTER change detection to avoid false "Description changed" triggers
    // Store English first, we'll apply translations after diffMarketIndexEntries
    if (name) entry.n = name;
    if (description) entry.d = description;

    if (primaryImg) {
      entry.i = primaryImg;
      // Check if image is optimized in R2 (has io flag)
      const hash = hashUrl(primaryImg);
      const meta = canonicalKey ? imageMetaAgg[canonicalKey] : undefined;
      // Also check by numeric ID in case meta is stored that way (less common now but possible)
      const metaNum = numKey ? imageMetaAgg[numKey] : undefined;

      const hashes = meta?.hashes || metaNum?.hashes;
      if (hashes && Array.isArray(hashes) && hashes.includes(hash)) {
        entry.io = 1;
        appliedImageMeta++;
      }
    }
    if (imgSmall && imgSmall.length) entry.is = imgSmall;
    if (v.length) entry.v = v;
    if (uMin != null) entry.uMin = uMin;
    if (uMax != null) entry.uMax = uMax;
    if (sid != null) entry.sid = sid;
    if (sn) entry.sn = sn;
    if (h != null) entry.h = h;
    if (sf) entry.sf = sf;

    // Review stats (minified key: rs)
    const ir = (canonicalKey && itemReviewSummaries?.[canonicalKey]) ?? (numKey ? itemReviewSummaries?.[numKey] : undefined);
    if (ir) {
      const rsObj: Record<string, any> = {};
      if (typeof ir.averageRating === 'number') rsObj.avg = ir.averageRating;
      if (typeof ir.averageDaysToArrive === 'number') rsObj.days = ir.averageDaysToArrive;
      if (typeof ir.numberOfReviews === 'number') rsObj.cnt = ir.numberOfReviews;
      if (Object.keys(rsObj).length > 0) entry.rs = rsObj;
    }

    // Categorization: check for manual override first, then use automated pipeline
    try {
      // Check for manual override by refNum or numeric id
      const override = categoryOverrides.get(String(canonicalKey)) ||
        (numKey ? categoryOverrides.get(String(numKey)) : null);

      if (override) {
        // Apply manual override
        entry.c = override.primary;
        if (override.subcategories.length > 0) {
          entry.sc = override.subcategories;
        }
        // Optional: log for debugging
        // logger.debug(`[index:${code}] Applied category override for item ${canonicalKey}: ${override.primary}`);
      } else if (name || description) {
        // Use automated categorization pipeline
        const cat = categorize(name || "", description || "");
        if (cat?.primary) entry.c = cat.primary;
        if (Array.isArray(cat?.subcategories) && cat.subcategories.length) entry.sc = cat.subcategories;
      }
    } catch { }

    // Change detection vs previous index to update lua/lur like legacy indexer (modified: strict semantics)
    // NOTE: Description comparison only for GB (English market) - non-GB have translated descriptions
    let prev = prevByRef.get(String(ref || ''));
    if (!prev && numId != null) prev = prevByNum.get(String(numId));
    const nowIso = new Date().toISOString();
    // Timestamps (minified keys). Prefer previously written short keys; fallback to legacy long keys.
    const metaHit = canonicalKey ? indexMetaAgg[canonicalKey] : undefined;
    if (metaHit) appliedMeta++;
    const isEnglishMarket = code === 'GB';
    const { changed, reasons: changeReasons } = diffMarketIndexEntries(prev, entry, isEnglishMarket);
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
    // Priority for fsa: aggregate > prev (aggregate is source of truth for historical timestamps)
    const fsa = metaHit?.fsa || prev?.fsa || prev?.firstSeenAt;
    if (fsa) entry.fsa = fsa;
    else if (!prev && !metaHit?.fsa && !coldStart) entry.fsa = nowIso;
    // Last updated + reason: if we detected a change this run, stamp now + reasons; otherwise carry forward
    // Priority for lua: aggregate > prev (aggregate is source of truth)
    // NOTE: metaHit.lua === '' means explicitly cleared (no lua) - don't fall back to prev
    let carriedLua: string | undefined = undefined;
    const metaLuaExplicitlyCleared = metaHit && 'lua' in metaHit && metaHit.lua === '';
    if (metaHit?.lua) carriedLua = metaHit.lua;
    else if (!metaLuaExplicitlyCleared && prev?.lua) carriedLua = prev.lua;
    else if (!metaLuaExplicitlyCleared && prev?.lastUpdatedAt) carriedLua = prev.lastUpdatedAt;
    const carriedLur = metaHit?.lur ?? prev?.lur ?? prev?.lastUpdateReason ?? null;
    if (changed && changeReasons.length > 0) {
      // Real change detected: stamp lua + lur
      entry.lua = nowIso;
      entry.lur = changeReasons.join(', ');
    } else if (carriedLua) {
      // Only carry forward lua if it existed previously; do NOT synthesize
      entry.lua = carriedLua;
      if (carriedLur != null) entry.lur = carriedLur;
    }

    // Translation handling for non-GB markets (AFTER change detection to avoid false triggers)
    // - n/d: Replace with translated content if available
    // - nEn/dEn: Store original English for future frontend toggle
    // - v[].d: Replace variant descriptions with translated versions
    // - v[].dEn: Store original English variant descriptions (for usePerUnitLabel parsing)
    if (needsTranslation && targetLocale && canonicalKey) {
      const itemTranslation = translationsAgg[canonicalKey];
      const localeTranslation = itemTranslation?.locales?.[targetLocale];

      if (localeTranslation?.n) {
        // Store English originals for future toggle
        if (entry.n) entry.nEn = entry.n;
        if (entry.d) entry.dEn = entry.d;
        // Apply translations
        entry.n = localeTranslation.n;
        if (localeTranslation.d) entry.d = localeTranslation.d;
        appliedTranslations++;

        // Apply variant translations if available
        if (localeTranslation.v && Array.isArray(localeTranslation.v) && Array.isArray(entry.v)) {
          // Build a map of vid -> translated description
          const variantTranslationMap = new Map<string | number, string>();
          for (const vt of localeTranslation.v) {
            if (vt.vid !== undefined && vt.d) {
              variantTranslationMap.set(vt.vid, vt.d);
            }
          }

          // Apply translations to each variant, storing English in dEn
          for (const variant of entry.v) {
            if (variant.vid !== undefined) {
              const translatedDesc = variantTranslationMap.get(variant.vid);
              if (translatedDesc && variant.d) {
                // Store English original for usePerUnitLabel parsing
                variant.dEn = variant.d;
                // Apply translation
                variant.d = translatedDesc;
              }
            }
          }
        }
      }
    }

    // Endorsements (minified key): preserve or default 0
    entry.ec = typeof prev?.ec === 'number'
      ? prev.ec
      : (typeof prev?.endorsementCount === 'number' ? prev.endorsementCount : 0);
    // Share link (compact): carry forward if previously embedded; else use aggregate if present
    if (prev?.sl) entry.sl = prev.sl;
    else if (canonicalKey && sharesAgg[canonicalKey]) entry.sl = sharesAgg[canonicalKey];
    // Shipping summary (minified key): prefer fresh aggregate data, then fall back to previous index
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
    // Priority: fresh aggregate > previous sh > previous ship (legacy key)
    const shFromAgg = canonicalKey && shipAgg[canonicalKey] ? normalizeSh(shipAgg[canonicalKey]) : undefined;
    const shFromPrev = prev?.sh ? normalizeSh(prev.sh) : (prev?.ship ? normalizeSh(prev.ship) : undefined);
    entry.sh = shFromAgg ?? shFromPrev;
    // Index into lookup maps for later endorsement join
    try {
      if (numKey) byNumId.set(numKey, entry as Record<string, any>);
      if (canonicalKey) byCanonId.set(canonicalKey, entry as Record<string, any>);
    } catch { }
    if (canonicalKey) {
      const candidate = {
        fsa: typeof entry.fsa === 'string' ? entry.fsa : null,
        lua: typeof entry.lua === 'string' ? entry.lua : null,
        lur: typeof entry.lur === 'string' ? entry.lur : null,
        lsi: new Date().toISOString(),  // lastSeenInIndex - track when item was last in any index
      };
      const { changed, next } = mergeIndexMetaEntry(indexMetaAgg[canonicalKey], candidate);
      if (changed) {
        metaUpdates[canonicalKey] = next;
        indexMetaAgg[canonicalKey] = next;
      }
    }
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
      notes: { artifacts: ["snapshot_meta.json", "data/manifest.json", "indexed_items.json", "sellers.json"], durationMs: durMs, source: snapshotMeta.source, version: snapshotMeta.version },
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
      "sellers.json",
    ],
    snapshotMeta,
  };
}
