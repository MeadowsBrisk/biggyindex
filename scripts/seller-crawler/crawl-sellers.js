#!/usr/bin/env node
/* Seller crawler (scaffold) */

const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { loadSellerEnv } = require('./env/loadSellerEnv');
const log = require('../item-crawler/util/logger');
const { delay, jitter } = require('../item-crawler/util/delay');
const { createHttpClient } = require('../item-crawler/fetch/httpClient');
const { login } = require('../item-crawler/auth/login');
const { fetchSellerPage } = require('./fetch/fetchSellerPage');
const { parseSellerRef } = require('./parse/parseSellerRef');
const { extractManifesto } = require('./parse/manifestoExtractor');
const { fetchSellerReviewsPaged } = require('./fetch/fetchSellerReviewsPaged');
const { fetchSellerShareLink } = require('./fetch/fetchSellerShareLink');
const { extractSellerImageUrl, extractOnlineAndJoined } = require('./parse/sellerMetaExtractor');
const { fetchSellerUserSummary } = require('./fetch/fetchSellerUserSummary');
const { setPersistence: setSellerPersistence, writePerSeller, writeRunMeta, writeShareLinks, writeRecentReviews, writeRecentMedia, writeSellersLeaderboard, upsertSellerImages } = require('./persistence/sellerOutputs');
const { loadStateAsync, saveStateAsync } = require('../item-crawler/persistence/stateStore');
const { loadCookieJar, saveCookieJar, listCookies } = require('../item-crawler/persistence/cookieStore');
const { decideSellerCrawlKind } = require('./util/decideSellerCrawlKind');
const { processRecentAggregates } = require('./aggregation/processRecentAggregates');
const { computeLeaderboard } = require('./aggregation/computeLeaderboard');

function computeRecentSellers({ state, allRatings, sellerNameById, limit = 10 }) {
  // Wilson score helper (same as leaderboard) with priors for fairness
  const computeWilsonScore = (positive, total, priorPositive = 20, priorTotal = 40) => {
    const pHat = (positive + priorPositive) / (total + priorTotal);
    const z = 1.96;
    const denom = 1 + (z * z) / (total + priorTotal);
    const center = pHat + (z * z) / (2 * (total + priorTotal));
    const margin = z * Math.sqrt((pHat * (1 - pHat) + (z * z) / (4 * (total + priorTotal))) / (total + priorTotal));
    return (center - margin) / denom;
  };

  const entries = [];
  const sellersState = state?.sellers || {};
  const monthIndex = (m) => {
    const map = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, sept: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11,
    };
    const key = String(m || '').trim().toLowerCase();
    return map.hasOwnProperty(key) ? map[key] : null;
  };
  const parseJoined = (str) => {
    if (!str || typeof str !== 'string') return { iso: null, ts: NaN };
    const s = str.trim().toLowerCase().replace(/[,]+/g, ' ');
    const m = s.match(/([a-z]{3,9})\s+(\d{4})/i);
    if (!m) return { iso: null, ts: NaN };
    const mi = monthIndex(m[1]);
    const year = Number.parseInt(m[2], 10);
    if (!Number.isFinite(mi) || !Number.isFinite(year)) return { iso: null, ts: NaN };
    const d = new Date(Date.UTC(year, mi, 1));
    const iso = d.toISOString();
    const ts = d.getTime();
    return { iso, ts };
  };
  for (const [idStr, rec] of Object.entries(sellersState)) {
    const sellerId = Number.parseInt(idStr, 10);
    if (!Number.isFinite(sellerId)) continue;
    const firstIso = rec?.firstSeenAt || null;
    const firstTs = firstIso ? Date.parse(firstIso) : NaN;
    const { iso: joinedIso, ts: joinedTs } = parseJoined(rec?.sellerJoined || rec?.joinedAt || null);
    const primaryIso = joinedIso || firstIso;
    const primaryTs = Number.isFinite(joinedTs) ? joinedTs : firstTs;
    if (!Number.isFinite(primaryTs)) continue;
    const meta = allRatings.get(sellerId) || { sellerId, sellerName: sellerNameById.get(sellerId) || null, imageUrl: null, url: null, positive: 0, negative: 0, total: 0, lastCreated: null };
    const positive = Number.isFinite(meta.positive) ? meta.positive : 0;
    const total = Number.isFinite(meta.total) ? meta.total : 0;
    const score = total > 0 ? computeWilsonScore(positive, total) : 0;
    entries.push({
      sellerId,
      sellerName: meta.sellerName || sellerNameById.get(sellerId) || null,
      imageUrl: meta.imageUrl || null,
      url: meta.url || null,
      positive,
      negative: Number.isFinite(meta.negative) ? meta.negative : 0,
      total,
      score,
      lastReviewAt: meta.lastCreated || null,
      firstSeenAt: firstIso,
      joinedAt: joinedIso || (typeof rec?.sellerJoined === 'string' ? rec.sellerJoined : null),
      firstSeenTs: firstTs,
      joinedTs,
      primaryTs,
    });
  }
  entries.sort((a, b) => (b.primaryTs - a.primaryTs) || (((b.lastReviewAt || 0) - (a.lastReviewAt || 0))));
  return entries.slice(0, limit).map(({ firstSeenTs, joinedTs, primaryTs, ...rest }) => rest);
}

