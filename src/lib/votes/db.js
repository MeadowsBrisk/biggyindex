// Neon / Netlify DB helper for vote storage
// Tables:
//  votes_counters(item_id text primary key, count integer not null default 0, updated_at timestamptz not null default now())
//  votes_markers(item_id text not null, user_hash text not null, bucket integer not null, created_at timestamptz not null default now(),
//                primary key(item_id, user_hash, bucket))
// Index suggestions (optional for scale):
//  create index on votes_markers (user_hash, bucket);

import { neon } from '@netlify/neon';

let _sql = null;
let _initPromise = null;
let _lastDbError = null;
const HAS_DB = !!process.env.NETLIFY_DATABASE_URL;
if (process.env.VOTE_DEBUG === '1') {
  console.log('[vote-debug][db] HAS_DB=', HAS_DB, 'NETLIFY_DATABASE_URL present?', !!process.env.NETLIFY_DATABASE_URL);
}

// In-memory fallback (local dev without Netlify DB)
const mem = {
  counters: new Map(),
  markers: new Set(),
};

const COUNTERS_TABLE = 'votes_counters';
const MARKERS_TABLE = 'votes_markers';
const MAX_PER_WINDOW = Number(process.env.VOTE_MAX_PER_WINDOW == null ? 1 : process.env.VOTE_MAX_PER_WINDOW); // default 1 per window if not set

export function sql() {
  if (!HAS_DB) return null;
  if (!_sql) {
    if (process.env.VOTE_DEBUG === '1') console.log('[vote-debug][db] initializing neon client');
    _sql = neon();
  }
  return _sql;
}

export async function ensureSchema() {
  if (!HAS_DB) {
    if (process.env.VOTE_DEBUG === '1') console.log('[vote-debug][db] ensureSchema skipped (memory mode)');
    return;
  }
  if (_initPromise) return _initPromise;
  const q = sql();
  _initPromise = (async () => {
    if (process.env.VOTE_DEBUG === '1') console.log('[vote-debug][db] creating tables if not exist');
    await q`CREATE TABLE IF NOT EXISTS votes_counters ( item_id text PRIMARY KEY, count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now() )`;
    await q`CREATE TABLE IF NOT EXISTS votes_markers ( item_id text NOT NULL, user_hash text NOT NULL, bucket integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(item_id, user_hash, bucket) )`;
  })().catch(e => {
    _lastDbError = e;
    if (process.env.VOTE_DEBUG === '1') console.error('[vote-debug][db] ensureSchema error', e);
    throw e;
  });
  return _initPromise;
}

export async function getCounts(itemIds = []) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return {};
  if (!HAS_DB) {
    const out = {};
    for (const id of itemIds) out[id] = mem.counters.get(id)?.count || 0;
    return out;
  }
  const q = sql();
  // Parameterize as array; neon supports passing arrays directly
  const rows = await q`SELECT item_id, count FROM votes_counters WHERE item_id = ANY(${itemIds})`;
  const out = {};
  for (const r of rows) out[r.item_id] = Number(r.count) || 0;
  return out;
}

export async function getCount(itemId) {
  if (!HAS_DB) return mem.counters.get(itemId)?.count || 0;
  const q = sql();
  const rows = await q`SELECT count FROM votes_counters WHERE item_id = ${itemId}`;
  return rows.length ? Number(rows[0].count) || 0 : 0;
}

// Attempt to create marker + increment counter atomically.
// Returns { count, alreadyVoted }
export async function castVote(itemId, userHash, bucket) {
  if (!HAS_DB) {
    if (process.env.VOTE_DEBUG === '1') console.log('[vote-debug][db] castVote memory mode', { itemId, bucket });
    let userCountThisBucket = 0;
    let alreadyLifetime = false;
    for (const mk of mem.markers) {
      const parts = mk.split('|');
      if (parts.length === 3) {
        if (parts[0] === itemId && parts[1] === userHash) alreadyLifetime = true;
        if (parts[1] === userHash && parts[2] === String(bucket)) userCountThisBucket++;
      }
    }
    if (alreadyLifetime) {
      return { count: await getCount(itemId), alreadyVoted: true, limitReached: false, usedCount: userCountThisBucket };
    }
    if (MAX_PER_WINDOW > 0 && userCountThisBucket >= MAX_PER_WINDOW) {
      return { count: await getCount(itemId), alreadyVoted: false, limitReached: true, usedCount: userCountThisBucket };
    }
    const key = `${itemId}|${userHash}|${bucket}`;
    mem.markers.add(key);
    const rec = mem.counters.get(itemId) || { count: 0 };
    rec.count += 1;
    mem.counters.set(itemId, rec);
    return { count: rec.count, alreadyVoted: false, limitReached: false, usedCount: userCountThisBucket + 1 };
  }
  const q = sql();
  try {
    // Check lifetime first and count current bucket usage
    const bucketCountRows = await q`SELECT COUNT(*)::int AS c FROM votes_markers WHERE user_hash = ${userHash} AND bucket = ${bucket}`;
    const userCountThisBucket = bucketCountRows.length ? Number(bucketCountRows[0].c) || 0 : 0;
    const existsRows = await q`SELECT 1 FROM votes_markers WHERE item_id = ${itemId} AND user_hash = ${userHash} LIMIT 1`;
    if (existsRows.length) {
      if (process.env.VOTE_DEBUG === '1') console.log('[vote-debug][db] already endorsed (lifetime)', { itemId });
      return { count: await getCount(itemId), alreadyVoted: true, limitReached: false, usedCount: userCountThisBucket };
    }
    if (MAX_PER_WINDOW > 0 && userCountThisBucket >= MAX_PER_WINDOW) {
      if (process.env.VOTE_DEBUG === '1') console.log('[vote-debug][db] limit reached', { userHash, bucket, userCountThisBucket, MAX_PER_WINDOW });
      return { count: await getCount(itemId), alreadyVoted: false, limitReached: true, usedCount: userCountThisBucket };
    }
    if (process.env.VOTE_DEBUG === '1') console.log('[vote-debug][db] inserting permanent marker', { itemId, bucket });
    const markerRows = await q`INSERT INTO votes_markers (item_id, user_hash, bucket) VALUES (${itemId}, ${userHash}, ${bucket}) RETURNING 1`;
    if (markerRows.length) {
      const counterRows = await q`INSERT INTO votes_counters (item_id, count) VALUES (${itemId}, 1) ON CONFLICT (item_id) DO UPDATE SET count = votes_counters.count + 1, updated_at = now() RETURNING count`;
      const count = counterRows.length ? Number(counterRows[0].count) || 0 : 0;
      return { count, alreadyVoted: false, limitReached: false, usedCount: userCountThisBucket + 1 };
    }
    const count = await getCount(itemId);
    return { count, alreadyVoted: true, limitReached: false, usedCount: userCountThisBucket };
  } catch (e) {
    if (process.env.VOTE_DEBUG === '1') console.error('[vote-debug][db] DB error in castVote (after query)', e?.message);
    _lastDbError = e;
    throw e;
  }
}

export function isDbBacked() { return HAS_DB; }
export function lastDbError() { return _lastDbError; }
export function maxPerWindow() { return MAX_PER_WINDOW; }
export function currentMaxPerWindow() { return MAX_PER_WINDOW; }
