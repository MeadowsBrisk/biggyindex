#!/usr/bin/env node
/*
  process-gifs.js
  - Discovers .gif image URLs from unified crawler outputs.
    Sources (in order):
      1) Netlify Blobs per‑market stores (default: GB,DE,FR,IT,PT)
         Keys: "indexed_items.json" in stores named "site-index-<market>" (e.g., site-index-gb)
      2) Filesystem fallback: public/indexed_items.json

    Recognized fields per item:
      - Legacy shape: imageUrl (string), imageUrls[] (array)
      - Unified shape (minified): i (string), is[] (array)

  - Outputs generated:
      Posters: /public/gif-cache/posters/<hash>.jpg|webp
      Videos : /public/gif-cache/videos/<hash>.mp4 (when --video and ffmpeg available)
      Map    : /public/gif-cache/gif-map.json (URL -> poster/video metadata)

  Flags:
    --video                  Generate mp4 for gifs (requires ffmpeg)
    --poster-only            Generate posters only (skip mp4)
    --include-image-urls     Include arrays (imageUrls / is) [default: true]
    --format=jpeg|webp       Poster format [default: jpeg]
    --limit=N                Cap number of URLs processed (0 = no limit)
    --concurrency=N          Parallelism [default: 4]
    --markets=GB,DE,...      Markets to scan from Blobs [default: GB,DE,FR,IT,PT]
    --force                  Rebuild even if poster/video exists
    --quiet | --debug        Reduce/increase log verbosity

  Environment:
    MARKETS                  Alternative to --markets (e.g., MARKETS=GB,DE)
    GB_STORE / DE_STORE ...  Override per‑market store names (defaults to site-index-<market>)
    NETLIFY_SITE_ID          Blobs site ID (optional in local dev)
    NETLIFY_BLOBS_TOKEN      Blobs auth token (or NETLIFY_API_TOKEN / NETLIFY_AUTH_TOKEN)

  Examples:
    node scripts/gif-processor/process-gifs.js --video
    node scripts/gif-processor/process-gifs.js --video --markets=GB,FR --debug
    MARKETS=DE,IT node scripts/gif-processor/process-gifs.js --format=webp
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Load env from .env for local blob access (align with unified crawler tooling)
try { require('dotenv').config(); } catch {}
const { config: C, flags } = require('./lib/args');
const { logger } = require('./lib/logger');
const { detectFfmpeg, transcodeMp4 } = require('./lib/ffmpeg');
const { headSize, download } = require('./lib/download');
const { buildPoster } = require('./lib/poster');
const L = logger(C.QUIET, C.DEBUG);

// Filesystem fallback removed: script now requires Netlify Blobs access only.
const CACHE_DIR = path.join(C.ROOT, 'public', 'gif-cache');
const MAP_FILE  = path.join(CACHE_DIR, 'gif-map.json');
const POSTER_DIR = path.join(CACHE_DIR, 'posters');
const VIDEO_DIR = path.join(CACHE_DIR, 'videos');

const gifRegex = /\.gif(?:$|[?#])/i;
const isGif = u => typeof u === 'string' && gifRegex.test(u);
const hashUrl = url => crypto.createHash('sha1').update(url).digest('hex').slice(0, C.HASH_LEN);
const ensureDir = d => { if (C.DRY_RUN) return; if (!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); };
function rel(p){
  const out = p.replace(C.ROOT+path.sep,'/').replace(/\\/g,'/').replace(/^\/+/,'/');
  return out.startsWith('/public/') ? out.slice('/public'.length) : out; // strip /public prefix
}
const loadMap = () => { try { return JSON.parse(fs.readFileSync(MAP_FILE,'utf8')); } catch { return {}; } };
const saveMap = (obj) => { if (C.DRY_RUN) return; fs.writeFileSync(MAP_FILE, JSON.stringify(obj,null,2)); };
function pLimit(n){ let active=0; const q=[]; const next=()=>{ if(!q.length||active>=n) return; active++; const {fn,res,rej}=q.shift(); Promise.resolve().then(fn).then(v=>{active--;res(v);next();}).catch(e=>{active--;rej(e);next();}); }; return fn=> new Promise((res,rej)=>{ q.push({fn,res,rej}); process.nextTick(next); }); }

function resolvePersistMode(){
  const raw = process.env.INDEXER_PERSIST || process.env.CRAWLER_PERSIST || process.env.PERSIST_MODE || 'blobs';
  const mode = String(raw).trim().toLowerCase();
  // Modes supported now: blobs (required) | auto (alias of blobs). FS removed.
  return mode === 'auto' ? 'blobs' : 'blobs';
}

function parseMarketsFlag() {
  const raw = flags.markets || flags.market || process.env.MARKETS || 'GB,DE,FR,IT,PT';
  return String(raw).split(/[,\s]+/).map(s=>s.trim().toUpperCase()).filter(Boolean);
}

function resolveMarketStoreName(code){
  // Allow explicit overrides via env (e.g., GB_STORE), else default to site-index-<lower>
  const envKey = `${code}_STORE`;
  if (process.env[envKey]) return process.env[envKey];
  const lower = code.toLowerCase();
  return `site-index-${lower}`;
}

function getBlobClient(storeName){
  const isNetlify = !!process.env.NETLIFY;
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
  const canUse = isNetlify || (siteID && token);
  if (!canUse) return null;
  let storePromise = null;
  const getStore = async () => {
    if (storePromise) return storePromise;
    storePromise = (async () => {
      const mod = await import('@netlify/blobs');
      const opts = { name: storeName };
      if (!isNetlify && siteID && token) Object.assign(opts, { siteID, token });
      // @ts-ignore
      return (mod).getStore(opts);
    })();
    return storePromise;
  };
  return {
    async getJSON(key){
      try { const store = await getStore(); /* @ts-ignore */ const str = await store.get(key); if(!str) return null; try { return JSON.parse(String(str)); } catch { return null; } } catch { return null; }
    }
  };
}

