#!/usr/bin/env node
/* Item crawler (fixed clean version; deprecated fallback & legacy env fields removed) */

const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { loadCrawlerEnv } = require('./env/loadCrawlerEnv');
const log = require('./util/logger');
const { login } = require('./auth/login');
const { fetchReviewsPage } = require('./fetch/fetchReviewsPage');
const { normalizeReviews } = require('./parse/normalizeReviews');
const { fetchShareLink } = require('./fetch/fetchShareLink');
const { fetchItemPage } = require('./fetch/fetchItemPage');
const { extractShippingHtml } = require('./parse/shippingHtmlExtractor');
const { extractLocationTokens } = require('./parse/extractLocationTokens');
const { setLocationFilter } = require('./fetch/setLocationFilter');
const { extractDescription } = require('./parse/descriptionExtractor'); // NEW
const { loadAggregated, updateAggregated, saveAggregated } = require('./persistence/aggregatedExport'); // AGGREGATED EXPORT
const { loadCookieJar, saveCookieJar, listCookies } = require('./persistence/cookieStore');
const { writePerItem, writeRunMeta, writeShareLinks, writeShippingDebug, writeLfHtml } = require('./persistence/outputs');
const { setPersistence } = require('./persistence/outputs');
const { initPersistence } = require('./persistence/blobStore');
const { loadState, saveState, loadStateAsync, saveStateAsync } = require('./persistence/stateStore');
const { delay, jitter } = require('./util/delay');
const { decideCrawlKindDetailed } = require('./util/decideCrawlKind');

