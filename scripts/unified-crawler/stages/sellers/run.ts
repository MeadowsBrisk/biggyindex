import type { MarketCode } from "../../shared/env/loadEnv";
import { loadEnv } from "../../shared/env/loadEnv";
import { marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { seedMarketAnalyticsFromLegacy } from "../../shared/persistence/sellerAnalyticsMigration";
import { Keys } from "../../shared/persistence/keys";
import { ensureAuthedClient } from "../../shared/http/authedClient";

// Unified TS analytics helpers
import { computeSellerAnalytics, updateAnalyticsAggregate } from "../../shared/aggregation/sellerAnalytics";
import { computeLeaderboard } from "../../shared/aggregation/leaderboard";

export interface SellersRunResult {
  ok: boolean;
  markets: MarketCode[];
  counts?: { processed?: number };
  note?: string;
}

// Phase A stub: seller crawl stage
// For now, just log intent and return quickly to keep within background function time budget.
export async function runSellers(markets: MarketCode[]): Promise<SellersRunResult> {
  try {
    console.log(`[crawler:sellers] start markets=${markets.join(',')}`);
    const env = loadEnv();
    const sharedBlob = getBlobClient(env.stores.shared);

  // 1) Load market indexes and build seller -> itemIds map and metadata
    const sellerItems = new Map<number | string, Set<string>>();
    const sellerItemsByMarket = new Map<MarketCode, Map<string, Set<string>>>();
    const sellerMarkets = new Map<string, Set<MarketCode>>();
    const sellerMeta = new Map<number | string, { sellerId: number | string; sellerName?: string; sellerUrl?: string; imageUrl?: string }>();

    for (const mkt of markets) {
      const storeName = marketStore(mkt, env.stores as any);
      const blob = getBlobClient(storeName);
      const idx = (await blob.getJSON<any[]>(Keys.market.index(mkt))) || [];
      for (const e of Array.isArray(idx) ? idx : []) {
        const id = e?.id;
        const sid = e?.sid ?? e?.sellerId;
        const sn = e?.sn ?? e?.sellerName;
        if (!id || sid == null) continue;
        const key = String(sid);
        if (!sellerItems.has(key)) sellerItems.set(key, new Set());
        sellerItems.get(key)!.add(String(id));
        if (!sellerItemsByMarket.has(mkt)) sellerItemsByMarket.set(mkt, new Map());
        const marketMap = sellerItemsByMarket.get(mkt)!;
        if (!marketMap.has(key)) marketMap.set(key, new Set());
        marketMap.get(key)!.add(String(id));
        if (!sellerMarkets.has(key)) sellerMarkets.set(key, new Set());
        sellerMarkets.get(key)!.add(mkt);
        if (!sellerMeta.has(key)) {
          sellerMeta.set(key, {
            sellerId: key,
            sellerName: sn || undefined,
            sellerUrl: `https://littlebiggy.net/seller/${encodeURIComponent(String(key))}`,
          });
        } else if (sn && !sellerMeta.get(key)!.sellerName) {
          sellerMeta.get(key)!.sellerName = sn;
        }
      }
    }
  const sellersLimit = Number(process.env.SELLERS_LIMIT || process.env.SELLER_LIMIT || process.env.SELLERS_SCAN_LIMIT || 0);
  const allSellerIds = Array.from(sellerItems.keys()).map(String);
  const selectedSellerIds = sellersLimit > 0 ? allSellerIds.slice(0, sellersLimit) : allSellerIds;
  console.log(`[crawler:sellers] discovered sellers=${sellerItems.size}` + (sellersLimit > 0 ? ` (limiting to ${selectedSellerIds.length})` : ''));

    // defer analytics until after enrichment completes

  // Phase B (budgeted) seller page enrichment: manifesto + image + basic meta
  const enrichConcurrency = Number(process.env.SELLER_ENRICH_CONCURRENCY || 4);
  const rawEnrichLimit = process.env.SELLER_ENRICH_LIMIT;
  const enrichLimit = rawEnrichLimit != null ? Number(rawEnrichLimit) : selectedSellerIds.length;
    const refreshDays = Number(process.env.SELLER_MANIFESTO_REFRESH_DAYS || 3);
    const refreshMs = refreshDays * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
  const toEnrich: Array<{ sid: string; meta: { sellerId: string; sellerName?: string; sellerUrl?: string } }> = [];
  // Parse enrichment blacklist from env (comma/whitespace-separated IDs)
  const blacklistRaw = String(process.env.SELLER_BLACKLIST || '').trim();
  const blacklist = new Set<string>((blacklistRaw ? blacklistRaw.split(/[\s,]+/).filter(Boolean) : []).map(String));
  const skippedBlacklist: string[] = [];
  // Build candidate list by checking which sellers lack a profile or are stale/missing essential fields
    const requireManifesto = /^(1|true|yes|on)$/i.test(String(process.env.SELLER_REQUIRE_MANIFESTO || '').trim());
    for (const [sid, meta] of sellerMeta.entries()) {
      if (blacklist.has(String(sid))) { skippedBlacklist.push(String(sid)); continue; }
      try {
        const existing = await sharedBlob.getJSON<any>(Keys.shared.seller(String(sid)));
        const lastAt = existing?.lastEnrichedAt ? Date.parse(existing.lastEnrichedAt) : 0;
        const stale = !Number.isFinite(lastAt) || (nowMs - (lastAt || 0)) > refreshMs;
        const manifestoMissing = !(typeof existing?.manifesto === 'string' && existing.manifesto.trim().length > 0);
        // Essentials exclude manifesto unless explicitly required via env or record never enriched
        const essentialMissing = !existing?.imageUrl || !existing?.share || (requireManifesto && manifestoMissing);
        const shouldEnrich = !existing || stale || essentialMissing || (manifestoMissing && !existing?.lastEnrichedAt);
        if (shouldEnrich) {
          toEnrich.push({ sid: String(sid), meta: { sellerId: String(sid), sellerName: meta?.sellerName, sellerUrl: meta?.sellerUrl } });
          if (toEnrich.length >= enrichLimit) break;
        }
      } catch {
        // No existing profile -> enrich
        toEnrich.push({ sid: String(sid), meta: { sellerId: String(sid), sellerName: meta?.sellerName, sellerUrl: meta?.sellerUrl } });
        if (toEnrich.length >= enrichLimit) break;
      }
    }
    // Kick off enrichment in parallel with reviews fetching to reduce wall-clock time
    const runEnrichment = async () => {
      if (!toEnrich.length) return { wrote: 0 } as { wrote: number };
      console.log(`[crawler:sellers] enrich starting count=${toEnrich.length} limit=${enrichLimit} conc=${enrichConcurrency}`);
  // Use unified TS parser & fetch helpers
  const { extractManifesto } = await import("../../shared/parse/manifestoExtractor");
  const { extractSellerImageUrl, extractOnlineAndJoined } = await import("../../shared/parse/sellerMetaExtractor");
  const { fetchSellerShareLink } = await import("../../shared/fetch/fetchSellerShareLink");
  const { fetchSellerUserSummary } = await import("../../shared/fetch/fetchSellerUserSummary");
      // Fallback extractor for online/joined if legacy extractor can't find the region
      function fallbackOnlineJoined(html: string): { online: string | null; joined: string | null } {
        try {
          let text = String(html || '')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<br\s*\/?>(?=\s|$)/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          let online: string | null = null;
          // capture common patterns: online now/today/yesterday/"x hours/mins ago"
          const mo = text.match(/\bonline\s+(now|today|yesterday|\d+\s*(?:mins?|minutes?|hours?|hrs?)\s*ago)/i);
          if (mo) online = mo[1].toLowerCase();
          let joined: string | null = null;
          const mj = text.match(/\bjoined\s+([A-Za-z]{3,9}\s+\d{4})/i) || text.match(/\bjoined\s+([^.,;\n]+?)(?:\s|$)/i);
          if (mj) joined = mj[1].trim();
          return { online, joined };
        } catch { return { online: null, joined: null }; }
      }
  // Establish a single authenticated client (same pattern as items stage)
  const { client: httpClient } = await ensureAuthedClient();

      function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), ms);
          p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
        });
      }
  // Fixed attempt budgets (override with env if needed):
  // Attempt 1: 60s, Attempt 2: 140s, Attempt 3: 300s
  const T1_MS = Number(process.env.SELLER_FETCH_T1_MS || 60000);
  const T2_MS = Number(process.env.SELLER_FETCH_T2_MS || 140000);
  const T3_MS = Number(process.env.SELLER_FETCH_T3_MS || 300000);
  // Fallback GET budgets (slightly smaller but generous)
  const FB1_MS = Number(process.env.SELLER_FALLBACK_T1_MS || Math.max(45000, Math.floor(T1_MS * 0.8)));
  const FB2_MS = Number(process.env.SELLER_FALLBACK_T2_MS || 100000);
  const FB3_MS = Number(process.env.SELLER_FALLBACK_T3_MS || 180000);

  async function fetchSellerHtml(id: string): Promise<string | null> {
        // Prefer the proven legacy fetcher for robustness (streaming + early abort)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fetchSellerPage } = await import("../../shared/fetch/fetchSellerPage");

        async function tryOnce(tMain: number, tFallback: number, opts: { earlyAbort: boolean; maxBytes: number; earlyAbortMinBytes?: number }, attemptLabel: string): Promise<string | null> {
          try {
            // Do NOT pass url to avoid 404 early-break on /seller/{id}; rely on sellerId which tries /viewSubject/p/{id}
            const page: any = await withTimeout(
              fetchSellerPage({ client: httpClient, sellerId: id, timeout: tMain, maxBytes: opts.maxBytes, earlyAbort: opts.earlyAbort, earlyAbortMinBytes: opts.earlyAbortMinBytes ?? 8192 }),
              // Allow a cushion beyond axios timeout to avoid premature abort by wrapper
              Math.max(1000, tMain + 8000)
            );
            const html = (page && (page as any).html) || "";
            if (html && html.length > 500) return html;
          } catch (e: any) {
            const code = e?.code || e?.name || e?.message || 'ERR';
            console.warn(`[crawler][warn] ${new Date().toISOString()} [sellerPage] fail id=${id} status=${code} ms=${tMain} attempt=${attemptLabel}`);
          }
          // Fallback simple GETs
          const hosts = ["https://littlebiggy.net", "https://www.littlebiggy.net"];
          try {
            const tasks = hosts.map((h) => {
              const u = `${h}/viewSubject/p/${encodeURIComponent(id)}`;
              return httpClient
                .get(u, { responseType: "text", timeout: tFallback })
                .then((r: any) => (r?.status >= 200 && r?.status < 300 && typeof r.data === "string" ? r.data : null))
                .catch(() => null);
            });
            const results = await withTimeout(Promise.all(tasks), Math.max(1000, tFallback + 8000));
            for (const data of results) {
              if (typeof data === "string" && data.length > 500) return data;
            }
          } catch (e: any) {
            const code = e?.code || e?.name || e?.message || 'ERR';
            console.warn(`[crawler][warn] ${new Date().toISOString()} [sellerPage:fallback] fail id=${id} status=${code} ms=${tFallback} attempt=${attemptLabel}`);
          }
          return null;
        }
        // Attempt 1: quick with early abort
        const html1 = await tryOnce(T1_MS, FB1_MS, { earlyAbort: true, maxBytes: 2_000_000, earlyAbortMinBytes: 8192 }, 't1');
        if (html1) return html1;
        // Attempt 2: 140s without early abort
    const tMain2 = Math.max(T2_MS, 160000);
    const tFallback2 = Math.max(FB2_MS, 120000);
        console.warn(`[crawler][warn] ${new Date().toISOString()} [sellerPage] retry id=${id} tMain=${tMain2} tFallback=${tFallback2}`);
    const html2 = await tryOnce(tMain2, tFallback2, { earlyAbort: false, maxBytes: 3_500_000 }, 't2');
    if (html2) return html2;
    const tMain3 = Math.max(T3_MS, 360000);
    const tFallback3 = Math.max(FB3_MS, 200000);
        console.warn(`[crawler][warn] ${new Date().toISOString()} [sellerPage] final retry id=${id} tMain=${tMain3} tFallback=${tFallback3}`);
    const html3 = await tryOnce(tMain3, tFallback3, { earlyAbort: false, maxBytes: 6_000_000 }, 't3');
    return html3;
      }

  const PQueue = (await import('p-queue')).default;
  const q = new PQueue({ concurrency: enrichConcurrency });
  let imagesAgg: Record<string, string> = {};
  try { imagesAgg = (await sharedBlob.getJSON<any>(Keys.shared.images.sellers())) || {}; } catch { imagesAgg = {}; }
      let done = 0;
      let wrote = 0;
      let noHtml = 0;
      let writeErr = 0;
      const forceShare = /^(1|true|yes|on)$/i.test(String(process.env.SELLER_REFRESH_SHARE || process.env.CRAWLER_REFRESH_SHARE || '').trim());
      await Promise.allSettled(toEnrich.map((entry) => q.add(async () => {
        const sid = entry.sid;
        const t0 = Date.now();
        // Load existing profile to decide whether to refresh share
        let existingProfile: any = null;
        try { existingProfile = await sharedBlob.getJSON<any>(Keys.shared.seller(String(sid))); } catch {}
  let html = await fetchSellerHtml(sid);
  if (!html) { noHtml++; const msFail = Date.now() - t0; console.log(`[cli:seller:time] id=${sid} mode=enrich dur=${msFail}ms ${(msFail/1000).toFixed(2)}s ok=0`); return; }
        let imageUrl: string | null = null;
        let online: string | null = null;
        let joined: string | null = null;
        try { imageUrl = extractSellerImageUrl(html) || null; } catch {}
        try {
          const oj = extractOnlineAndJoined(html);
          online = oj?.online || null; joined = oj?.joined || null;
          if (!online || !joined) {
            const fb = fallbackOnlineJoined(html);
            if (!online) online = fb.online;
            if (!joined) joined = fb.joined;
          }
        } catch {
          const fb = fallbackOnlineJoined(html);
          online = fb.online; joined = fb.joined;
        }
  let man = extractManifesto(html);
        // Rescue: if manifesto empty, perform a single un-aborted, max-budget re-fetch
        if (!man?.manifesto || man.manifesto.trim().length === 0) {
          try {
            const again = await (async () => {
              const { fetchSellerPage } = await import("../../shared/fetch/fetchSellerPage");
              const tMain = Math.max(T3_MS, 360000);
              const tFallback = Math.max(FB3_MS, 200000);
              const page: any = await withTimeout(
                fetchSellerPage({ client: httpClient, sellerId: sid, timeout: tMain, maxBytes: 7_000_000, earlyAbort: false, earlyAbortMinBytes: 0 }),
                Math.max(1000, tMain + 8000)
              );
              const h = (page && (page as any).html) || "";
              if (h && h.length > (html?.length || 0)) return h;
              // Fallback GETs with larger timeout
              const hosts = ["https://littlebiggy.net", "https://www.littlebiggy.net"];
              const res = await withTimeout(Promise.all(hosts.map((h0) => {
                const u = `${h0}/viewSubject/p/${encodeURIComponent(String(sid))}`;
                return httpClient.get(u, { responseType: 'text', timeout: tFallback }).then((r: any) => (typeof r?.data === 'string' ? r.data : null)).catch(() => null);
              })), Math.max(1000, tFallback + 8000));
              return res.find((s: any) => typeof s === 'string' && s.length > 500) || null;
            })();
            if (again) { html = again; man = extractManifesto(html || ''); }
          } catch {}
        }
        // Attempt share link only if missing or forced (no legacy fallbacks)
        let shareLink: string | null = null;
        let shareGenerated = false;
        let shareReused = false;
        if (!forceShare && existingProfile && typeof existingProfile.share === 'string' && existingProfile.share) {
          shareLink = existingProfile.share;
          shareReused = true;
        }
        try {
          if (httpClient && (!shareLink || forceShare)) {
            const res = await fetchSellerShareLink({ client: httpClient, html: html || undefined, sellerId: sid, retry: true, redact: true });
            if (res?.link) { shareLink = res.link; shareGenerated = true; shareReused = false; }
          }
        } catch {}
        // Fetch user summary (statistics + ratings summary)
        let userSummary: any = null; let userStats: any = null;
        try {
          if (httpClient) {
            const sum = await fetchSellerUserSummary({ client: httpClient, sellerId: sid });
            userSummary = sum?.summary || null;
            userStats = sum?.statistics || null;
          }
        } catch {}
        const payload = {
          sellerId: sid,
          sellerName: entry.meta.sellerName || null,
          sellerUrl: entry.meta.sellerUrl || null,
          imageUrl,
          online,
          joined,
          manifesto: man?.manifesto || null,
          manifestoMeta: man?.manifestoMeta || { length: 0, lines: 0 },
          share: shareLink || null,
          summary: userSummary,
          statistics: userStats,
          lastEnrichedAt: new Date().toISOString(),
        };
        try {
          await sharedBlob.putJSON(Keys.shared.seller(sid), payload);
          wrote++;
          const mLen = payload.manifesto ? (payload.manifestoMeta?.length || payload.manifesto.length) : 0;
          const shareMode = payload.share ? (shareGenerated ? 'gen' : (shareReused ? 'reuse' : 'set')) : 'none';
          console.log(`[sellers] stored id=${sid} img=${payload.imageUrl?1:0} manifestoLen=${mLen} share=${payload.share?1:0} shareMode=${shareMode}`);
        } catch (e: any) {
          writeErr++;
          console.warn(`[crawler:sellers] write per-seller failed id=${sid} reason=${e?.message || e}`);
        }
        const ms = Date.now() - t0;
        const sec = (ms / 1000).toFixed(2);
        console.log(`[cli:seller:time] id=${sid} mode=enrich dur=${ms}ms ${sec}s ok=1`);
        if (imageUrl) { imagesAgg[sid] = imageUrl; }
        done++;
        if (done % 5 === 0) console.log(`[crawler:sellers] enrich progress ${done}/${toEnrich.length}`);
      })));
      try { await sharedBlob.putJSON(Keys.shared.images.sellers(), imagesAgg); } catch {}
      // Best-effort visibility
  console.log(`[crawler:sellers] enrich completed ${toEnrich.length} wrote=${wrote} noHtml=${noHtml} writeErr=${writeErr}`);
      return { wrote };
    };
    const enrichmentPromise = runEnrichment();
    // Log a few skipped enrichments for parity/clarity (after enrichment starts)
    // Log a few skipped enrichments for parity/clarity
    try {
      const toEnrichIds = new Set(toEnrich.map(e => e.sid));
      const skippedFresh = selectedSellerIds.filter(id => !toEnrichIds.has(id) && !blacklist.has(String(id)));
      const skipLogLimit = Number(process.env.SELLER_ENRICH_SKIP_LOG_LIMIT || 20);
      for (const sid of skippedFresh.slice(0, skipLogLimit)) {
        console.log(`[cli:seller] skip enrichment id=${sid} reason=fresh`);
      }
      if (skippedFresh.length > skipLogLimit) {
        console.log(`[cli:seller] skip enrichment additionalFresh=${skippedFresh.length - skipLogLimit}`);
      }
      if (skippedBlacklist.length) {
        const blLog = skippedBlacklist.slice(0, skipLogLimit);
        for (const sid of blLog) console.log(`[cli:seller] skip enrichment id=${sid} reason=blacklisted`);
        if (skippedBlacklist.length > skipLogLimit) console.log(`[cli:seller] skip enrichment additionalBlacklisted=${skippedBlacklist.length - skipLogLimit}`);
      }
    } catch {}

    // Expand recent entry to match legacy shape expected by frontend
    type RecentEntry = {
      sellerId: string;
      sellerName?: string | null;
      id?: number | string | null;
      created: number; // epoch seconds (legacy-compatible)
      rating?: number | null;
      daysToArrive?: number | null;
      segments?: any[];
      item?: { refNum?: string | null; name?: string | null; id?: number | null };
      // keep itemId for internal/debugging, but legacy didn't require it
      itemId?: string | null;
    };
    type MediaEntry = RecentEntry & { mediaCount: number; media?: string[] };
    type MarketAnalyticsState = {
      blob: ReturnType<typeof getBlobClient>;
      storeName: string;
      existingAgg: any;
      existingById: Map<string, any>;
      processed: Map<string, any>;
      sellerNameById: Map<string, string>;
      allReviewsBySeller: Map<string, Array<any>>;
      leaderboard?: any;
      trimmedRecent?: RecentEntry[];
      trimmedMedia?: MediaEntry[];
      updatedAgg?: any;
    };

    const perMarketStates = new Map<MarketCode, MarketAnalyticsState>();
    const activeSellerIdsByMarket = new Map<MarketCode, Set<string>>();

    for (const mkt of markets) {
      const storeName = marketStore(mkt, env.stores as any);
      const blobClient = getBlobClient(storeName);
      // Determine active sellers in this market for filtering
      const marketSellers = sellerItemsByMarket.get(mkt);
      const activeSet = new Set<string>(marketSellers ? Array.from(marketSellers.keys()) : []);
      let existingAgg: any = null;
      try {
        existingAgg = await blobClient.getJSON<any>(Keys.market.aggregates.sellerAnalytics());
      } catch {
        existingAgg = null;
      }
      if (!existingAgg) {
        // Try to seed from legacy store filtered to active sellers
        try {
          const seeded = await seedMarketAnalyticsFromLegacy({ market: mkt, activeSellerIds: activeSet });
          if (seeded) {
            existingAgg = seeded;
            console.log(`[crawler:sellers] legacy seed applied market=${mkt} sellers=${seeded.totalSellers}`);
          }
        } catch {}
      }
      if (!existingAgg) {
        // Default empty scaffold
        existingAgg = { generatedAt: new Date().toISOString(), totalSellers: 0, dataVersion: 1, sellers: [] };
      }
      const existingById = new Map<string, any>();
      try {
        for (const rec of Array.isArray(existingAgg?.sellers) ? existingAgg.sellers : []) {
          if (rec && rec.sellerId != null) existingById.set(String(rec.sellerId), rec);
        }
      } catch {}
      activeSellerIdsByMarket.set(mkt, activeSet);
      perMarketStates.set(mkt, {
        blob: blobClient,
        storeName,
        existingAgg,
        existingById,
        processed: new Map<string, any>(),
        sellerNameById: new Map<string, string>(),
        allReviewsBySeller: new Map<string, Array<any>>(),
      });
    }

    // Fetch seller reviews in parallel while enrichment is running
  // Use unified TS review fetch & normalization
  const { fetchSellerReviewsPaged } = await import("../../shared/reviews/fetchSellerReviewsPaged");
  const { normalizeReviews } = await import("../../shared/reviews/normalizeReviews");
    const SELLER_REVIEWS_PAGE_SIZE = Number(process.env.SELLER_REVIEWS_PAGE_SIZE || 100);
    const SELLER_REVIEWS_MAX_STORE = Number(process.env.SELLER_CRAWLER_REVIEW_MAX_STORE || 150);
    const reviewsConcurrency = Number(process.env.SELLER_REVIEWS_CONCURRENCY || 6);
    const fetchAllReviews = async () => {
      const { loadSellerReviewCache, shouldSkipSellerReviews, updateSellerReviewCache, saveSellerReviewCache } = await import("../../shared/reviews/reviewCache");
      const reviewCache = await loadSellerReviewCache();
      const reviewsBySeller = new Map<string, any[]>();
      const { client: httpClientReviews } = await ensureAuthedClient();
      const PQ = (await import('p-queue')).default;
      const rq = new PQ({ concurrency: reviewsConcurrency });
      let rDone = 0;
      let rFail = 0;
      await Promise.allSettled(selectedSellerIds.map((sid) => rq.add(async () => {
        try {
          // Peek first page cheaply to decide skip
          const firstPage = await fetchSellerReviewsPaged({ client: httpClientReviews, sellerId: sid, pageSize: Math.min(20, SELLER_REVIEWS_PAGE_SIZE), maxStore: Math.min(20, SELLER_REVIEWS_MAX_STORE) });
          const newest = Array.isArray(firstPage?.reviews) && firstPage.reviews.length ? firstPage.reviews[0] : null;
          const newestCreated = newest ? (typeof newest.created === 'number' ? newest.created : (newest.reviewDate || newest.date)) : undefined;
          // Disable hard skip by default to ensure we always have content for recents/media.
          // Opt-in to skipping by setting SELLER_REVIEWS_ENABLE_SKIP=true
          const enableSkip = /^(1|true|yes|on)$/i.test(String(process.env.SELLER_REVIEWS_ENABLE_SKIP || '').trim());
          if (enableSkip && shouldSkipSellerReviews(reviewCache, String(sid), typeof newestCreated === 'number' ? newestCreated : undefined)) {
            // Soft skip: keep a small recent sample using the peeked page so markets aren't empty
            const normalizedPeek = normalizeReviews(Array.isArray(firstPage?.reviews) ? firstPage.reviews : [], { captureMedia: true, includeItem: true, includeAuthor: true }) || [];
            reviewsBySeller.set(String(sid), normalizedPeek);
            const created = normalizedPeek.length && typeof normalizedPeek[0].created === 'number' ? normalizedPeek[0].created : undefined;
            updateSellerReviewCache(reviewCache, String(sid), created, normalizedPeek[0]?.id ?? null);
            return;
          }
          // Fetch full sized page set now that we know it's new (reuse first chunk)
          const page = await fetchSellerReviewsPaged({ client: httpClientReviews, sellerId: sid, pageSize: SELLER_REVIEWS_PAGE_SIZE, maxStore: SELLER_REVIEWS_MAX_STORE });
          const raw = Array.isArray(page?.reviews) ? page.reviews : [];
          const normalized = normalizeReviews(raw, { captureMedia: true, includeItem: true, includeAuthor: true }) || [];
          if (normalized.length) {
            const first = normalized[0];
            const created = typeof first.created === 'number' ? first.created : (typeof first.reviewDate === 'number' ? first.reviewDate : undefined);
            updateSellerReviewCache(reviewCache, String(sid), created, first.id || first.reviewId || null);
          }
          reviewsBySeller.set(String(sid), normalized);
        } catch (e: any) {
          rFail++;
          console.warn(`[crawler:sellers] reviews fetch failed seller=${sid} ${e?.message || e}`);
          reviewsBySeller.set(String(sid), []);
        } finally {
          rDone++;
          if (rDone % 10 === 0) console.log(`[crawler:sellers] progress sellers=${rDone}/${selectedSellerIds.length}`);
        }
      })));
      // Save cache after batch
      try { await saveSellerReviewCache(reviewCache); } catch {}
      return { reviewsBySeller, processedTotal: rDone, failed: rFail };
    };
    const reviewsPromise = fetchAllReviews();

    // Wait for enrichment to finish, then overlay imageUrl from profiles
    try {
      await enrichmentPromise;
      for (const sid of selectedSellerIds) {
        try {
          const profile = await sharedBlob.getJSON<any>(Keys.shared.seller(String(sid)));
          if (profile?.imageUrl) {
            const m = sellerMeta.get(sid);
            if (m) m.imageUrl = profile.imageUrl;
          }
        } catch {}
      }
    } catch {}

    // Wait for all reviews to be fetched
    const { reviewsBySeller, processedTotal } = await reviewsPromise;

    // Time windows
    const leaderboardWindowDays = Number(process.env.SELLER_LEADERBOARD_WINDOW_DAYS || 14);
    const leaderboardWindowMs = leaderboardWindowDays * 24 * 60 * 60 * 1000;
    // Recent reviews window (0 = unlimited)
    const recentWindowDays = Number(process.env.SELLER_RECENT_WINDOW_DAYS || 0);
    const recentWindowMs = recentWindowDays > 0 ? (recentWindowDays * 24 * 60 * 60 * 1000) : 0;
    // Media should not be constrained by the recent window unless explicitly configured
    const mediaWindowDays = Number(process.env.SELLER_MEDIA_WINDOW_DAYS || 0);
    const mediaWindowMs = mediaWindowDays > 0 ? (mediaWindowDays * 24 * 60 * 60 * 1000) : 0;

    // Use fetched reviews to compute per-market analytics and recents
    for (const sid of selectedSellerIds) {
  const sellerReviews = reviewsBySeller.get(String(sid)) || [];
      const sellerMarketsSet = sellerMarkets.get(String(sid)) || new Set<MarketCode>();

      for (const [mkt, state] of perMarketStates.entries()) {
        const marketSellerMap = sellerItemsByMarket.get(mkt);
        const itemIds = marketSellerMap?.get(String(sid));
        if (!itemIds || itemIds.size === 0) {
          state.allReviewsBySeller.delete(String(sid));
          continue;
        }
        // Filter logic for per-market reviews
        // By default, include ALL seller reviews for active sellers in this market (decoupled from item match),
        // since the same item reference should be stable cross-market and we don't want to drop media or reviews.
        // Set SELLER_RECENT_REQUIRE_ITEM_MATCH=true to enforce strict itemId matching per market.
        const requireItemMatch = /^(1|true|yes|on)$/i.test(String(process.env.SELLER_RECENT_REQUIRE_ITEM_MATCH || '').trim());
        const allowed = new Set<string>(Array.from(itemIds).map(String));
        const reviews: any[] = [];
        if (!requireItemMatch) {
          for (const r of sellerReviews) {
            const rec = { ...r };
            // Best-effort itemId fill
            if (!rec.itemId) {
              const ref = (r?.item && (r.item.refNum || r.item.id || r.item.ref)) || r?.itemId || r?.itemRef;
              rec.itemId = ref != null ? String(ref) : null;
            }
            reviews.push(rec);
          }
        } else {
          for (const r of sellerReviews) {
            const ref = (r?.item && (r.item.refNum || r.item.id || r.item.ref)) || r?.itemId || r?.itemRef;
            const refStr = ref != null ? String(ref) : null;
            if (refStr && allowed.has(refStr)) {
              const rec = { ...r };
              if (!rec.itemId) rec.itemId = refStr;
              reviews.push(rec);
            }
          }
        }
        state.allReviewsBySeller.set(String(sid), reviews);
        const meta = sellerMeta.get(sid) || { sellerId: sid } as any;
        const existing = state.existingById.get(String(sid));
  const analyticsRecord = computeSellerAnalytics({ sellerId: sid, reviews, sellerMeta: meta, existing }) as any;
  const marketsList = Array.from(sellerMarketsSet.values());
  (analyticsRecord as any).markets = marketsList;
  (analyticsRecord as any).market = mkt;
        state.processed.set(String(sid), analyticsRecord);
        if (meta?.sellerName) state.sellerNameById.set(String(sid), meta.sellerName);
      }

    }

    const limitedScan = sellersLimit > 0;
    const leaderboardLimit = Number(process.env.SELLERS_LEADERBOARD_LIMIT || 8);
    const minBottomNeg = Number(process.env.SELLERS_MIN_BOTTOM_NEG || 2);
    const recentReviewLimit = Number(process.env.SELLER_RECENT_REVIEWS_LIMIT || 150);
    const recentMediaLimit = Number(process.env.SELLER_RECENT_MEDIA_LIMIT || 60);
    const now = Date.now();
    const writeTasks: Promise<any>[] = [];

    for (const [mkt, state] of perMarketStates.entries()) {
      const activeSet = activeSellerIdsByMarket.get(mkt) || new Set<string>();
      const allowedIds = new Set<string>(activeSet);
      const updatedAgg = updateAnalyticsAggregate(state.existingAgg, state.processed);
      const filtered = Array.isArray(updatedAgg?.sellers) ? updatedAgg.sellers.filter((rec: any) => allowedIds.has(String(rec?.sellerId ?? ""))) : [];
      updatedAgg.sellers = filtered;
      updatedAgg.totalSellers = filtered.length;
      state.updatedAgg = updatedAgg;

      // Refresh seller name map with currently active sellers
      for (const sid of allowedIds) {
        const meta = sellerMeta.get(sid) as any;
        if (meta?.sellerName) state.sellerNameById.set(String(sid), meta.sellerName);
      }

      // Build ratings map
      const allRatings = new Map<string, any>();
      for (const recAny of filtered as any[]) {
        const rec = recAny as any;
        const sid = String(rec.sellerId);
        allRatings.set(sid, {
          sellerId: sid,
          sellerName: rec.sellerName || state.sellerNameById.get(sid) || null,
          imageUrl: rec.imageUrl || null,
          url: rec.sellerUrl || (sellerMeta.get(sid)?.sellerUrl || null),
          positive: rec?.lifetime?.positiveCount || 0,
          negative: rec?.lifetime?.negativeCount || 0,
          total: rec?.lifetime?.totalReviews || 0,
          lastCreated: rec?.lifetime?.newestReviewSeen || null,
        });
      }

      const weeklyPositives = new Map<string, any>();
      for (const sid of allowedIds) {
        const reviews = state.allReviewsBySeller.get(String(sid)) || [];
        const counts = new Map<number, number>();
        let positive = 0; let total = 0; let lastCreated: string | null = null;
        for (const rv of reviews) {
          const dRaw = rv?.reviewDate || rv?.date || rv?.created;
          const d = typeof dRaw === 'number' ? new Date(dRaw * 1000) : new Date(dRaw);
          if (!d || isNaN(d.getTime())) continue;
          // Leaderboard window filtering (decoupled from recent/media windows)
          if (now - d.getTime() > leaderboardWindowMs) continue;
          total++;
          const rating = typeof rv?.rating === 'number' ? rv.rating : null;
          if (rating != null) {
            counts.set(rating, (counts.get(rating) || 0) + 1);
            if (rating >= 9) positive++;
          }
          if (!lastCreated || d > new Date(lastCreated)) lastCreated = d.toISOString();
        }
        weeklyPositives.set(String(sid), {
          sellerId: String(sid),
          sellerName: state.sellerNameById.get(String(sid)) || null,
          ratings: counts,
          positive,
          total,
          lastCreated,
        });
      }

      const leaderboardPayload = {
        generatedAt: new Date().toISOString(),
        all: computeLeaderboard({ weeklyPositives, allRatings, sellerNameById: state.sellerNameById, leaderboardLimit, minBottomNegatives: minBottomNeg, useWeek: false }),
        week: computeLeaderboard({ weeklyPositives, allRatings, sellerNameById: state.sellerNameById, leaderboardLimit, minBottomNegatives: minBottomNeg, useWeek: true }),
        metadata: { limitedScan: false },
      } as const;
      state.leaderboard = leaderboardPayload;

  const recent: RecentEntry[] = [];
      const mediaRecent: MediaEntry[] = [];
      for (const sid of allowedIds) {
        const reviews = state.allReviewsBySeller.get(String(sid)) || [];
        const name = state.sellerNameById.get(String(sid)) || null;
        for (const rv of reviews) {
          const dRaw = rv?.reviewDate || rv?.date || rv?.created;
          // Normalize to epoch seconds for legacy compatibility
          const d = typeof dRaw === 'number' ? new Date(dRaw * 1000) : new Date(dRaw);
          if (!d || isNaN(d.getTime())) continue;
          // Do NOT filter by window for media unless SELLER_MEDIA_WINDOW_DAYS > 0
          if (mediaWindowMs > 0 && (now - d.getTime() > mediaWindowMs)) continue;
          const createdEpochSeconds = Math.floor(d.getTime() / 1000);
          const iid = rv?.itemId ? String(rv.itemId) : (rv?.itemRef || (rv?.item && (rv.item.refNum || rv.item.id)) || null);
          const itemObj = (rv?.item || iid) ? {
            refNum: (rv?.item && rv.item.refNum != null) ? rv.item.refNum : (iid != null ? String(iid) : null),
            name: (rv?.item && typeof rv.item.name === 'string') ? rv.item.name : null,
            id: (rv?.item && rv.item.id != null ? rv.item.id : null)
          } : undefined;
          const base: RecentEntry = {
            sellerId: String(sid),
            sellerName: name,
            id: rv?.id ?? null,
            created: createdEpochSeconds,
            rating: typeof rv?.rating === 'number' ? rv.rating : null,
            daysToArrive: typeof rv?.daysToArrive === 'number' ? rv.daysToArrive : null,
            segments: Array.isArray(rv?.segments) ? rv.segments : undefined,
            item: itemObj,
            itemId: iid,
          };
          // Recent reviews respect their own window (0 = unlimited)
          if (recentWindowMs === 0 || (now - d.getTime()) <= recentWindowMs) {
            recent.push(base);
          }
          const segs = Array.isArray(rv?.segments) ? rv.segments : [];
          const urls: string[] = [];
          for (const s of segs) {
            if (!s) continue;
            const t = String(s.type || '').toLowerCase();
            if ((t === 'image' || t === 'video') && s.url) urls.push(String(s.url));
          }
          if (urls.length) {
            mediaRecent.push({ ...base, mediaCount: urls.length, media: urls.slice(0, 3) });
          }
        }
        if (/^(1|true|yes|on)$/i.test(String(process.env.SELLER_DEBUG_RECENTS || '').trim())) {
          console.log(`[crawler:sellers][debug] market=${mkt} sid=${sid} reviews=${reviews.length} recentAdded=${recent.filter(r=>r.sellerId===sid).length} mediaAdded=${mediaRecent.filter(r=>r.sellerId===sid).length}`);
        }
      }
      recent.sort((a, b) => (a.created < b.created ? 1 : -1));
      mediaRecent.sort((a, b) => (a.created < b.created ? 1 : -1));
      state.trimmedRecent = recent.slice(0, recentReviewLimit);
      state.trimmedMedia = mediaRecent.slice(0, recentMediaLimit);

      writeTasks.push(
        state.blob.putJSON(Keys.market.aggregates.sellerAnalytics(), updatedAgg)
          .then(() => console.log(`[crawler:sellers] wrote seller-analytics market=${mkt} sellers=${updatedAgg.totalSellers}`))
          .catch((e: any) => console.warn(`[crawler:sellers] write seller-analytics failed market=${mkt} reason=${e?.message || e}`))
      );

      if (limitedScan) {
        (leaderboardPayload.metadata as any).limitedScan = true;
      }
      writeTasks.push(
        state.blob.putJSON(Keys.market.aggregates.sellersLeaderboard(), leaderboardPayload)
          .then(() => console.log(`[crawler:sellers] wrote sellers-leaderboard market=${mkt} top=${leaderboardPayload.all.top.length}/${leaderboardPayload.week.top.length}`))
          .catch((e: any) => console.warn(`[crawler:sellers] write sellers-leaderboard failed market=${mkt} reason=${e?.message || e}`))
      );
      writeTasks.push(
        state.blob.putJSON(Keys.market.aggregates.recentReviews(), state.trimmedRecent)
          .then(() => console.log(`[crawler:sellers] wrote recent-reviews market=${mkt} count=${state.trimmedRecent?.length || 0}`))
          .catch((e: any) => console.warn(`[crawler:sellers] write recent-reviews failed market=${mkt} reason=${e?.message || e}`))
      );
      writeTasks.push(
        state.blob.putJSON(Keys.market.aggregates.recentMedia(), state.trimmedMedia)
          .then(() => console.log(`[crawler:sellers] wrote recent-media market=${mkt} count=${state.trimmedMedia?.length || 0}`))
          .catch((e: any) => console.warn(`[crawler:sellers] write recent-media failed market=${mkt} reason=${e?.message || e}`))
      );
    }

    if (writeTasks.length) {
      try { await Promise.allSettled(writeTasks); } catch {}
    }

    return { ok: true, markets, counts: { processed: processedTotal } };
  } catch (e: any) {
    console.error(`[crawler:sellers] error`, e?.message || e);
    return { ok: false, markets, counts: { processed: 0 }, note: e?.message || String(e) } as any;
  }
}