async function getBlobsStore({ storeName }) {
  try {
    const { getStore } = await import('@netlify/blobs');
    let store = null;
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
    if (siteID && token) {
      try { store = getStore({ name: storeName, siteID, token, consistency: 'strong' }); } catch {}
    }
    if (!store) {
      try { store = getStore({ name: storeName, consistency: 'strong' }); } catch {}
    }
    return store || null;
  } catch {
    return null;
  }
}

async function loadSellersList(env) {
  // 1) Blobs
  try {
    const store = await getBlobsStore({ storeName: env.blobsStore || 'site-index' });
    if (store) {
      const raw = await store.get('sellers.json');
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) return data;
      }
    }
  } catch (e) {
    log.debug('[sellers] blobs load failed ' + (e?.message || String(e)));
  }
  // 2) Filesystem
  try {
    const p = path.join(__dirname, '..', '..', 'public', 'sellers.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    log.debug('[sellers] fs load failed ' + e.message);
  }
  // 3) Public HTTP
  if (env.publicBase) {
    try {
      const fetch = (await import('node-fetch')).default;
      const url = `${env.publicBase.replace(/\/$/, '')}/sellers.json`;
      const r = await fetch(url, { timeout: 6000 });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      log.debug('[sellers] public load failed ' + (e?.message || String(e)));
    }
  }
  return [];
}