async function main() {
  const startedAtMs = Date.now();
  const maxRunMs = Number.parseInt(process.env.CRAWLER_MAX_RUNTIME_MS || '900000', 15); // default 15 minutes
  const argv = yargs(hideBin(process.argv))
    .option('limit',{ type:'number', describe:'Limit items processed' })
    .option('offset',{ type:'number', describe:'Skip first N items (for range processing)' })
    .option('ids',{ type:'string', describe:'Comma list of refNums to include' })
    .option('force',{ type:'boolean', default:false, describe:'Force reprocess ignoring resume heuristics' })
    .option('refresh-share',{ type:'boolean', default:false, describe:'Force regenerate share link (ignore cached aggregated share)' })
    .option('dry-run',{ type:'boolean', default:false })
    .option('log-level',{ type:'string', describe:'Logging level (debug|info|warn|error)' })
    .help().argv;

  const forceFlag = (() => {
    if (argv.force) return true;
    const v = (process.env.CRAWLER_FORCE || '').toString().toLowerCase().trim();
    return ['1','true','yes','y','on'].includes(v);
  })();

  // Load .env if present
  try { require('dotenv').config(); } catch {}
  if (!process.env.LB_LOGIN_USERNAME || !process.env.LB_LOGIN_PASSWORD) {
    const localEnvPath = path.join(__dirname,'.env');
    if (fs.existsSync(localEnvPath)) {
      try { const dotenv = require('dotenv'); const parsed = dotenv.parse(fs.readFileSync(localEnvPath)); for (const [k,v] of Object.entries(parsed)) if (!process.env[k]) process.env[k]=v; } catch {}
    }
  }

  const env = loadCrawlerEnv({ CRAWLER_DRY_RUN: argv['dry-run'] || undefined, LOG_LEVEL: argv['log-level'] });
  const refreshShare = (argv['refresh-share'] === true) || (/^(1|true|yes|on)$/i.test(String(process.env.CRAWLER_REFRESH_SHARE||'').trim()));
  log.setLogLevel(env.logLevel);
  log.info(`Start crawl dryRun=${env.dryRun} maxParallel=${env.maxParallel} reviewRetries=${env.reviewRetries}`);

  // Load indexed items
  // Resolve indexed_items.json: prefer Blobs (freshest). Try explicit-first auth, then implicit.
  // Fallbacks: filesystem (repo bundle) then public HTTP URL, unless strict mode is enabled.
  const indexedPath = path.join(__dirname, '..', '..', 'public', 'indexed_items.json');
  let allItems = null;
  const requireBlobsIndexed = (() => {
    const v = String(process.env.CRAWLER_REQUIRE_BLOBS_INDEXED || '').trim().toLowerCase();
    return ['1','true','yes','on','strict'].includes(v);
  })();
  // 1) Blobs (Store API, consistent with indexer)
  try {
    const { getStore } = await import('@netlify/blobs');
    const storeName = (process.env.CRAWLER_BLOBS_STORE || 'site-index');
    let store = null;
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
    if (siteID && token) {
      try { store = getStore({ name: storeName, siteID, token, consistency: 'strong' }); }
      catch (e1) { log.warn('[index] getStore explicit failed: '+e1.message); }
    }
    if (!store) {
      try { store = getStore({ name: storeName, consistency: 'strong' }); }
      catch (e2) { log.warn('[index] getStore implicit failed: '+e2.message); }
    }
    if (store) {
      const raw = await store.get('indexed_items.json');
      if (raw) {
        allItems = JSON.parse(raw);
        log.info(`[index] loaded from blobs (${siteID && token ? 'explicit' : 'implicit'})`);
      }
    }
  } catch (e) { log.debug('[index] blob store fetch failed '+(e?.message||String(e))); }
  // 2) Filesystem (if bundled)
  if (!allItems) {
    if (requireBlobsIndexed) {
      log.error('[index] strict mode requires Blobs indexed_items.json, but none was loaded');
    } else if (fs.existsSync(indexedPath)) {
      try { allItems = JSON.parse(fs.readFileSync(indexedPath,'utf8')); log.warn('[index] loaded from filesystem fallback (stale risk)'); } catch(e){ log.warn('Failed to parse filesystem indexed_items.json: '+e.message); }
    }
  }
  // 3) Public HTTP (published site root)
  if (!allItems && !requireBlobsIndexed && env.publicBase) {
    try {
      const fetch = (await import('node-fetch')).default;
      const url = `${env.publicBase.replace(/\/$/,'')}/indexed_items.json`;
      const r = await fetch(url, { timeout: 6000 });
      if (r.ok) { allItems = await r.json(); log.warn('[index] loaded from public HTTP fallback (stale risk) '+url); }
    } catch {}
  }
  if (!allItems) { log.error('Missing indexed_items.json (blobs required or all fallbacks failed). Run indexer first or provide NETLIFY_* env for Blobs.'); process.exit(1); }
  let work = allItems.filter(it => it && (it.refNum||it.id) && it.url);

  // Control state (kill switch via Netlify Blobs)
  let stopRequested = false;
  let controlStore = null;
  async function initControlStore(){
    try {
      const { getStore } = await import('@netlify/blobs');
      const storeName = (process.env.CRAWLER_BLOBS_STORE || 'site-index');
      try { controlStore = getStore({ name: storeName, consistency: 'strong' }); }
      catch {}
      if (!controlStore) {
        const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
        const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
        if (siteID && token) {
          try { controlStore = getStore({ name: storeName, siteID, token, consistency: 'strong' }); } catch {}
        }
      }
    } catch {}
  }
  async function readControl(){
    if (!controlStore) return null;
    try {
      const raw = await controlStore.get('control/crawler.json');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  function timeExceeded(){ return (Date.now() - startedAtMs) > maxRunMs; }
  async function evaluateStop(reasonHint){
    if (stopRequested) return true;
    if (timeExceeded()) { stopRequested = true; log.warn('[control] max runtime exceeded; requesting stop'); return true; }
    const ctl = await readControl();
    if (ctl && ctl.stop) {
      if (ctl.until && Date.parse(ctl.until) && Date.now() > Date.parse(ctl.until)) {
        // expired stop flag
      } else {
        stopRequested = true;
        log.warn(`[control] stop requested${ctl.reason?(' reason='+ctl.reason):''}${reasonHint?(' at='+reasonHint):''}`);
        return true;
      }
    }
    return false;
  }

  await initControlStore();
  // initial stop check before doing heavy work
  await evaluateStop('startup');
  if (stopRequested) { log.warn('[control] exiting early due to stop flag'); return; }

  if (env.includeIds) work = work.filter(it => env.includeIds.includes(String(it.refNum||it.id)));
  if (argv.ids) { const filterIds = String(argv.ids).split(',').map(s=>s.trim()).filter(Boolean); work = work.filter(it => filterIds.includes(String(it.refNum||it.id))); }
  const limitEnv = Number.parseInt(process.env.CRAWLER_LIMIT||'', 10);
  const effectiveOffset = (argv.offset && argv.offset>0) ? argv.offset : 0;
  const effectiveLimit = (argv.limit && argv.limit>0) ? argv.limit : (Number.isFinite(limitEnv) && limitEnv>0 ? limitEnv : null);
  if (effectiveOffset > 0) {
    work = work.slice(effectiveOffset);
    log.info(`[range] Skipping first ${effectiveOffset} items (offset applied)`);
  }
  if (effectiveLimit) work = work.slice(0, effectiveLimit);
  if (!work.length) { log.warn('No items to process after filters. Exiting.'); return; }

  const outputDir = env.outputDir;
  // Initialize persistence layer early (needed for cookie blob reuse)
  const persistence = await initPersistence({ persistMode: env.persistMode, blobsStore: env.blobsStore, blobsPrefix: env.blobsPrefix, outputDir: env.outputDir, log });
  setPersistence(persistence);
  try { if (typeof persistence.authMode === 'function') log.info(`[persist] mode=${persistence.mode} auth=${persistence.authMode()}`); else log.info(`[persist] mode=${persistence.mode}`); } catch { log.info(`[persist] mode=${persistence.mode}`); }

  const state = await loadStateAsync({ outputDir, persistence });
  const shareLinks = {};

  // Optional migration: backfill missing per-item JSON from the statically published site.
  // Disabled by default; enable with CRAWLER_MIGRATE_EAGER=true
  if (env.migrateEager && persistence && persistence.mode === 'blobs' && env.publicBase) {
    try {
      const base = env.publicBase.replace(/\/$/,'');
      const toCheck = work.slice(0, Math.min(work.length, env.migrateSeedLimit || 500));
      const fetch = (await import('node-fetch')).default;
      for (const it of toCheck) {
        const ref = it.refNum || it.id;
        try {
          const existing = await persistence.readItem(ref);
          if (existing) continue;
          const url = `${base}/item-crawler/items/${ref}.json`;
          const res = await fetch(url, { timeout: 5000 });
          if (res.ok) {
            const json = await res.json();
            await persistence.writeItem(json);
            if (env.logLevel === 'debug') log.debug(`[migrate] seeded item ${ref} from public`);
          }
        } catch {}
      }
    } catch {}
  }

  // Cookie jar & session reuse (after persistence init)
  // Priority: Blobs (fresh session) > Filesystem fallback (local dev only)
  let jar = null;
  if (persistence && persistence.mode === 'blobs') {
    try {
      const blobCookies = await persistence.readJson('cookies/jar.json');
      if (blobCookies) {
        const tough = require('tough-cookie');
        await new Promise((res, rej) => tough.CookieJar.deserialize(blobCookies, (err, j) => err?rej(err):(jar=j,res())));
        if (env.logCookies) log.info('[cookies] loaded jar from blobs');
      }
    } catch(e){ log.debug('[cookies] blob load failed: '+e.message); }
  }
  // Filesystem fallback only if blobs failed or unavailable (local dev)
  if (!jar) {
    const cookiePersistPath = path.join(__dirname,'cookies.json');
    jar = await loadCookieJar(cookiePersistPath);
    if (jar && env.logCookies) log.info('[cookies] loaded jar from filesystem (fallback)');
  }
  // Create empty jar if still none
  if (!jar) {
    const tough = require('tough-cookie');
    jar = new tough.CookieJar();
    log.info('[cookies] created new empty jar');
  }
  let preCookies = [];
  try { preCookies = await listCookies(jar); } catch {}
  if (preCookies.length) {
    log.info(`[cookies] loaded jar count=${preCookies.length} keys=${preCookies.map(c=>c.key).join(',')}`);
  } else {
    log.info('[cookies] no persisted jar (fresh session)');
  }

  // Attempt lightweight reuse check with multi-endpoint + host fallback to avoid false negatives (404 on unknown ping path)
  let client = null; let reusedSession = false; let performedLogin = false;
  if (!env.dryRun) {
    const hasJwt = preCookies.some(c=>c.key === 'JWT_USER');
    if (hasJwt) {
      // Determine preferred host from JWT cookie domain (if host-only cookie was set on www, reuse that)
      let jwtDomain = null; try { const jwt = preCookies.find(c=>c.key==='JWT_USER'); jwtDomain = jwt ? jwt.domain : null; } catch {}
      const baseHosts = [];
      if (jwtDomain) {
        const clean = jwtDomain.replace(/^\./,'');
        // If domain already contains www. test it first, else test both variants
        if (/^www\./i.test(clean)) baseHosts.push('https://'+clean, 'https://'+clean.replace(/^www\./i,''));
        else baseHosts.push('https://'+clean, 'https://www.'+clean);
      } else {
        baseHosts.push('https://littlebiggy.net','https://www.littlebiggy.net');
      }
      const reuseEndpoints = ['/core/api/auth/ping','/core/api/auth/profile','/core/api/auth/me'];
      const { createHttpClient } = require('./fetch/httpClient');
      client = await createHttpClient({ jar, timeout: Math.min(env.loginTimeoutMs, 15000) });
      for (const host of baseHosts) {
        for (const ep of reuseEndpoints) {
          try {
            const t0 = Date.now();
            const res = await client.get(host + ep, { validateStatus: s=>true, timeout: 7000 });
            const st = res.status || 0;
            if (st === 401 || st === 403) {
              log.info(`[auth] reuse check auth-fail status=${st} host=${host} ep=${ep}`);
              throw new Error('auth-invalid');
            }
            if (st && st < 400) {
              reusedSession = true;
              log.info(`[auth] reuse existing session status=${st} host=${host} ep=${ep} ms=${Date.now()-t0}`);
              break;
            }
            if (st === 404) {
              // Endpoint missing; continue trying others
              log.debug(`[auth] reuse endpoint 404 host=${host} ep=${ep}`);
              continue;
            }
          } catch (e) {
            if (e.message === 'auth-invalid') { client = null; break; }
            log.debug(`[auth] reuse attempt host=${host} ep=${ep} err=${e.message}`);
          }
        }
        if (reusedSession || !client) break;
      }
      // As a last fallback, if still not reused and client exists, fetch root HTML and treat 200 as reuse
      if (!reusedSession && client) {
        try {
          const rootHost = baseHosts[0];
            const t0 = Date.now();
            const res = await client.get(rootHost+'/', { validateStatus: s=>true, timeout: 6000 });
            if (res.status && res.status < 400) {
              reusedSession = true;
              log.info(`[auth] reuse existing session (root check) status=${res.status} host=${rootHost} ms=${Date.now()-t0}`);
            } else if (res.status === 401 || res.status === 403) {
              client = null; // force login
              log.info(`[auth] root check indicates auth invalid status=${res.status}`);
            }
        } catch (e) {
          log.debug('[auth] root reuse check failed '+e.message);
        }
      }
      if (!reusedSession && client) {
        // Could not positively validate session but no explicit auth-fail; proceed to login for safety
        client = null;
        log.info('[auth] reuse not confirmed; proceeding to login');
      }
    } else {
      log.info('[auth] no JWT_USER cookie; login required');
    }
    if (!client) {
      try {
        const auth = await login({ username: env.username, password: env.password, timeout: env.loginTimeoutMs, jar });
        client = auth.client; jar = auth.jar; performedLogin = true;
        log.info('[auth] login success (new session)');
      } catch (e) { log.error('Login failed: '+e.message); process.exit(1); }
    }
    if (env.logCookies) { const cookies = await listCookies(jar); log.info('[cookies] active: '+cookies.map(c=>c.key+'='+c.value.slice(0,12)).join('; ')); }
  } else {
    log.info('Dry run: skipping login');
  }

  // Concurrency (p-queue optional)
  let queueAdd, queueOnIdle; let serialTasks=[]; let queueRef = null;
  try { const PQueue = (await import('p-queue')).default; queueRef = new PQueue({ concurrency: env.maxParallel }); queueAdd=fn=>queueRef.add(fn); queueOnIdle=()=>queueRef.onIdle(); }
  catch(e){ log.warn('p-queue import failed: '+e.message+' (serial mode)'); queueAdd=fn=>serialTasks.push(fn); queueOnIdle=async()=>{ for (const t of serialTasks) await t(); }; }

  const runMeta = { startedAt:new Date().toISOString(), itemsPlanned: work.length, itemsCompleted:0, errors:0, failedItems:[], totalReviewsFetched:0, totalReviewsStored:0, reviewsCappedItems:0, aggregatedShareAdded:0, aggregatedShippingUpdated:0,
    // differential recrawl counters
    fullItemsProcessed:0, reviewOnlyItemsProcessed:0, skippedUnchanged:0, reviewsRefreshErrors:0,
    // html fetch telemetry
    htmlEarlyAbort:0, htmlTruncated:0 };

  function buildItemLogSegments(summary, dur){
    const segs = [];
    segs.push(`Kind: ${summary.kind}, reason: ${summary.reason}`);
    segs.push(`Reviews: ${summary.reviewsStored}/${summary.reviewsSource}${summary.reviewsCapped?' capped':''}`);
    if (summary.shippingOpts!=null) {
      let shipRange = '';
      if (summary.shippingRange) {
        const { min, max } = summary.shippingRange;
        shipRange = '('+min+(min!==max?'-'+max:'')+')';
      }
      segs.push(`Ship: ${summary.shippingOpts}${shipRange}`);
    }
    segs.push(`Share: ${summary.share}`);
    if (summary.descLen!=null) segs.push(`Desc: ${summary.descLen}`);
    if (summary.htmlEarlyAbort || summary.htmlTruncated) {
      const flags=[]; if (summary.htmlEarlyAbort) flags.push('earlyAbort'); if (summary.htmlTruncated) flags.push('truncated');
      segs.push(`HTML: ${flags.join('+')}`);
    }
    segs.push(`Time: ${dur}ms ${(dur/1000).toFixed(2)}s`);
    return segs.map(s=>`[${s}]`).join(' ');
  }

  // (persistence already initialized above)

  // Load aggregated export map if enabled (still uses fs path; future: read via persistence if blobs)
  let aggregatedCtx = null;
  if (env.aggregatedExport) {
    aggregatedCtx = loadAggregated(path.join(process.cwd(),'public'));
  }

  function shouldSkipLegacy(item){ if (argv.force) return false; if (!env.resume) return false; const rec = state.items[item.refNum||item.id]; if (!rec) return false; const last = rec.lastRun? Date.parse(rec.lastRun):0; return Date.now()-last < 6*3600*1000; }

  function decideKindWrapper(item){
    const refNum = item.refNum || item.id;
    if (forceFlag) return { kind:'full', reason:'force' };
    return decideCrawlKindDetailed({ item, rec: state.items[refNum], env });
  }

  async function fetchFirstPageWithRetry(refNum){
    const pageSize = env.reviewFetchSize; // single-page strategy only
    let lastErr=null; for (let attempt=1; attempt<=env.reviewRetries; attempt++){
      try { const t0=Date.now(); const page=await fetchReviewsPage({ client, refNum, offset:0, pageSize }); log.debug(`[reviews] ref=${refNum} attempt=${attempt} ok reviews=${page.reviews.length} ms=${Date.now()-t0}`); return page; }
      catch(e){ lastErr=e; const status=e?.response?.status; log.warn(`[reviews] ref=${refNum} attempt=${attempt} failed status=${status||e.code||'ERR'} msg=${e.message}`); if (attempt<env.reviewRetries) await delay(700*attempt); }
    }
    throw lastErr||new Error('review fetch failed');
  }

  let locationFilterApplied = false; // only once

  // Precompute decisions so skipped items don't affect total count / positions
  const preDecisions = work.map(it => ({ item: it, decision: decideKindWrapper(it) }));
  const processItems = [];
  for (const pd of preDecisions) {
    if (pd.decision.kind === 'skip') {
      runMeta.skippedUnchanged++;
      const refNum = pd.item.refNum || pd.item.id;
      // Only emit skip log if debug level active
      if (env.logLevel === 'debug') log.debug(`[item ref=${refNum} id=${pd.item.id}] skip reason=${pd.decision.reason}`);
    } else {
      processItems.push(pd);
    }
  }
  const total = processItems.length;
  let index = 0; // position counter assigned deterministically per queued item
  for (let i=0;i<processItems.length;i++) {
    if (!stopRequested) {
      try { await evaluateStop('pre-enqueue'); } catch {}
    }
    if (stopRequested) { log.warn('[control] stop before enqueue; halting new tasks'); break; }
    const { item: it, decision } = processItems[i];
    const plannedPos = i+1;
    queueAdd(async () => {
      if (stopRequested || timeExceeded()) { return; }
      const refNum = it.refNum || it.id;
      const tag = `[item ref=${refNum} id=${it.id}]`;
      let kind = decision.kind;
      const position = plannedPos; // stable position
      const startedAtMs = Date.now();
      const summary = { ref: refNum, pos: position, total, kind, reason: decision.reason, reviewsStored:0, reviewsSource:0, reviewsCapped:false, share:'none', shippingOpts:null, shippingRange:null, descLen:null, htmlEarlyAbort:false, htmlTruncated:false };
      log.debug(tag+` (${position}/${total}) start kind=${kind} reason=${decision.reason}`);
      try {
        // If item JSON already exists in blobs, avoid full crawl; switch to reviews-only merge unless explicitly forced full
        let existingItemData = null;
  if (persistence && persistence.mode === 'blobs' && kind === 'full' && env.mode !== 'full' && decision.reason === 'new') {
          try {
            const exist = await persistence.readItem(refNum);
            if (exist) {
              existingItemData = exist;
              kind = 'reviews';
              summary.kind = 'reviews';
              summary.reason = 'existingBlob';
            }
          } catch {}
        }
        // If still planned full and we have a public JSON, prefer reviews-only and lazy-migrate to blobs
  if (kind === 'full' && env.mode !== 'full' && env.publicBase && decision.reason === 'new') {
          try {
            const fetch = (await import('node-fetch')).default;
            const url = `${env.publicBase.replace(/\/$/,'')}/item-crawler/items/${refNum}.json`;
            const res = await fetch(url, { timeout: 4000 });
            if (res.ok) {
              try { existingItemData = await res.json(); } catch {}
              kind = 'reviews';
              summary.kind = 'reviews';
              summary.reason = 'existingPublic';
              // write to blobs in the background best-effort
              try { if (persistence && persistence.mode==='blobs' && existingItemData) await persistence.writeItem(existingItemData); } catch {}
            }
          } catch {}
        }
        // Reviews path (shared for full & reviews-only)
        let normalized=[]; let sourceCount=0; let capped=false; const pageSizeRequested=env.reviewFetchSize;
        if (kind === 'reviews') {
          // Load existing per-item JSON to merge non-review fields
          // Priority: Blobs (persistence) -> Filesystem (local dev) -> Public HTTP (optional)
          try {
            if (!existingItemData && persistence && persistence.mode === 'blobs') {
              try {
                const blobItem = await persistence.readItem(refNum);
                if (blobItem) existingItemData = blobItem;
              } catch (e) { log.debug(tag+' blob read existing failed: '+e.message); }
            }
            if (!existingItemData) {
              const file = path.join(outputDir,'items', refNum + '.json');
              if (fs.existsSync(file)) existingItemData = JSON.parse(fs.readFileSync(file,'utf8'));
            }
            if (!existingItemData && env.publicBase) {
              try {
                const fetch = (await import('node-fetch')).default;
                const url = `${env.publicBase.replace(/\/$/,'')}/item-crawler/items/${refNum}.json`;
                const res = await fetch(url, { timeout: 5000 });
                if (res.ok) {
                  existingItemData = await res.json();
                  // Opportunistically seed blobs so future reads are faster
                  try { if (persistence && persistence.mode === 'blobs') await persistence.writeItem(existingItemData); } catch {}
                }
              } catch {}
            }
          } catch(e){ log.warn(tag+' load existing item failed: '+e.message); }
        }
        if (!env.dryRun) {
          try {
            const firstPage = await fetchFirstPageWithRetry(refNum);
            sourceCount = firstPage.reviews.length;
            normalized = normalizeReviews(firstPage.reviews, { captureMedia: env.captureMedia });
            const maxStore = env.reviewMaxStore;
            if (normalized.length > maxStore) { normalized = normalized.slice(0, maxStore); capped = true; }
          } catch (revErr) {
            runMeta.reviewsRefreshErrors++; throw revErr;
          }
        }
        runMeta.totalReviewsFetched += sourceCount;
        runMeta.totalReviewsStored += normalized.length;
        if (capped) runMeta.reviewsCappedItems++;

  if (kind === 'reviews') {
          const merged = existingItemData || { refNum, itemId: it.id, name: it.name };
          merged.reviews = normalized;
          merged.reviewsMeta = { fetched: normalized.length, sourceFetched: sourceCount, capped, pageSizeRequested, mode: 'single-page' };
          merged.aggregate = { count: normalized.length };
          merged.crawlMeta = { kind:'reviews', at: new Date().toISOString() };
          if (!env.dryRun) writePerItem(outputDir, merged);
          const rec = state.items[refNum] || (state.items[refNum]={ firstSeenAt: new Date().toISOString() });
          rec.lastReviewSnapshotAt = new Date().toISOString();
          rec.lastReviewId = normalized[0]?.id || null;
          rec.reviewCount = normalized.length;
          if (it.lastUpdatedAt) rec.lastIndexedUpdatedAt = it.lastUpdatedAt;
          runMeta.itemsCompleted++; runMeta.reviewOnlyItemsProcessed++;
          summary.reviewsStored = normalized.length; summary.reviewsSource = sourceCount; summary.reviewsCapped = capped; summary.share = env.fetchShare? 'reviews-skip':'disabled';
          const dur = Date.now()-startedAtMs;
          log.info(`[item ${refNum}] (${summary.pos}/${summary.total}) ${buildItemLogSegments(summary, dur)}`);
          await delay(jitter(env.minDelayMs, env.jitterMs));
          if (!stopRequested) { try { await evaluateStop('post-item'); } catch {} }
          if (stopRequested && queueRef && queueRef.clear) {
            try { queueRef.clear(); } catch {}
          }
          return;
  }

        // Shipping (HTML only, fallback removed). Before full crawl, attempt lazy migration of existing item JSON from public if present in Netlify.
        if (persistence && persistence.mode === 'blobs' && env.publicBase) {
          try {
            const existingBlob = await persistence.readItem(refNum);
            if (!existingBlob) {
              const fetch = (await import('node-fetch')).default;
              const res = await fetch(`${env.publicBase.replace(/\/$/,'')}/item-crawler/items/${refNum}.json`, { timeout: 5000 });
              if (res.ok) {
                const json = await res.json();
                await persistence.writeItem(json);
                if (env.logLevel === 'debug') log.debug(`[migrate] seeded item ${refNum} from public (lazy)`);
              }
            }
          } catch {}
        }
        let shipping=null;
        let lastItemHtml = null; // capture to reuse for share link & description (prefer latest)
        let firstItemHtml = null; // capture earliest HTML before any location filter (fallback for share detection)
        if ((env.shipping || true) && !env.dryRun) { // always attempt at least one HTML fetch to enable description extraction
          try {
            let htmlRes = await fetchItemPage({ client, url: it.url, refNum, maxBytes: env.itemHtmlMaxBytes, earlyAbort: env.itemHtmlEarlyAbort });
            if (htmlRes.abortedEarly) { runMeta.htmlEarlyAbort++; summary.htmlEarlyAbort = true; }
            if (htmlRes.truncated) { runMeta.htmlTruncated++; summary.htmlTruncated = true; }
            lastItemHtml = htmlRes.html;
            firstItemHtml = htmlRes.html;
            if (env.shipping) {
              if (env.captureLfHtml) {
                try { const ck = await listCookies(jar); if (ck.some(c=>c.key.toLowerCase()==='lf')) writeLfHtml(outputDir, refNum, 'preLoc', htmlRes.html); } catch {}
              }
              let parsed = extractShippingHtml(htmlRes.html);
              let shippingError = null;
              if (!locationFilterApplied && !parsed.options.length) {
                const tokens = extractLocationTokens(htmlRes.html);
                const locRes = await setLocationFilter({ client, shipsTo: env.shipsTo, tokens });
                if (locRes.ok) {
                  locationFilterApplied = true;
                  log.info('[loc] applied shipsTo='+env.shipsTo+' retrying shipping parse');
                  await delay(500+Math.random()*300);
                  htmlRes = await fetchItemPage({ client, url: it.url, refNum, earlyAbort: env.itemHtmlEarlyAbort });
                  if (htmlRes.abortedEarly) { runMeta.htmlEarlyAbort++; summary.htmlEarlyAbort = true; }
                  if (htmlRes.truncated) { runMeta.htmlTruncated++; summary.htmlTruncated = true; }
                  lastItemHtml = htmlRes.html;
                  if (env.captureLfHtml) {
                    try { const ck2 = await listCookies(jar); if (ck2.some(c=>c.key.toLowerCase()==='lf')) writeLfHtml(outputDir, refNum, 'postLoc', htmlRes.html); } catch {}
                  }
                  parsed = extractShippingHtml(htmlRes.html);
                } else {
                  log.warn('[loc] setLocationFilter failed status='+(locRes.status||'n/a'));
                }
              }
              if (locationFilterApplied && !parsed.options.length) shippingError = 'not_visible';
              const opts = parsed.options || [];
              let priceMin = null, priceMax = null;
              for (const o of opts) {
                if (typeof o.cost === 'number') {
                  if (priceMin == null || o.cost < priceMin) priceMin = o.cost;
                  if (priceMax == null || o.cost > priceMax) priceMax = o.cost;
                }
              }
              shipping = { options: opts, extractedAt: new Date().toISOString() };
              if (priceMin != null) shipping.shippingPriceRange = { min: priceMin, max: priceMax };
              if (shippingError) shipping.error = shippingError;
              if (env.saveShippingHtml) { try { writeShippingDebug(outputDir, refNum, htmlRes.html, parsed); } catch {} }
              if (env.logLevel==='debug' && parsed.warnings && parsed.warnings.length) log.debug(tag+' shipping warnings: '+parsed.warnings.join(','));
            }
          } catch (se) {
            log.warn(tag+' item HTML fetch / shipping extraction failed: '+se.message);
            if (env.shipping) shipping = { options:[], extractedAt:new Date().toISOString(), error:'shipping_error' };
          }
        }

        // Description extraction (static)
        let descriptionFull = null; let descriptionMeta = null;
        if (!env.dryRun && lastItemHtml) {
          try {
            const descRes = extractDescription(lastItemHtml);
            if (descRes && descRes.description) {
              descriptionFull = descRes.description;
              descriptionMeta = descRes.meta;
            }
          } catch (de) {
            log.debug(tag+' description extract failed: '+de.message);
          }
        }

        // Share (only if not already captured in aggregated export)
        let share = { link:null, source:'none' };
        if (env.fetchShare && !env.dryRun) {
          let existingShare = null;
          try { if (!refreshShare && aggregatedCtx && aggregatedCtx.data && aggregatedCtx.data.items[refNum] && aggregatedCtx.data.items[refNum].share) existingShare = aggregatedCtx.data.items[refNum].share; } catch {}
          if (existingShare && !refreshShare) {
            share = { link: existingShare, source:'cached' };
            summary.share = 'reused';
            log.debug(`[share] ref=${refNum} reuse cached`);
            // Show the actual short link and code in console when reusing cached share
            try {
              if (existingShare) {
                const code = (existingShare.match(/\/link\/([A-Za-z0-9-_]+)/) || [null,null])[1] || existingShare;
                log.info(`[share] ref=${refNum} shortLink=${existingShare} shortCode=${code} source=cached`);
              }
            } catch {}
          } else {
            try {
              // Provide both pre- and post-location-filter HTML (concatenated) to maximize inline detection chances
              const combinedHtml = [lastItemHtml, firstItemHtml].filter(Boolean).join('\n');
              share = await fetchShareLink({ client, jar, refNum, html: combinedHtml || lastItemHtml, outputDir, retry:true, redact: env.shareRedact });
              summary.share = share.link ? (share.source==='http-retry'?'generated(retry)':'generated') : 'none';
              const shareCode = share && share.link ? ((share.link.match(/\/link\/([A-Za-z0-9-_]+)/) || [null,null])[1] || share.link) : null;
              log.debug(`[share] ref=${refNum} attempt source=${share.source} link=${!!share.link} code=${shareCode||'none'}`);
              // Show the actual short link and code in console when a new link is generated
              try { if (share && share.link) log.info(`[share] ref=${refNum} shortLink=${share.link} shortCode=${shareCode} source=${share.source}`); } catch {}
            } catch(e){ summary.share='error'; log.warn(`[share] ref=${refNum} failed: ${e.message}`); }
          }
        } else if (!env.dryRun) {
          summary.share = 'disabled';
          log.debug(`[share] ref=${refNum} skipped (feature disabled)`);
        }
        if (share.link) shareLinks[refNum] = { link: share.link, source: share.source, fetchedAt:new Date().toISOString() };

  const itemData = {
          refNum,
          itemId: it.id,
          name: it.name,
          fetchedAt: new Date().toISOString(),
          strategy: 'api',
          reviews: normalized,
          reviewsMeta: { fetched: normalized.length, sourceFetched: sourceCount, capped, pageSizeRequested, mode: 'single-page' },
          aggregate: { count: normalized.length },
          share: { shortLink: share.link || null },
          shipping
        };
        if (descriptionFull) {
          itemData.descriptionFull = descriptionFull;
          itemData.descriptionMeta = descriptionMeta;
        }
  itemData.crawlMeta = { kind:'full', at: new Date().toISOString() };
  if (!env.dryRun) writePerItem(outputDir, itemData);
  const rec = state.items[refNum] || (state.items[refNum]={ firstSeenAt: new Date().toISOString() });
  const nowIso = new Date().toISOString();
  rec.lastRun = nowIso; // legacy
  rec.lastFullCrawlAt = nowIso;
  rec.lastReviewSnapshotAt = nowIso;
  rec.lastReviewId = normalized[0]?.id || null;
  rec.reviewCount = normalized.length;
  if (it.lastUpdatedAt) rec.lastIndexedUpdatedAt = it.lastUpdatedAt;
  runMeta.itemsCompleted++; runMeta.fullItemsProcessed++;
  summary.reviewsStored = normalized.length; summary.reviewsSource = sourceCount; summary.reviewsCapped = capped;
  if (shipping) { summary.shippingOpts = (shipping.options||[]).length; if (shipping.shippingPriceRange) summary.shippingRange = shipping.shippingPriceRange; }
  if (descriptionFull) summary.descLen = descriptionFull.length;
  if (summary.share === 'none' && share && share.link) summary.share='generated';
  if (summary.share === 'none' && !env.fetchShare) summary.share='disabled';
  const dur = Date.now()-startedAtMs;
  const shipPart = summary.shippingOpts!=null ? ` ship=${summary.shippingOpts}${summary.shippingRange?`(${summary.shippingRange.min}-${summary.shippingRange.max})`:''}`:'';
  const descPart = summary.descLen!=null?` desc=${summary.descLen}`:'';
  let htmlPart = '';
  if (summary.htmlEarlyAbort || summary.htmlTruncated) {
    const flags = [];
    if (summary.htmlEarlyAbort) flags.push('earlyAbort');
    if (summary.htmlTruncated) flags.push('truncated');
    htmlPart = ` html=${flags.join('+')}`;
  }
  const revPart = ` reviews=${summary.reviewsStored}/${summary.reviewsSource}${summary.reviewsCapped?' capped':''}`;
  log.info(`[item ${refNum}] (${summary.pos}/${summary.total}) ${buildItemLogSegments(summary, dur)}`);
        if (aggregatedCtx) {
          try {
            const nowIso = new Date().toISOString();
            const shippingRange = shipping && shipping.shippingPriceRange ? shipping.shippingPriceRange : null;
            const resAgg = updateAggregated(aggregatedCtx, { refNum, shareLink: share.link, shippingRange, nowIso });
            if (resAgg) {
              if (resAgg.shareAdded) runMeta.aggregatedShareAdded++;
              if (resAgg.shippingUpdated) runMeta.aggregatedShippingUpdated++;
            }
          } catch (ae) { log.debug(tag+' aggregated update failed: '+ae.message); }
        }
        await delay(jitter(env.minDelayMs, env.jitterMs));
        if (!stopRequested) { try { await evaluateStop('post-item'); } catch {} }
        if (stopRequested && queueRef && queueRef.clear) {
          try { queueRef.clear(); } catch {}
        }
      } catch (e) {
        runMeta.errors++; runMeta.failedItems.push({ id: it.id, ref: refNum, error: e.message });
        log.warn(tag+' failed: '+e.message);
      }
    });
  }

  await queueOnIdle();
  if (!env.dryRun) {
    // Delegate to merge-safe writer
    try { writeShareLinks(outputDir, shareLinks); } catch (e) { log.warn('[share-links] write failed '+e.message); }
    await saveStateAsync({ outputDir, state, persistence });
    // Save cookies: prioritize blobs, filesystem only as fallback
    if (persistence && persistence.mode === 'blobs') {
      try {
        const tough = require('tough-cookie');
        const serialized = await new Promise((res, rej) => jar.serialize((err, json)=> err?rej(err):res(json)));
        await persistence.writeJson('cookies/jar.json', serialized);
        if (env.logCookies) log.info('[cookies] saved to blobs');
      } catch(e){ log.warn('[cookies] blob save failed: '+e.message); }
    } else {
      // Filesystem fallback for local dev
      const cookiePersistPath = path.join(__dirname,'cookies.json');
      const saved = await saveCookieJar(cookiePersistPath, jar);
      if (env.logCookies) log.info('[cookies] saved to filesystem (fallback) saved='+saved);
    }
  }
  runMeta.finishedAt = new Date().toISOString();
  runMeta.persistMode = persistence.mode;
  runMeta.durationMs = Date.now() - Date.parse(runMeta.startedAt);
  if (env.logLevel==='debug') log.debug('[run-meta] '+JSON.stringify(runMeta));
  if (!env.dryRun) writeRunMeta(outputDir, runMeta);
  log.info(`Completed: processed=${runMeta.itemsCompleted} full=${runMeta.fullItemsProcessed} reviewsOnly=${runMeta.reviewOnlyItemsProcessed} skipped=${runMeta.skippedUnchanged} errors=${runMeta.errors} fetchedReviews=${runMeta.totalReviewsFetched} storedReviews=${runMeta.totalReviewsStored} cappedItems=${runMeta.reviewsCappedItems}`);
  if (runMeta.failedItems.length && env.logLevel!=='debug') log.warn('Failed items: '+runMeta.failedItems.map(f=>f.ref).join(','));
  if (aggregatedCtx) {
    try {
      const wrote = await saveAggregated(aggregatedCtx);
      if (wrote) log.info('[aggregated] updated index-supplement');
    } catch (e) { log.warn('[aggregated] save failed: '+e.message); }
  }
}

if (require.main === module) {
  main().catch(e=>{ console.error(e); process.exit(1); });
}

// Export for programmatic (Netlify function) usage
module.exports = { main };
