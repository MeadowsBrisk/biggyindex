#!/usr/bin/env node
/**
 * Backfill sellerJoined into state from per-seller JSONs and recompute the `recent` list.
 *
 * Usage:
 *   node scripts/seller-crawler/tools/backfill-joined-and-recent.js [--limit N]
 *
 * Respects seller crawler env for persistence (blobs or fs). Writes:
 *   - seller-crawler/crawler-state.json (updated with sellerJoined entries)
 *   - sellers-leaderboard.json (with refreshed recent list)
 */
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const log = require('../../item-crawler/util/logger');
const { loadSellerEnv } = require('../env/loadSellerEnv');
const { loadStateAsync, saveStateAsync } = require('../../item-crawler/persistence/stateStore');
const { setPersistence: setSellerPersistence, writeSellersLeaderboard } = require('../persistence/sellerOutputs');

async function getPersistence(env){
  try {
    const { initPersistence } = require('../../item-crawler/persistence/blobStore');
    return await initPersistence({ persistMode: env.persistMode, blobsStore: env.blobsStore, blobsPrefix: env.blobsPrefix, outputDir: env.outputDir, log });
  } catch (e) {
    log.warn('[persist] init failed ' + e.message);
    return null;
  }
}

async function readPerSeller(persistence, outputDir, sellerId){
  if (persistence && persistence.mode === 'blobs') {
    try { return await persistence.readJson(`sellers/${sellerId}.json`); } catch { return null; }
  }
  try {
    const file = path.join(outputDir, 'sellers', `${sellerId}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file,'utf8'));
  } catch {}
  return null;
}

function computeRecentFromState({ state, allRatings, sellerNameById, limit = 10 }){
  const monthIndex = (m) => {
    const map = { jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11 };
    const key = String(m || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
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
  const entries = [];
  for (const [idStr, rec] of Object.entries(state?.sellers || {})) {
    const sellerId = Number.parseInt(idStr, 10);
    if (!Number.isFinite(sellerId)) continue;
    const firstIso = rec?.firstSeenAt || null;
    const firstTs = firstIso ? Date.parse(firstIso) : NaN;
    const { iso: joinedIso, ts: joinedTs } = parseJoined(rec?.sellerJoined || rec?.joinedAt || null);
    const primaryIso = joinedIso || firstIso;
    const primaryTs = Number.isFinite(joinedTs) ? joinedTs : firstTs;
    if (!Number.isFinite(primaryTs)) continue;
    const meta = allRatings.get(sellerId) || { sellerId, sellerName: sellerNameById.get(sellerId) || null, imageUrl: null, url: null, positive: 0, negative: 0, total: 0, lastCreated: null };
    entries.push({
      sellerId,
      sellerName: meta.sellerName || sellerNameById.get(sellerId) || null,
      imageUrl: meta.imageUrl || null,
      url: meta.url || null,
      positive: Number.isFinite(meta.positive) ? meta.positive : 0,
      negative: Number.isFinite(meta.negative) ? meta.negative : 0,
      total: Number.isFinite(meta.total) ? meta.total : 0,
      score: 0,
      lastReviewAt: meta.lastCreated || null,
      firstSeenAt: firstIso,
      joinedAt: joinedIso || (typeof rec?.sellerJoined === 'string' ? rec.sellerJoined : null),
      firstSeenTs: firstTs,
      joinedTs,
      primaryTs,
    });
  }
  entries.sort((a,b)=> (b.primaryTs - a.primaryTs) || (((b.lastReviewAt||0) - (a.lastReviewAt||0))));
  return entries.slice(0, limit).map(({ firstSeenTs, joinedTs, primaryTs, ...rest }) => rest);
}

async function main(){
  // Load env
  try { require('dotenv').config(); } catch {}
  const argv = yargs(hideBin(process.argv)).option('limit', { type: 'number' }).help().argv;
  const env = loadSellerEnv({ LOG_LEVEL: process.env.LOG_LEVEL || 'info' });
  log.setLogLevel(env.logLevel);

  // Persistence
  const persistence = await getPersistence(env);
  setSellerPersistence(persistence);

  // Load sellers index (public) for names/urls
  let sellersIdx = [];
  try {
    const idxPath = path.join(__dirname, '..', '..', '..', 'public', 'sellers.json');
    if (fs.existsSync(idxPath)) sellersIdx = JSON.parse(fs.readFileSync(idxPath,'utf8'));
  } catch {}
  const sellerNameById = new Map(sellersIdx.map(s => [s.id, s.name || null]));

  // Load state
  const state = await loadStateAsync({ outputDir: env.outputDir, persistence }) || { sellers: {} };

  // Walk per-seller JSONs to backfill sellerJoined
  let updated = 0; let scanned = 0; let withJoined = 0;
  const perSellerIds = new Set();
  // From blobs listing if available
  let idsHint = [];
  try {
    if (persistence && persistence.mode === 'blobs' && typeof persistence.listKeys === 'function') {
      const keys = await persistence.listKeys('sellers/');
      idsHint = keys.filter(k=>/^sellers\/\d+\.json$/.test(k)).map(k=>Number.parseInt(k.split('/')[1],10)).filter(Number.isFinite);
    }
  } catch {}
  if (!idsHint.length) {
    try {
      const dir = path.join(env.outputDir, 'sellers');
      if (fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir)) {
          const m = name.match(/^(\d+)\.json$/);
          if (m) idsHint.push(Number.parseInt(m[1],10));
        }
      }
    } catch {}
  }
  for (const id of idsHint) perSellerIds.add(id);
  // Also include from sellers index
  for (const s of sellersIdx) perSellerIds.add(s.id);

  const allRatings = new Map();
  for (const sellerId of perSellerIds) {
    scanned++;
    const data = await readPerSeller(persistence, env.outputDir, sellerId);
    if (!data) continue;
    const srec = state.sellers[sellerId] || (state.sellers[sellerId] = { firstSeenAt: data.fetchedAt || new Date().toISOString() });
    if (typeof data.sellerJoined === 'string' && data.sellerJoined.trim()) {
      srec.sellerJoined = data.sellerJoined.trim();
      updated++;
      withJoined++;
    }
    // Build ratings meta for recent payload (best-effort)
    const name = data.sellerName || sellerNameById.get(sellerId) || null;
    const url = data.sellerUrl || null;
    const imageUrl = data.sellerImageUrl || null;
    let positive = 0, total = 0, negative = 0, lastCreated = 0;
    try {
      const reviews = Array.isArray(data.reviews) ? data.reviews : [];
      for (const r of reviews) {
        const rating = Number.isFinite(r.rating) ? Math.round(r.rating) : null;
        const created = Number.isFinite(r.created) ? r.created : null;
        if (rating != null) {
          total += 1; if (rating === 10) positive += 1; if (rating <= 5) negative += 1;
        }
        if (created && created > lastCreated) lastCreated = created;
      }
    } catch {}
    allRatings.set(sellerId, { sellerId, sellerName: name, url, imageUrl, positive, negative, total, lastCreated });
  }

  // Save updated state
  await saveStateAsync({ outputDir: env.outputDir, state, persistence });

  // Recompute recent list and write leaderboard with merged recent
  const recentLimitEnv = Number.parseInt(process.env.SELLER_CRAWLER_LEADERBOARD_LIMIT || '', 10);
  const limit = Number.isFinite(recentLimitEnv) && recentLimitEnv > 0 ? recentLimitEnv : (argv.limit && argv.limit > 0 ? argv.limit : 10);
  const recent = computeRecentFromState({ state, allRatings, sellerNameById, limit });

  // Load existing leaderboard, merge recent
  let existing = null;
  try {
    if (persistence && persistence.mode === 'blobs') {
      existing = await persistence.readJson('sellers-leaderboard.json');
    } else {
      const file = path.join(env.outputDir, 'sellers-leaderboard.json');
      if (fs.existsSync(file)) existing = JSON.parse(fs.readFileSync(file,'utf8'));
    }
  } catch {}
  const payload = {
    generatedAt: new Date().toISOString(),
    method: existing?.method || {},
    top: existing?.top || [],
    bottom: existing?.bottom || [],
    recent,
  };
  writeSellersLeaderboard(env.outputDir, payload);

  log.info(`[backfill] scanned=${scanned} updated=${updated} recent=${recent.length}`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