async function readMarketIndexFromBlob(storeName){
  const client = getBlobClient(storeName);
  if (!client) return null;
  const arr = await client.getJSON('indexed_items.json');
  return Array.isArray(arr) ? arr : null;
}

// Blobs-only mode: rely exclusively on Netlify Blobs per‑market stores (site-index-<market>). No HTTP/API fallback.

async function readItemsFromBlobs() {
  // Read per-market unified crawler outputs (blobs only).
  const markets = parseMarketsFlag();
  const all = [];
  for (const m of markets) {
    const name = resolveMarketStoreName(m);
    const idx = await readMarketIndexFromBlob(name);
    if (Array.isArray(idx)) {
      all.push({ market: m, items: idx, store: name });
    } else {
      L.warn(`[gif] blob read empty for market=${m} store=${name}`);
    }
  }
  if (all.length) return all;
  // Legacy single-store fallback (older indexer) via blobs only.
  const legacy = await readMarketIndexFromBlob('site-index');
  if (Array.isArray(legacy)) return [{ market: 'GB', items: legacy, store: 'site-index' }];
  return null;
}

async function processOne(url, ffmpegInfo){
  const h = hashUrl(url);
  const posterFile = path.join(POSTER_DIR, h + (C.POSTER_FORMAT==='webp'?'.webp':'.jpg'));
  const videoFile  = path.join(VIDEO_DIR, h + '.mp4');
  const legacyPoster = path.join(CACHE_DIR, h + (C.POSTER_FORMAT==='webp'?'.webp':'.jpg'));
  const legacyVideo  = path.join(CACHE_DIR, h + '.mp4');
  const needVideo = C.WANT_VIDEO && !C.POSTER_ONLY;

  // Migrate legacy flat files if present
  try {
    if (!fs.existsSync(posterFile) && fs.existsSync(legacyPoster)) { ensureDir(POSTER_DIR); if(!C.DRY_RUN) fs.renameSync(legacyPoster, posterFile); }
    if (!fs.existsSync(videoFile) && fs.existsSync(legacyVideo)) { ensureDir(VIDEO_DIR); if(!C.DRY_RUN) fs.renameSync(legacyVideo, videoFile); }
  } catch {}

  const posterExists = fs.existsSync(posterFile);
  const videoExists  = fs.existsSync(videoFile);
  if (!C.FORCE && posterExists && (!needVideo || videoExists)) {
    return { url, hash:h, status:'skipped', reason:'exists', poster: rel(posterFile), video: needVideo && videoExists ? rel(videoFile) : undefined };
  }

  const sizeHead = await headSize(url, C.TIMEOUT_MS);
  if (sizeHead && sizeHead > C.MAX_SIZE_MB * 1024 * 1024) {
    return { url, hash:h, status:'skipped', reason:'size-head', bytes:sizeHead };
  }

  const { buffer, error } = await download(url, C.MAX_SIZE_MB * 1024 * 1024, C.TIMEOUT_MS, C.RETRY);
  if (error) return { url, hash:h, status: error==='size-limit' ? 'skipped':'failed', reason:error };

  // Poster generation
  let meta; try { meta = await buildPoster(buffer, posterFile, C); } catch(e){ return { url, hash:h, status:'failed', reason:'poster:'+e.message }; }

  // Video transcode
  let videoOk=false, videoErr=null;
  if (needVideo) {
    const r = await transcodeMp4(buffer, videoFile, C, ffmpegInfo);
    videoOk = r.ok; videoErr = r.error || null;
  }

  return {
    url,
    hash: h,
    status: 'ok',
    poster: rel(posterFile),
    video: (needVideo && videoOk) ? rel(videoFile) : undefined,
    width: meta.width,
    height: meta.height,
    frames: meta.frames,
    reason: videoErr || undefined
  };
}

