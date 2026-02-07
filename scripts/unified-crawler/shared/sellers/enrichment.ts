import { ensureAuthedClient } from "../http/authedClient";
import { Keys } from "../persistence/keys";
import type { SellerMetaRecord } from "./worklist";
import type { SellerStateAggregate, SellerStateEntry } from "../types";
import { fetchSellerReviewsPaged } from "../reviews/fetchSellerReviewsPaged";
import { normalizeReviews } from "../reviews/normalizeReviews";
import { loadSellerReviewCache, saveSellerReviewCache, shouldSkipSellerReviews, updateSellerReviewCache } from "../reviews/reviewCache";
import { log, timer } from "../logging/logger";

export interface SellerEnrichmentTask {
  sid: string;
  meta: SellerMetaRecord;
}

export interface SellerPipelineTask extends SellerEnrichmentTask {
  mode: "full" | "reviews";
}

export interface SellerEnrichmentPlanResult {
  toEnrich: SellerEnrichmentTask[];
  skippedFresh: string[];
  skippedBlacklist: string[];
}

export async function planSellerEnrichment(opts: {
  sellerMeta: Map<string, SellerMetaRecord>;
  selectedSellerIds: string[];
  sharedBlob: ReturnType<typeof import("../persistence/blobs").getBlobClient>;
  refreshMs: number;
  requireManifesto: boolean;
  blacklist: Set<string>;
  forceFull: boolean;
  enrichLimit: number;
}): Promise<SellerEnrichmentPlanResult> {
  const { sellerMeta, selectedSellerIds, sharedBlob, refreshMs, requireManifesto, blacklist, forceFull, enrichLimit } = opts;
  const iterateSellerIds = selectedSellerIds.length ? selectedSellerIds : Array.from(sellerMeta.keys()).map(String);
  const toEnrich: SellerEnrichmentTask[] = [];
  const skippedFresh: string[] = [];
  const skippedBlacklist: string[] = [];
  const nowMs = Date.now();

  for (const sellerId of iterateSellerIds) {
    const meta = sellerMeta.get(sellerId) || { sellerId };
    if (blacklist.has(sellerId)) {
      skippedBlacklist.push(sellerId);
      continue;
    }
    if (forceFull) {
      toEnrich.push({ sid: sellerId, meta });
      if (toEnrich.length >= enrichLimit) break;
      continue;
    }
    try {
      const existing = await sharedBlob.getJSON<any>(Keys.shared.seller(sellerId));
      const lastAt = existing?.lastEnrichedAt ? Date.parse(existing.lastEnrichedAt) : 0;
      const stale = !Number.isFinite(lastAt) || (nowMs - (lastAt || 0)) > refreshMs;
      const manifestoMissing = !(typeof existing?.manifesto === "string" && existing.manifesto.trim().length > 0);
      const essentialMissing = !existing?.imageUrl || !existing?.share || (requireManifesto && manifestoMissing);
      const shouldEnrich = !existing || stale || essentialMissing || (manifestoMissing && !existing?.lastEnrichedAt);
      if (shouldEnrich) {
        toEnrich.push({ sid: sellerId, meta });
        if (toEnrich.length >= enrichLimit) break;
      } else {
        skippedFresh.push(sellerId);
      }
    } catch {
      toEnrich.push({ sid: sellerId, meta });
      if (toEnrich.length >= enrichLimit) break;
    }
  }

  return { toEnrich, skippedFresh, skippedBlacklist };
}

/**
 * Synchronous seller enrichment planning using the cached state aggregate.
 * This is the fast path - NO blob reads per seller, just in-memory lookups.
 * 
 * Expected performance: ~0ms for 200+ sellers (vs 15-20s with per-seller reads)
 */