async function main() {
  // Load .env if present (root or local)
  try { require('dotenv').config(); } catch {}
  try {
    const localEnv = path.join(__dirname, '.env');
    if (fs.existsSync(localEnv)) {
      const dotenv = require('dotenv');
      const parsed = dotenv.parse(fs.readFileSync(localEnv));
      for (const [k, v] of Object.entries(parsed)) if (!process.env[k]) process.env[k] = v;
    }
  } catch {}

  const argv = yargs(hideBin(process.argv))
    .option('limit', { type: 'number', describe: 'Limit sellers processed' })
    .option('ids', { type: 'string', describe: 'Comma list of sellerIds to include' })
    .option('force', { type: 'boolean', default: false, describe: 'Force reprocess ignoring resume heuristics' })
    .option('dry-run', { type: 'boolean', default: false })
    .option('log-level', { type: 'string', describe: 'Logging level (debug|info|warn|error)' })
    .help().argv;

  const env = loadSellerEnv({ SELLER_CRAWLER_DRY_RUN: argv['dry-run'] || undefined, LOG_LEVEL: argv['log-level'] });
  log.setLogLevel(env.logLevel);
  log.info(`Start seller crawl dryRun=${env.dryRun} maxParallel=${env.maxParallel}`);

  // Initialize persistence (reuse item-crawler blobStore abstraction)
  let persistence = null;
  try {
    const { initPersistence } = require('../item-crawler/persistence/blobStore');
    persistence = await initPersistence({ persistMode: env.persistMode, blobsStore: env.blobsStore, blobsPrefix: env.blobsPrefix, outputDir: env.outputDir, log });
    try { if (typeof persistence.authMode === 'function') log.info(`[persist] mode=${persistence.mode} auth=${persistence.authMode()}`); else log.info(`[persist] mode=${persistence.mode}`); } catch { log.info(`[persist] mode=${persistence.mode}`); }
  } catch (e) {
    log.warn('[persist] init failed ' + e.message);
  }
  setSellerPersistence(persistence);

  // Load sellers
  let sellers = await loadSellersList(env);
  if (!sellers.length) {
    log.error('Missing sellers.json (blobs required or all fallbacks failed). Run indexer first or provide NETLIFY_* env for Blobs.');
    process.exit(1);
  }

  // Build worklist
  let work = sellers.map(s => ({ sellerId: s.id, sellerUrl: s.url, sellerName: s.name }));
  const includeListSources = [];
  if (argv.ids) includeListSources.push(String(argv.ids));
  if (process.env.SELLER_CRAWLER_INCLUDE_IDS) includeListSources.push(String(process.env.SELLER_CRAWLER_INCLUDE_IDS));
  if (includeListSources.length) {
    const includeIds = new Set(includeListSources
      .flatMap(chunk => String(chunk).split(',').map(s => s.trim()).filter(Boolean))
      .map(n => Number.parseInt(n, 10))
      .filter(Number.isFinite));
    if (includeIds.size) {
      work = work.filter(w => includeIds.has(w.sellerId));
    }
  }
  const limitEnv = Number.parseInt(process.env.SELLER_CRAWLER_LIMIT || '', 10);
  const effectiveLimit = (argv.limit && argv.limit > 0) ? argv.limit : (Number.isFinite(limitEnv) && limitEnv > 0 ? limitEnv : null);
  if (effectiveLimit) work = work.slice(0, effectiveLimit);
  if (!work.length) { log.warn('No sellers to process after filters. Exiting.'); return; }

  // Cookie jar reuse (best-effort). Always attempt to hydrate from Blobs so all instances share login.
  let jar = null;
  try {
    const cookiePersistPath = path.join(__dirname, '..', 'item-crawler', 'cookies.json');
    jar = await loadCookieJar(cookiePersistPath);
    try {
      const store = await getBlobsStore({ storeName: env.blobsStore });
      if (store) {
        const raw = await store.get('item-crawler/cookies/jar.json');
        if (raw) {
          const json = JSON.parse(raw);
          const tough = require('tough-cookie');
          await new Promise((res, rej) => tough.CookieJar.deserialize(json, (err, j) => err ? rej(err) : (jar = j, res())));
          log.info('[cookies] loaded jar from blobs');
        }
      }
    } catch (e) {
      log.debug('[cookies] blob load skip ' + (e?.message||String(e)));
    }
    try { const cookies = await listCookies(jar); if (cookies.length) log.info('[cookies] active ' + cookies.map(c => c.key).join(',')); } catch {}
  } catch (e) {
    log.debug('[cookies] init failed ' + e.message);
  }

  // HTTP client and auth
  let client = null;
  if (!env.dryRun) {
    client = await createHttpClient({ jar, timeout: Math.min(30000, 15000) });
    let reusedSession = false;
    try {
      // quick ping
      for (const host of ['https://littlebiggy.net','https://www.littlebiggy.net']) {
        try {
          const r = await client.get(host + '/core/api/auth/ping', { validateStatus: s => true, timeout: 7000 });
          if (r.status && r.status < 400) { reusedSession = true; break; }
          if (r.status === 401 || r.status === 403) break;
        } catch {}
      }
    } catch {}
    if (!reusedSession) {
      try {
        const auth = await login({ username: env.username, password: env.password, timeout: 45000, jar });
        client = auth.client;
        log.info('[auth] login success (seller crawler)');
      } catch (e) { log.error('Login failed: ' + e.message); process.exit(1); }
    }
  }

  // Concurrency
  let queueAdd, queueOnIdle; let serialTasks = [];
  try {
    const PQueue = (await import('p-queue')).default;
    const queueRef = new PQueue({ concurrency: env.maxParallel });
    queueAdd = fn => queueRef.add(fn);
    queueOnIdle = () => queueRef.onIdle();
  } catch (e) {
    log.warn('p-queue import failed: ' + e.message + ' (serial mode)');
    queueAdd = fn => serialTasks.push(fn);
    queueOnIdle = async () => { for (const t of serialTasks) await t(); };
  }

  const state = await loadStateAsync({ outputDir: env.outputDir, persistence });
  if (!state.sellers) state.sellers = {};
  const runMeta = { startedAt: new Date().toISOString(), sellersPlanned: work.length, sellersCompleted: 0, errors: 0, fullSellersProcessed: 0, summaryOnlySellersProcessed: 0, skippedUnchanged: 0, htmlEarlyAbort: 0, htmlTruncated: 0, totalSummariesFetched: 0, recentReviewCandidates: 0, recentMediaCandidates: 0, recentReviewsWritten: 0, recentMediaWritten: 0 };
  const shareLinks = {};
  const recentReviewCand = [];
  const recentMediaCand = [];
  const weeklyPositives = new Map(); // sellerId -> { sellerId, sellerName, positive: number, total: number, ratings: Map, lastCreated: number }
  const allRatings = new Map(); // sellerId -> { sellerId, sellerName, imageUrl, url, positive, negative, total, lastCreated }
  const leaderboardWindowDaysEnv = Number.parseInt(process.env.SELLER_CRAWLER_LEADERBOARD_WINDOW_DAYS || '', 10);
  const leaderboardWindowDays = Number.isFinite(leaderboardWindowDaysEnv) && leaderboardWindowDaysEnv > 0 ? leaderboardWindowDaysEnv : 10;
  const leaderboardWindowSeconds = leaderboardWindowDays * 24 * 60 * 60;
  const minNegativesEnv = Number.parseInt(process.env.SELLER_CRAWLER_LEADERBOARD_MIN_NEGATIVES || '', 10);
  const minBottomNegatives = Number.isFinite(minNegativesEnv) && minNegativesEnv > 0 ? minNegativesEnv : 2;

  const sellerNameById = new Map(work.map((s) => [s.sellerId, s.sellerName || null]));
  const processedSellers = new Set();
  const total = work.length;
  let completed = 0;
  async function loadPersistedSellerData(sellerId) {
    if (persistence && persistence.mode === 'blobs') {
      try { return await persistence.readJson(`sellers/${sellerId}.json`); } catch { return null; }
    }
    try {
      const file = path.join(env.outputDir, 'sellers', `${sellerId}.json`);
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch (e) {
      log.debug(`[recent] failed to read cached seller ${sellerId}: ${e.message}`);
    }
    return null;
  }
  for (let i = 0; i < work.length; i++) {
    const it = work[i];
    const pos = i + 1;
    queueAdd(async () => {
      const t0 = Date.now();
      try {
        const sellerId = it.sellerId;
        const tag = `[seller ${sellerId}]`;
        const rec = state.sellers[sellerId] || {};
  const decision = decideSellerCrawlKind({ seller: it, rec, env, force: argv.force });
        if (decision.kind === 'skip') { runMeta.skippedUnchanged++; log.info(`${tag} skip reason=${decision.reason}`); return; }
        log.info(`${tag} (${pos}/${total}) start kind=${decision.kind} reason=${decision.reason}`);

        let lastHtml = null;
        let sellerRef = rec.sellerRef || null;
        // Resolve sellerRef if needed
        if (!env.dryRun && (!sellerRef || decision.kind === 'full')) {
          const htmlRes = await fetchSellerPage({ client, url: it.sellerUrl, sellerId, maxBytes: env.htmlMaxBytes, earlyAbort: env.htmlEarlyAbort });
          if (htmlRes.abortedEarly) runMeta.htmlEarlyAbort++;
          if (htmlRes.truncated) runMeta.htmlTruncated++;
          lastHtml = htmlRes.html;
          const parsedRef = parseSellerRef(lastHtml);
          if (parsedRef) sellerRef = parsedRef;
        }

  let manifesto = null; let manifestoMeta = { length: 0, lines: 0 };
  let sellerImageUrl = null; let sellerOnline = null; let sellerJoined = null;
        if (!env.dryRun && (decision.kind === 'full')) {
          if (!lastHtml) {
            const htmlRes = await fetchSellerPage({ client, url: it.sellerUrl, sellerId, maxBytes: env.htmlMaxBytes, earlyAbort: env.htmlEarlyAbort });
            if (htmlRes.abortedEarly) runMeta.htmlEarlyAbort++;
            if (htmlRes.truncated) runMeta.htmlTruncated++;
            lastHtml = htmlRes.html;
          }
          const m = extractManifesto(lastHtml);
          manifesto = m.manifesto;
          manifestoMeta = m.manifestoMeta;
          try {
            sellerImageUrl = extractSellerImageUrl(lastHtml);
            const oj = extractOnlineAndJoined(lastHtml);
            sellerOnline = oj.online || null;
            sellerJoined = oj.joined || null;
          } catch {}
          if (!manifesto || /^\s*manifesto\s*$/i.test(String(manifesto))) {
            log.debug(`${tag} manifesto extraction produced label-only; writing debug HTML`);
            try {
              const fs = require('fs');
              const path = require('path');
              const dir = path.join(env.outputDir, 'debug', 'manifesto');
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, `${sellerId}.html`), lastHtml, 'utf8');
            } catch {}
          }
          if (!sellerImageUrl) {
            log.debug(`${tag} seller image missing; writing debug HTML`);
            try {
              const fs = require('fs');
              const path = require('path');
              const dir = path.join(env.outputDir, 'debug', 'image');
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, `${sellerId}.html`), lastHtml, 'utf8');
            } catch {}
          }
        }
        // Lightweight header-only extraction when on summary runs and joined/image are missing
        if (!env.dryRun && decision.kind !== 'full' && (!sellerJoined || !sellerImageUrl)) {
          try {
            if (!lastHtml) {
              const htmlRes = await fetchSellerPage({ client, url: it.sellerUrl, sellerId, maxBytes: env.htmlMaxBytes, earlyAbort: env.htmlEarlyAbort });
              if (htmlRes.abortedEarly) runMeta.htmlEarlyAbort++;
              if (htmlRes.truncated) runMeta.htmlTruncated++;
              lastHtml = htmlRes.html;
            }
            if (!sellerImageUrl) {
              try { sellerImageUrl = extractSellerImageUrl(lastHtml); } catch {}
            }
            if (!sellerOnline || !sellerJoined) {
              try {
                const oj = extractOnlineAndJoined(lastHtml);
                if (!sellerOnline) sellerOnline = oj.online || null;
                if (!sellerJoined) sellerJoined = oj.joined || null;
              } catch {}
            }
          } catch (e) {
            log.debug(`${tag} summary header extraction failed: ${e.message}`);
          }
        }

        // Reviews (paged recent)
        let reviews = []; let reviewsMeta = null; let sourceFetched = 0;
        if (!env.dryRun) {
          // Always use user/received endpoint to ensure item context is present
          {
            const pageSize = env.reviewFetchSize;
            const res = await fetchSellerReviewsPaged({ client, sellerId, pageSize, maxStore: env.reviewMaxStore, retries: env.reviewRetries });
            // Normalize and include item context for UI linking
            const { normalizeReviews } = require('../item-crawler/parse/normalizeReviews');
            reviews = normalizeReviews(res.reviews, { captureMedia: env.captureMedia !== false, includeItem: true, includeAuthor: false });
            if (!reviews.length || !reviews[0].item) {
              log.warn(`${tag} normalizeReviews missing item field; raw first review keys=${res.reviews[0]? Object.keys(res.reviews[0]).join(',') : 'n/a'}`);
              // Write a small debug sample to inspect payload if needed
              try {
                const dbgDir = path.join(env.outputDir, 'debug', 'reviews');
                if (!fs.existsSync(dbgDir)) fs.mkdirSync(dbgDir, { recursive: true });
                fs.writeFileSync(path.join(dbgDir, `${sellerId}_raw.json`), JSON.stringify(res.reviews.slice(0,3), null, 2), 'utf8');
              } catch {}
            }
            sourceFetched = res.sourceFetched;
            reviewsMeta = res.meta;
            runMeta.totalSummariesFetched += sourceFetched;
            if (Array.isArray(reviews)) {
              for (const review of reviews) {
                if (!review || typeof review !== 'object') continue;
                const enriched = {
                  sellerId,
                  sellerName: it.sellerName || null,
                  ...review,
                };
                if (review && review.item && review.item.refNum) {
                  const ref = review.item.refNum;
                  const sellerSegment = sellerRef ? `viewSubject/p/${sellerId}/c/` : '';
                  enriched.itemUrl = `https://littlebiggy.net/${sellerSegment}${ref}`;
                } else if (review && review.item && review.item.id != null) {
                  enriched.itemUrl = `https://littlebiggy.net/viewSubject/p/${sellerId}/c/${review.item.id}`;
                }
                const hasMedia = Array.isArray(review.segments) && review.segments.some(seg => seg && typeof seg === 'object' && ['image','video'].includes(seg.type));
                if (!hasMedia) {
                  recentReviewCand.push(enriched);
                  runMeta.recentReviewCandidates++;
                }
                if (hasMedia) {
                  recentMediaCand.push({ ...enriched, mediaCount: review.segments.filter(seg => seg && typeof seg === 'object' && ['image','video'].includes(seg.type)).length });
                  runMeta.recentMediaCandidates++;
                }

                // Aggregations
                try {
                  const created = Number.isFinite(review.created) ? review.created : null;
                  const isRecent = created ? ((Date.now()/1000) - created) <= leaderboardWindowSeconds : true; // if missing created, include by default for weekly
                  const rating = Number.isFinite(review.rating) ? Math.round(review.rating) : null;
                  if (rating != null) {
                    if (isRecent) {
                      const wrec = weeklyPositives.get(sellerId) || { sellerId, sellerName: it.sellerName || null, positive: 0, total: 0, ratings: new Map(), lastCreated: 0 };
                      wrec.total += 1;
                      wrec.ratings.set(rating, (wrec.ratings.get(rating) || 0) + 1);
                      if (rating === 10) wrec.positive += 1;
                      if (created && created > wrec.lastCreated) wrec.lastCreated = created;
                      weeklyPositives.set(sellerId, wrec);
                    }
                    const arec = allRatings.get(sellerId) || { sellerId, sellerName: it.sellerName || null, imageUrl: null, url: null, positive: 0, negative: 0, total: 0, lastCreated: 0 };
                    arec.total += 1;
                    if (rating === 10) arec.positive += 1;
                    if (rating <= 5) arec.negative += 1; // negative rating threshold
                    if (created && created > arec.lastCreated) arec.lastCreated = created;
                    allRatings.set(sellerId, arec);
                  }
                } catch {}
              }
            }
          }
          // Seller user summary (dispute stats)
          try {
            const us = await fetchSellerUserSummary({ client, sellerId });
            if (us && us.statistics) {
              if (!reviewsMeta) reviewsMeta = {};
              reviewsMeta.statistics = us.statistics;
              if (us.summary) reviewsMeta.summary = us.summary;
            }
          } catch (e) { log.debug(`${tag} seller user summary fetch failed: ${e.message}`); }
        }

        // Share link (full only) with cache reuse
        let share = { link: null, source: 'none' };
        if (!env.dryRun && env.fetchShare && decision.kind === 'full') {
          // Try cached link
          try {
            let cached = null;
            if (persistence && persistence.mode === 'blobs') {
              try { const m = await persistence.readJson('share-links.json'); if (m && m[sellerId] && m[sellerId].link) cached = m[sellerId].link; } catch {}
            } else {
              const file = path.join(env.outputDir, 'share-links.json');
              if (fs.existsSync(file)) { const m = JSON.parse(fs.readFileSync(file,'utf8')); if (m && m[sellerId] && m[sellerId].link) cached = m[sellerId].link; }
            }
            if (cached) share = { link: cached, source: 'cached' };
          } catch {}
          if (!share.link) {
            if (!lastHtml) {
              const htmlRes = await fetchSellerPage({ client, url: it.sellerUrl, sellerId, maxBytes: env.htmlMaxBytes, earlyAbort: env.htmlEarlyAbort });
              if (htmlRes.abortedEarly) runMeta.htmlEarlyAbort++;
              if (htmlRes.truncated) runMeta.htmlTruncated++;
              lastHtml = htmlRes.html;
            }
            share = await fetchSellerShareLink({ client, html: lastHtml, sellerRef, retry: true, redact: env.shareRedact });
          }
          if (share.link) shareLinks[sellerId] = { link: share.link, fetchedAt: new Date().toISOString() };
        }

        // Persist per-seller JSON
        const nowIso = new Date().toISOString();
        const existingData = await loadPersistedSellerData(sellerId) || {};
        if (!sellerRef && existingData.sellerRef) sellerRef = existingData.sellerRef;
        const sellerData = {
          sellerId,
          sellerRef: sellerRef || existingData.sellerRef || null,
          sellerName: it.sellerName || existingData.sellerName || null,
          sellerUrl: it.sellerUrl || existingData.sellerUrl || null,
          sellerImageUrl: sellerImageUrl != null ? sellerImageUrl : (existingData.sellerImageUrl ?? null),
          sellerOnline: sellerOnline != null ? sellerOnline : (existingData.sellerOnline ?? null),
          sellerJoined: sellerJoined != null ? sellerJoined : (existingData.sellerJoined ?? null),
          fetchedAt: nowIso,
          manifesto: manifesto != null ? manifesto : (existingData.manifesto ?? null),
          manifestoMeta: manifesto != null ? manifestoMeta : (existingData.manifestoMeta ?? manifestoMeta),
          share: share.link || existingData.share || null,
          reviews: (reviews && reviews.length) ? reviews : (existingData.reviews || []),
          reviewsMeta: reviewsMeta || existingData.reviewsMeta || null,
          crawlMeta: { kind: decision.kind, at: nowIso }
        };
        writePerSeller(env.outputDir, sellerData);
        // Incrementally upsert seller image into aggregate if present (covers targeted runs and new sellers)
        try {
          if (sellerData.sellerImageUrl) {
            await upsertSellerImages(env.outputDir, { [sellerId]: sellerData.sellerImageUrl });
          }
        } catch {}
        // Keep seller metadata for aggregates
        try {
          const meta = allRatings.get(sellerId) || { sellerId, sellerName: sellerData.sellerName || null, imageUrl: null, url: null, positive: 0, negative: 0, total: 0, lastCreated: 0 };
          if (!meta.imageUrl && sellerData.sellerImageUrl) meta.imageUrl = sellerData.sellerImageUrl;
          if (!meta.url && sellerData.sellerUrl) meta.url = sellerData.sellerUrl;
          if (!meta.sellerName && sellerData.sellerName) meta.sellerName = sellerData.sellerName;
          allRatings.set(sellerId, meta);
        } catch {}

        const srec = state.sellers[sellerId] || (state.sellers[sellerId] = { firstSeenAt: nowIso });
        if (sellerRef) { srec.sellerRef = sellerRef; }
        // Persist sellerJoined string into state for accurate recent computation and future runs
        try {
          if (sellerData && typeof sellerData.sellerJoined === 'string' && sellerData.sellerJoined.trim()) {
            srec.sellerJoined = sellerData.sellerJoined.trim();
          }
        } catch {}
        if (decision.kind === 'full') { srec.lastManifestoAt = nowIso; runMeta.fullSellersProcessed++; }
        if (reviews && reviews.length) { srec.lastSummaryAt = nowIso; runMeta.summaryOnlySellersProcessed += (decision.kind === 'summary') ? 1 : 0; }

        processedSellers.add(sellerId);
        runMeta.sellersCompleted++;
        completed++;
        const ms = Date.now() - t0;
        log.info(`${tag} done kind=${decision.kind} reviews=${reviews?.length||0}/${sourceFetched} ms=${ms}`);
      } catch (e) {
        runMeta.errors++;
        log.warn(`[seller ${it.sellerId}] failed: ${e.message}`);
      }
    });
  }

  await queueOnIdle();
  if (!env.dryRun) {
    // Skip aggregate writes for targeted scans (--ids) since they require full data
    const isTargetedScan = !!argv.ids;
    const nothingProcessed = processedSellers.size === 0;
    if (!isTargetedScan && !nothingProcessed) {
      try {
        // Process recent reviews and media aggregates
        const { trimmedReviews, trimmedMedia } = await processRecentAggregates({
          recentReviewCand,
          recentMediaCand,
          sellerNameById,
          processedSellers,
          loadPersistedSellerData,
          limits: {
            recentReviewsLimit: Number.isFinite(env.recentReviewsLimit) ? env.recentReviewsLimit : 50,
            recentMediaLimit: Number.isFinite(env.recentMediaLimit) ? env.recentMediaLimit : 20,
          },
        });
        
        writeRecentReviews(env.outputDir, trimmedReviews);
        writeRecentMedia(env.outputDir, trimmedMedia);
        runMeta.recentReviewsWritten = trimmedReviews.length;
        runMeta.recentMediaWritten = trimmedMedia.length;

        // Compute seller leaderboards
        const useWeek = (() => {
          const v = String(process.env.SELLER_CRAWLER_LEADERBOARD_WEEK_ONLY || '').toLowerCase();
          return v === '1' || v === 'true' || v === 'yes';
        })();
        
        const leaderboardLimitEnv = Number.parseInt(process.env.SELLER_CRAWLER_LEADERBOARD_LIMIT || '', 10);
        const leaderboardLimit = Number.isFinite(leaderboardLimitEnv) && leaderboardLimitEnv > 0 ? leaderboardLimitEnv : 10;
        
        const { top: topAll, bottom: bottomAll, metadata } = computeLeaderboard({
          weeklyPositives,
          allRatings,
          sellerNameById,
          config: {
            useWeek,
            leaderboardLimit,
            minBottomNegatives,
            priorPositive: 20,
            priorTotal: 40,
          },
        });
        const recent = computeRecentSellers({ state, allRatings, sellerNameById, limit: 10 });
        
        writeSellersLeaderboard(env.outputDir, {
          generatedAt: new Date().toISOString(),
          method: metadata,
          top: topAll,
          bottom: bottomAll,
          recent,
        });
      } catch (e) {
        log.warn(`[recent] aggregate writes failed: ${e.message}`);
      }
    } else if (isTargetedScan) {
      log.info('[aggregates] Skipping aggregate writes for targeted scan (--ids)');
    } else if (nothingProcessed) {
      log.info('[aggregates] Skipping aggregate writes: nothing processed this run');
    }
    try { await saveStateAsync({ outputDir: env.outputDir, state, persistence }); } catch {}
    try { writeShareLinks(env.outputDir, shareLinks); } catch {}
    // End-of-run full rebuild removed to avoid expensive scans. Use incremental upserts above,
    // and run scripts/seller-crawler/tools/rebuild-seller-images.js for occasional full refresh.
    try {
      const cookiePersistPath = path.join(__dirname, '..', 'item-crawler', 'cookies.json');
      await saveCookieJar(cookiePersistPath, jar);
      // Snapshot to shared cookie blob regardless of persistence mode
      try {
        const store = await getBlobsStore({ storeName: env.blobsStore });
        if (store) {
          const tough = require('tough-cookie');
          const serialized = await new Promise((res, rej) => jar.serialize((err, json)=> err?rej(err):res(json)));
          await store.set('item-crawler/cookies/jar.json', JSON.stringify(serialized), { contentType: 'application/json' });
          log.info('[cookies] blob snapshot updated (shared)');
        }
      } catch (e) { log.warn('[cookies] blob snapshot failed ' + (e?.message||String(e))); }
    } catch {}
    try { runMeta.finishedAt = new Date().toISOString(); runMeta.persistMode = persistence?.mode; writeRunMeta(env.outputDir, runMeta); } catch {}
  }
  log.info(`Completed sellers: ${completed}/${total} errors=${runMeta.errors}`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { main };