async function migrateExistingEntries(map){
  // Move old flat files referenced as /gif-cache/<hash>.jpg|.mp4 to new subdir structure
  for (const k of Object.keys(map)) {
    const e = map[k]; if (!e || typeof e !== 'object') continue;
    if (e.poster && /^\/gif-cache\/[a-f0-9]{6,}\.(jpg|webp)$/i.test(e.poster)) {
      const base = e.poster.split('/').pop();
      const newRel = '/gif-cache/posters/' + base;
      const absOld = path.join(C.ROOT, 'public', e.poster.replace(/^\//,''));
      const absNew = path.join(C.ROOT, 'public', newRel.replace(/^\//,''));
      try { if (fs.existsSync(absOld) && !fs.existsSync(absNew)) { ensureDir(path.dirname(absNew)); if(!C.DRY_RUN) fs.renameSync(absOld, absNew); } if (fs.existsSync(absNew)) e.poster = newRel; } catch {}
    }
    if (e.video && /^\/gif-cache\/[a-f0-9]{6,}\.mp4$/i.test(e.video)) {
      const base = e.video.split('/').pop();
      const newRel = '/gif-cache/videos/' + base;
      const absOld = path.join(C.ROOT, 'public', e.video.replace(/^\//,''));
      const absNew = path.join(C.ROOT, 'public', newRel.replace(/^\//,''));
      try { if (fs.existsSync(absOld) && !fs.existsSync(absNew)) { ensureDir(path.dirname(absNew)); if(!C.DRY_RUN) fs.renameSync(absOld, absNew); } if (fs.existsSync(absNew)) e.video = newRel; } catch {}
    }
    if (typeof e.poster === 'string' && e.poster.startsWith('/public/')) e.poster = e.poster.slice('/public'.length);
    if (typeof e.video === 'string' && e.video.startsWith('/public/')) e.video = e.video.slice('/public'.length);
  }
}

async function main(){
  if (C.VERIFY_ONLY) {
    const info = detectFfmpeg(C.FF_OVERRIDE, C.WANT_VIDEO, C.QUIET);
    L.log(`[gif] ffmpeg available=${info.available} cmd=${info.cmd} reason=${info.reason}`);
    return;
  }
  // Aggregate items from multiple markets (dedup URLs later)
  let marketItemSets = null;
  let items = [];
  const fromBlob = await readItemsFromBlobs();
  if (fromBlob && fromBlob.length) {
    marketItemSets = fromBlob;
    items = fromBlob.flatMap(x => x.items);
  }
  if (!Array.isArray(items) || items.length === 0) {
    console.error('[gif][fatal] No items loaded from Netlify Blobs.');
    console.error('  Required env (outside Netlify): NETLIFY_SITE_ID + NETLIFY_API_TOKEN (or NETLIFY_BLOBS_TOKEN).');
    console.error('  Example: set NETLIFY_SITE_ID=xxxxx and NETLIFY_API_TOKEN=xxxxx then re-run.');
    console.error('  (FS fallback removed; script intentionally fails without blob access.)');
    process.exit(2);
  }

  const urls = new Set();
  const addUrl = (u) => { if (isGif(u)) urls.add(u); };
  for (const it of items) {
    // Legacy fields
    if (it && typeof it === 'object') {
      if (isGif(it?.imageUrl)) addUrl(it.imageUrl);
      if (C.INCLUDE_IMAGE_URLS && Array.isArray(it?.imageUrls)) for (const u of it.imageUrls) addUrl(u);
      // Unified index (minified): primary image 'i', small list 'is'
      if (isGif(it?.i)) addUrl(it.i);
      if (C.INCLUDE_IMAGE_URLS && Array.isArray(it?.is)) for (const u of it.is) addUrl(u);
    }
  }
  // Market/source summary
  if (marketItemSets) {
    let totalCandidates = 0;
    for (const m of marketItemSets) {
      const mUrls = new Set();
      for (const it of m.items) {
        if (isGif(it?.imageUrl)) mUrls.add(it.imageUrl);
        if (Array.isArray(it?.imageUrls)) for (const u of it.imageUrls) if (isGif(u)) mUrls.add(u);
        if (isGif(it?.i)) mUrls.add(it.i);
        if (Array.isArray(it?.is)) for (const u of it.is) if (isGif(u)) mUrls.add(u);
      }
      totalCandidates += mUrls.size;
      L.log(`[gif] source=blobs market=${m.market} store=${m.store} items=${Array.isArray(m.items)?m.items.length:0} gifCandidates=${mUrls.size}`);
      if (C.DEBUG && mUrls.size && !m.items.some(r=>r && (r.imageUrl||r.i))) {
        L.debug('market had gif candidates but items lack image fields structure');
      }
    }
    L.log(`[gif] aggregated markets=${marketItemSets.length} totalCandidates=${totalCandidates}`);
  }
  let list = Array.from(urls);
  if (C.LIMIT > 0) list = list.slice(0, C.LIMIT);
  L.log(`[gif] discovered=${list.length} force=${C.FORCE} posterFormat=${C.POSTER_FORMAT} source=blobs`);
  if (!list.length) return;

  ensureDir(CACHE_DIR); ensureDir(POSTER_DIR); if (C.WANT_VIDEO && !C.POSTER_ONLY) ensureDir(VIDEO_DIR);
  const existing = loadMap();
  await migrateExistingEntries(existing);

  const ffmpegInfo = detectFfmpeg(C.FF_OVERRIDE, C.WANT_VIDEO && !C.POSTER_ONLY, C.QUIET);
  L.log(`[gif] ffmpeg=${ffmpegInfo.available?'yes':'no'}(${ffmpegInfo.reason}) mp4=${C.WANT_VIDEO && !C.POSTER_ONLY}`);

  const limit = pLimit(C.CONCURRENCY);
  let skipped=0, failed=0;
  const tasks = list.map(u => limit(()=> processOne(u, ffmpegInfo).then(r => {
    if (!C.QUIET) {
      if (r.status==='ok') console.log(`[gif][proc] ${r.hash} poster${r.poster?'✔':'✖'} video${r.video?'✔':'✖'}${r.reason?` reason=${r.reason}`:''}`);
      else console.log(`[gif][${r.status}] ${r.reason||''} ${r.hash}`);
    }
    if (r.status==='skipped') skipped++; else if (r.status==='failed') failed++;
    return r;
  })));
  const results = await Promise.all(tasks);

  for (const r of results) {
    existing[r.url] = {
      hash: r.hash,
      poster: r.poster,
      video: r.video,
      width: r.width,
      height: r.height,
      frames: r.frames,
      status: r.status,
      reason: r.reason
    };
  }
  saveMap(existing);
  L.log(`[gif] done total=${results.length} skipped=${skipped} failed=${failed} mapEntries=${Object.keys(existing).length}`);
}

if (require.main === module) {
  main().catch(e=>{ console.error('[gif] fatal', e); process.exit(1); });
}