export function planSellerEnrichmentSync(opts: {
  sellerMeta: Map<string, SellerMetaRecord>;
  selectedSellerIds: string[];
  sellerState: SellerStateAggregate | null;
  refreshMs: number;
  requireManifesto: boolean;
  blacklist: Set<string>;
  forceFull: boolean;
  enrichLimit: number;
}): SellerEnrichmentPlanResult {
  const { sellerMeta, selectedSellerIds, sellerState, refreshMs, requireManifesto, blacklist, forceFull, enrichLimit } = opts;
  const iterateSellerIds = selectedSellerIds.length ? selectedSellerIds : Array.from(sellerMeta.keys()).map(String);
  const toEnrich: SellerEnrichmentTask[] = [];
  const skippedFresh: string[] = [];
  const skippedBlacklist: string[] = [];
  const nowMs = Date.now();
  const sellers = sellerState?.sellers || {};

  for (const sellerId of iterateSellerIds) {
    const meta = sellerMeta.get(sellerId) || { sellerId };
    
    if (blacklist.has(sellerId)) {
      skippedBlacklist.push(sellerId);
      continue;
    }
    
    if (forceFull) {
      toEnrich.push({ sid: sellerId, meta });
      if (toEnrich.length >= enrichLimit) break;
      continue;
    }

    const rec = sellers[sellerId];
    
    // No record = new seller, needs enrichment
    if (!rec) {
      toEnrich.push({ sid: sellerId, meta });
      if (toEnrich.length >= enrichLimit) break;
      continue;
    }

    // Check staleness
    const lastAt = rec.lastEnrichedAt ? Date.parse(rec.lastEnrichedAt) : 0;
    const stale = !Number.isFinite(lastAt) || (nowMs - lastAt) > refreshMs;
    
    // Check essential fields
    const essentialMissing = !rec.hasImage || !rec.hasShare || (requireManifesto && !rec.hasManifesto);
    
    if (stale || essentialMissing) {
      toEnrich.push({ sid: sellerId, meta });
      if (toEnrich.length >= enrichLimit) break;
    } else {
      skippedFresh.push(sellerId);
    }
  }

  return { toEnrich, skippedFresh, skippedBlacklist };
}

/**
 * Build a SellerStateEntry from enrichment results.
 * Used to update the state aggregate after processing.
 */
export function buildSellerStateEntry(profile: {
  manifesto?: string;
  imageUrl?: string;
  sellerImageUrl?: string;
  share?: string;
  reviews?: unknown[];
}): SellerStateEntry {
  return {
    lastEnrichedAt: new Date().toISOString(),
    hasManifesto: typeof profile.manifesto === "string" && profile.manifesto.trim().length > 0,
    hasImage: Boolean(profile.imageUrl || profile.sellerImageUrl),
    hasShare: Boolean(profile.share),
    hasReviews: Array.isArray(profile.reviews) && profile.reviews.length > 0,
    reviewCount: Array.isArray(profile.reviews) ? profile.reviews.length : 0,
  };
}

export interface SellerEnrichmentConfig {
  concurrency: number;
  requireManifesto: boolean;
  forceShare: boolean;
  t1Ms: number;
  t2Ms: number;
  t3Ms: number;
  fb1Ms: number;
  fb2Ms: number;
  fb3Ms: number;
}

export interface SellerReviewOptions {
  pageSize: number;
  maxStore: number;
  enableSkip: boolean;
}

export interface SellerEnrichmentResult {
  wrote: number;
  noHtml: number;
  writeErr: number;
  imagesAgg: Record<string, string>;
  reviewsBySeller: Map<string, any[]>;
  reviewsMetaBySeller: Map<string, { fetched: number; sourceFetched: number; mode?: string; pageSizeRequested?: number; pages?: any[] }>;
  processed: number;
  reviewFailures: number;
  essentialMissing: Array<{ sellerId: string; missing: string[] }>;
}

