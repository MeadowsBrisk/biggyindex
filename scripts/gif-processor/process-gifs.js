#!/usr/bin/env node
/*
  process-gifs.js
  - Scans public/indexed_items.json for .gif URLs (imageUrl plus imageUrls[] when enabled)
  - Generates poster + optional mp4 into structured dirs:
        /public/gif-cache/posters/<hash>.jpg|webp
        /public/gif-cache/videos/<hash>.mp4
  - Maintains /public/gif-cache/gif-map.json
  flags: --video
  run with: node scripts/gif-processor/process-gifs.js --video
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Load NETLIFY_* from .env for local blob access (mirrors indexer)
try { require('../indexer/lib/env/loadEnv').loadIndexerEnv(); } catch {}
const { config: C } = require('./lib/args');
const { logger } = require('./lib/logger');
const { detectFfmpeg, transcodeMp4 } = require('./lib/ffmpeg');
const { headSize, download } = require('./lib/download');
const { buildPoster } = require('./lib/poster');
const L = logger(C.QUIET, C.DEBUG);

const DATA_FILE = path.join(C.ROOT, 'public', 'indexed_items.json');
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
  const raw = process.env.INDEXER_PERSIST || process.env.CRAWLER_PERSIST || process.env.PERSIST_MODE || 'auto';
  return String(raw).trim().toLowerCase();
}

async function readItemsFromBlobs() {
  try {
    const mod = await import('@netlify/blobs').catch(()=>null);
    if (!mod) return null;
    const { getStore } = mod;
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
    let store = null;
    if (siteID && token) {
      try { store = getStore({ name: 'site-index', siteID, token, consistency: 'strong' }); } catch {}
    }
    if (!store) {
      try { store = getStore({ name: 'site-index', consistency: 'strong' }); } catch {}
    }
    if (!store) return null;
    const val = await store.get('indexed_items.json');
    if (!val) return null;
    try { return JSON.parse(val); } catch { return null; }
  } catch { return null; }
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
  let items = [];
  const persistMode = resolvePersistMode();
  const preferBlobs = persistMode === 'blobs';
  if (preferBlobs) {
    const fromBlob = await readItemsFromBlobs();
    if (Array.isArray(fromBlob) && fromBlob.length >= 0) {
      items = fromBlob;
    } else if (fs.existsSync(DATA_FILE)) {
      try { items = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); } catch {}
    }
  } else {
    if (fs.existsSync(DATA_FILE)) {
      try { items = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); } catch {}
    } else {
      // Optional: blob fallback in auto mode
      const fromBlob = await readItemsFromBlobs();
      if (Array.isArray(fromBlob)) items = fromBlob;
    }
  }
  if (!Array.isArray(items)) { console.error('indexed_items.json missing or invalid (blobs/fs)'); process.exit(1); }

  const urls = new Set();
  for (const it of items) {
    if (isGif(it?.imageUrl)) urls.add(it.imageUrl);
    if (C.INCLUDE_IMAGE_URLS && Array.isArray(it?.imageUrls)) for (const u of it.imageUrls) if (isGif(u)) urls.add(u);
  }
  let list = Array.from(urls);
  if (C.LIMIT > 0) list = list.slice(0, C.LIMIT);
  L.log(`[gif] discovered=${list.length} force=${C.FORCE} posterFormat=${C.POSTER_FORMAT} source=${preferBlobs?'blobs':'fs'}`);
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