export async function runSellerEnrichment(opts: {
  tasks: SellerPipelineTask[];
  sharedBlob: ReturnType<typeof import("../persistence/blobs").getBlobClient>;
  config: SellerEnrichmentConfig;
  reviewOptions: SellerReviewOptions;
}): Promise<SellerEnrichmentResult> {
  const { tasks, sharedBlob, config, reviewOptions } = opts;
  if (!tasks.length) {
    return {
      wrote: 0,
      noHtml: 0,
      writeErr: 0,
      imagesAgg: {},
      reviewsBySeller: new Map(),
      reviewsMetaBySeller: new Map(),
      processed: 0,
      reviewFailures: 0,
      essentialMissing: [],
    };
  }

  log.sellers.info(`pipeline starting`, { count: tasks.length, concurrency: config.concurrency });

  const { client: httpClient, jar: httpJar } = await ensureAuthedClient();
  const imagesAgg: Record<string, string> = (await sharedBlob.getJSON<any>(Keys.shared.images.sellers()).catch(() => ({}))) || {};
  const reviewsBySeller = new Map<string, any[]>();
  const reviewsMetaBySeller = new Map<string, { fetched: number; sourceFetched: number; mode?: string; pageSizeRequested?: number; pages?: any[] }>();
  const reviewCache = await loadSellerReviewCache();

  const PQueue = (await import("p-queue")).default;
  const q = new PQueue({ concurrency: config.concurrency });
  let wrote = 0;
  let noHtml = 0;
  let writeErr = 0;
  let processed = 0;
  let reviewFailures = 0;
  const essentialMissing: Array<{ sellerId: string; missing: string[] }> = [];

  const { extractManifesto } = await import("../parse/manifestoExtractor");
  const { extractSellerImageUrl, extractOnlineAndJoined } = await import("../parse/sellerMetaExtractor");
  const { fetchSellerShareLink } = await import("../fetch/fetchSellerShareLink");
  const { fetchSellerUserSummary } = await import("../fetch/fetchSellerUserSummary");
  const { fetchSellerPage } = await import("../fetch/fetchSellerPage");

  function fallbackOnlineJoined(html: string): { online: string | null; joined: string | null } {
    try {
      const text = String(html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>(?=\s|$)/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const mo = text.match(/\bonline\s+(now|today|yesterday|\d+\s*(?:mins?|minutes?|hours?|hrs?)\s*ago)/i);
      const mj = text.match(/\bjoined\s+([A-Za-z]{3,9}\s+\d{4})/i) || text.match(/\bjoined\s+([^.,;\n]+?)(?:\s|$)/i);
      return { online: mo ? mo[1].toLowerCase() : null, joined: mj ? mj[1].trim() : null };
    } catch {
      return { online: null, joined: null };
    }
  }

  async function fetchSellerHtml(id: string): Promise<string | null> {
    async function tryOnce(tMain: number, tFallback: number, opts: { earlyAbort: boolean; maxBytes: number; earlyAbortMinBytes?: number }, label: string) {
      try {
        const page: any = await withTimeout(
          fetchSellerPage({ client: httpClient, sellerId: id, timeout: tMain, maxBytes: opts.maxBytes, earlyAbort: opts.earlyAbort, earlyAbortMinBytes: opts.earlyAbortMinBytes ?? 8192 }),
          Math.max(1000, tMain + 8000)
        );
        const html = (page && (page as any).html) || "";
        if (html && html.length > 500) return html;
      } catch (e: any) {
        const code = e?.code || e?.name || e?.message || "ERR";
        log.sellers.warn(`sellerPage fail`, { id, status: code, ms: tMain, attempt: label });
      }
      const hosts = ["https://littlebiggy.net", "https://www.littlebiggy.net"];
      try {
        const results = await withTimeout(Promise.all(hosts.map((h) => {
          const url = `${h}/viewSubject/p/${encodeURIComponent(id)}`;
          return httpClient.get(url, { responseType: "text", timeout: tFallback }).then((r: any) => (r?.status >= 200 && r?.status < 300 && typeof r.data === "string" ? r.data : null)).catch(() => null);
        })), Math.max(1000, tFallback + 8000));
        for (const data of results) {
          if (typeof data === "string" && data.length > 500) return data;
        }
      } catch (e: any) {
        const code = e?.code || e?.name || e?.message || "ERR";
        log.sellers.warn(`sellerPage fallback fail`, { id, status: code, ms: tFallback, attempt: label });
      }
      return null;
    }
    const html1 = await tryOnce(config.t1Ms, config.fb1Ms, { earlyAbort: true, maxBytes: 2_000_000, earlyAbortMinBytes: 8192 }, "t1");
    if (html1) return html1;
    const tMain2 = Math.max(config.t2Ms, 160000);
    const tFallback2 = Math.max(config.fb2Ms, 120000);
    log.sellers.warn(`sellerPage retry`, { id, tMain: tMain2, tFallback: tFallback2 });
    const html2 = await tryOnce(tMain2, tFallback2, { earlyAbort: false, maxBytes: 3_500_000 }, "t2");
    if (html2) return html2;
    const tMain3 = Math.max(config.t3Ms, 360000);
    const tFallback3 = Math.max(config.fb3Ms, 200000);
    log.sellers.warn(`sellerPage final retry`, { id, tMain: tMain3, tFallback: tFallback3 });
    return tryOnce(tMain3, tFallback3, { earlyAbort: false, maxBytes: 6_000_000 }, "t3");
  }

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), ms);
      promise.then((val) => { clearTimeout(timer); resolve(val); }, (err) => { clearTimeout(timer); reject(err); });
    });
  }

  async function fetchSellerReviews(sid: string) {
    try {
      const peekSize = Math.min(20, reviewOptions.pageSize);
      const peekMax = Math.min(20, reviewOptions.maxStore);
      if (reviewOptions.enableSkip) {
        const firstPage = await fetchSellerReviewsPaged({ client: httpClient, sellerId: sid, pageSize: peekSize, maxStore: peekMax });
        const newest = Array.isArray(firstPage?.reviews) && firstPage.reviews.length ? firstPage.reviews[0] : null;
        const newestCreated = newest ? (typeof newest.created === "number" ? newest.created : (newest.reviewDate || newest.date)) : undefined;
        if (shouldSkipSellerReviews(reviewCache, String(sid), typeof newestCreated === "number" ? newestCreated : undefined)) {
          const normalizedPeek = normalizeReviews(Array.isArray(firstPage?.reviews) ? firstPage.reviews : [], { captureMedia: true, includeItem: true, includeAuthor: true }) || [];
          const created = normalizedPeek.length && typeof normalizedPeek[0].created === "number" ? normalizedPeek[0].created : undefined;
          updateSellerReviewCache(reviewCache, String(sid), created, normalizedPeek[0]?.id ?? null);
          return {
            reviews: normalizedPeek,
            meta: {
              fetched: normalizedPeek.length,
              sourceFetched: typeof firstPage?.sourceFetched === "number" ? firstPage.sourceFetched : normalizedPeek.length,
              mode: "peek",
              pageSizeRequested: peekSize,
              pages: firstPage?.meta?.pages || [],
            },
          };
        }
      }
      const fullPage = await fetchSellerReviewsPaged({ client: httpClient, sellerId: sid, pageSize: reviewOptions.pageSize, maxStore: reviewOptions.maxStore });
      const raw = Array.isArray(fullPage?.reviews) ? fullPage.reviews : [];
      const normalized = normalizeReviews(raw, { captureMedia: true, includeItem: true, includeAuthor: true }) || [];
      if (normalized.length) {
        const first = normalized[0];
        const created = typeof first.created === "number" ? first.created : (typeof (first as any).reviewDate === "number" ? (first as any).reviewDate : undefined);
        updateSellerReviewCache(reviewCache, String(sid), created, (first as any).id || (first as any).reviewId || null);
      }
      return {
        reviews: normalized,
        meta: {
          fetched: normalized.length,
          sourceFetched: typeof fullPage?.sourceFetched === "number" ? fullPage.sourceFetched : normalized.length,
          mode: fullPage?.meta?.mode || "paged",
          pageSizeRequested: fullPage?.meta?.pageSizeRequested || reviewOptions.pageSize,
          pages: fullPage?.meta?.pages || [],
        },
      };
    } catch (err) {
      reviewFailures++;
      log.sellers.warn(`reviews fetch failed`, { seller: sid, reason: (err as any)?.message || String(err) });
      return {
        reviews: [],
        meta: { fetched: 0, sourceFetched: 0, mode: "error" },
      };
    }
  }

  await Promise.allSettled(tasks.map((task) => q.add(async () => {
    const sid = task.sid;
    const mode = task.mode || "full";
    const started = Date.now();
    try {
      const existingProfile = await sharedBlob.getJSON<any>(Keys.shared.seller(sid)).catch(() => null);
      const baseProfile = existingProfile ? { ...existingProfile } : null;
      const next = baseProfile ? { ...baseProfile } : {
        sellerId: sid,
        sellerName: task.meta.sellerName || null,
        sellerUrl: task.meta.sellerUrl || null,
      };
      if (!next.sellerName && task.meta.sellerName) next.sellerName = task.meta.sellerName;
      if (!next.sellerUrl && task.meta.sellerUrl) next.sellerUrl = task.meta.sellerUrl;

      const needsFull = mode === "full" || !baseProfile;
      let imageUrl = next.imageUrl || next.sellerImageUrl || task.meta.imageUrl || null;
      let online = next.online ?? next.sellerOnline ?? null;
      let joined = next.joined ?? next.sellerJoined ?? null;
      let manifestoText = next.manifesto || null;
      let manifestoMeta = next.manifestoMeta || { length: manifestoText?.length || 0, lines: 0 };
      let shareLink = next.share || null;
      let shareGenerated = false;
      let shareReused = Boolean(shareLink);
      let summary = next.summary || next.overview || null;
      let statistics = next.statistics || null;

      if (needsFull) {
        let html = await fetchSellerHtml(sid);
        if (!html) {
          noHtml++;
          const failMs = Date.now() - started;
          log.sellers.time(`id=${sid}`, failMs, { mode, ok: 0 });
          return;
        }
        try {
          const extractedImage = extractSellerImageUrl(html);
          if (extractedImage) imageUrl = extractedImage;
        } catch (e: any) { log.sellers.debug(`extractImage failed`, { id: sid, err: e?.message }); }
        try {
          const oj = extractOnlineAndJoined(html);
          online = oj?.online || online;
          joined = oj?.joined || joined;
          if (!online || !joined) {
            const fb = fallbackOnlineJoined(html);
            if (!online) online = fb.online;
            if (!joined) joined = fb.joined;
          }
        } catch (e: any) {
          log.sellers.debug(`extractOnlineJoined failed`, { id: sid, err: e?.message });
          const fb = fallbackOnlineJoined(html);
          online = online || fb.online;
          joined = joined || fb.joined;
        }
        try {
          const man = extractManifesto(html);
          if (man?.manifesto && man.manifesto.trim().length) {
            manifestoText = man.manifesto;
            manifestoMeta = man.manifestoMeta || { length: man.manifesto.length, lines: 0 };
          }
        } catch (e: any) { log.sellers.debug(`extractManifesto failed`, { id: sid, err: e?.message }); }
        if (!manifestoText || manifestoText.trim().length === 0) {
          try {
            const tMain = Math.max(config.t3Ms, 360000);
            const tFallback = Math.max(config.fb3Ms, 200000);
            const page: any = await withTimeout(fetchSellerPage({ client: httpClient, sellerId: sid, timeout: tMain, maxBytes: 7_000_000, earlyAbort: false, earlyAbortMinBytes: 0 }), Math.max(1000, tMain + 8000));
            const retryHtml = (page && (page as any).html) || "";
            if (retryHtml && retryHtml.length > (html?.length || 0)) {
              const man = extractManifesto(retryHtml || "");
              if (man?.manifesto && man.manifesto.trim().length) {
                manifestoText = man.manifesto;
                manifestoMeta = man.manifestoMeta || { length: man.manifesto.length, lines: 0 };
              }
            }
          } catch (e: any) { log.sellers.debug(`manifesto retry failed`, { id: sid, err: e?.message }); }
        }
        if (!config.forceShare && shareLink) {
          shareReused = true;
        } else {
          try {
            const res = await fetchSellerShareLink({ client: httpClient, jar: httpJar, html, sellerId: sid, retry: true, redact: true });
            if (res?.link) {
              shareLink = res.link;
              shareGenerated = true;
              shareReused = false;
            }
          } catch (e: any) { log.sellers.debug(`shareLink fetch failed`, { id: sid, err: e?.message }); }
        }
        try {
          const summaryRes = await fetchSellerUserSummary({ client: httpClient, sellerId: sid });
          summary = summaryRes?.summary || summary;
          statistics = summaryRes?.statistics || statistics;
        } catch (e: any) { log.sellers.debug(`userSummary fetch failed`, { id: sid, err: e?.message }); }
      }

      const { reviews, meta: reviewMeta } = await fetchSellerReviews(sid);
      reviewsBySeller.set(sid, reviews);
      reviewsMetaBySeller.set(sid, reviewMeta);

      const metaOut = { ...(next.reviewsMeta || {}), ...reviewMeta, updatedAt: new Date().toISOString() };
      if (summary) metaOut.summary = summary;
      if (statistics) metaOut.statistics = statistics;

      const payload = {
        ...next,
        sellerId: sid,
        sellerName: next.sellerName ?? task.meta.sellerName ?? null,
        sellerUrl: next.sellerUrl ?? task.meta.sellerUrl ?? null,
        imageUrl,
        sellerImageUrl: imageUrl,
        online,
        sellerOnline: online,
        joined,
        sellerJoined: joined,
        manifesto: manifestoText,
        manifestoMeta,
        share: shareLink,
        summary,
        overview: summary || next.overview || null,
        statistics,
        lastEnrichedAt: needsFull ? new Date().toISOString() : next.lastEnrichedAt || new Date().toISOString(),
        reviews,
        reviewsMeta: metaOut,
      };

      try {
        await sharedBlob.putJSON(Keys.shared.seller(sid), payload);
        wrote++;
        const mLen = payload.manifesto ? (payload.manifestoMeta?.length || payload.manifesto.length) : 0;
        const shareMode = payload.share ? (shareGenerated ? "gen" : (shareReused ? "reuse" : "set")) : "none";
        log.sellers.info(`stored`, { id: sid, mode, img: payload.imageUrl ? 1 : 0, manifestoLen: mLen, share: payload.share ? 1 : 0, shareMode, reviews: reviews.length, reviewMode: reviewMeta.mode || "n/a" });
      } catch (e: any) {
        writeErr++;
        log.sellers.warn(`write per-seller failed`, { id: sid, reason: e?.message || String(e) });
      }

      if (imageUrl) {
        imagesAgg[sid] = imageUrl;
        task.meta.imageUrl = imageUrl;
      }

      const missing: string[] = [];
      if (!imageUrl) missing.push("image");
      if (!shareLink) missing.push("share");
      if (!manifestoText || !manifestoText.trim()) missing.push("manifesto");
      if (!reviews.length) missing.push("reviews");
      if (missing.length) {
        essentialMissing.push({ sellerId: sid, missing });
      }

      processed++;
      const elapsed = Date.now() - started;
      log.sellers.time(`id=${sid}`, elapsed, { mode, ok: 1 });
      if (processed % 10 === 0 || processed === tasks.length) {
        log.sellers.info(`progress`, { sellers: `${processed}/${tasks.length}` });
      }
    } catch (err) {
      noHtml++;
      const failMs = Date.now() - started;
      log.sellers.time(`id=${sid}`, failMs, { mode, ok: 0 });
      log.sellers.warn(`pipeline failed`, { id: sid, reason: (err as any)?.message || String(err) });
    }
  })));

  try { await sharedBlob.putJSON(Keys.shared.images.sellers(), imagesAgg); } catch {}
  try { await saveSellerReviewCache(reviewCache); } catch {}

  log.sellers.info(`pipeline completed`, { processed, wrote, noHtml, writeErr, essentialMissing: essentialMissing.length });
  return { wrote, noHtml, writeErr, imagesAgg, reviewsBySeller, reviewsMetaBySeller, processed, reviewFailures, essentialMissing };
}
