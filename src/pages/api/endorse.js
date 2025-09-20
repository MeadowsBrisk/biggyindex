// Endorse (vote) API route (simplified fallback version)
// Methods: GET (batch counts), POST (cast vote)
// Uses Neon (if NETLIFY_DATABASE_URL set) else in-memory fallback.

import fs from 'fs';
import path from 'path';
import { ensureSchema, getCounts, getCount, castVote, isDbBacked, lastDbError, maxPerWindow } from '@/lib/votes/db';
import { hashIdentity } from '@/lib/votes/hashIdentity';

console.log('[endorse-api] module loaded');

export const config = { api: { bodyParser: true } };

const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const WINDOW_HOURS = Number(process.env.VOTE_WINDOW_HOURS || 24);
const HASH_SALT = process.env.VOTE_HASH_SALT || 'dev-salt';

let itemSet = null;
function loadItemSet() {
  if (itemSet) return itemSet;
  try {
    const fullPath = path.join(process.cwd(), 'public', 'indexed_items.json');
    const raw = fs.readFileSync(fullPath, 'utf8');
    const arr = JSON.parse(raw);
    itemSet = new Set(Array.isArray(arr) ? arr.map(i => (i && i.id != null ? String(i.id) : null)).filter(Boolean) : []);
    if (process.env.VOTE_DEBUG === '1') console.log('[vote-debug] itemSet size', itemSet.size);
  } catch (e) {
    if (process.env.VOTE_DEBUG === '1') console.warn('[vote-debug] load itemSet failed', e.message);
    itemSet = new Set();
  }
  return itemSet;
}

function currentBucket(now = Date.now()) { return Math.floor(now / (WINDOW_HOURS * 3600 * 1000)); }
function windowEndsAt(bucket) { const startMs = bucket * WINDOW_HOURS * 3600 * 1000; return new Date(startMs + WINDOW_HOURS * 3600 * 1000).toISOString(); }
function getClientIp(req) { const xf = req.headers['x-forwarded-for']; if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim(); return req.socket?.remoteAddress || ''; }

let schemaReady = false;
async function initSchemaOnce() { if (schemaReady) return; try { await ensureSchema(); } catch {} schemaReady = true; }

async function handleGet(req, res) {
  if ('health' in req.query) { res.status(200).json({ ok: true, mode: isDbBacked() ? 'db' : 'memory' }); return; }
  if (req.query.debug !== undefined) {
    const set = loadItemSet();
    const err = lastDbError();
    res.status(200).json({ debug: true, hasDb: isDbBacked(), itemSetSize: set.size, lastDbError: err ? err.message : null, bucket: currentBucket(), maxPerWindow: maxPerWindow() });
    return;
  }
  const idsParam = (req.query.ids || '').trim();
  if (!idsParam) { res.status(400).json({ error: 'ids required' }); return; }
  const ids = idsParam.split(',').map(s => s.trim()).filter(s => s && ITEM_ID_RE.test(s));
  if (!ids.length) { res.status(400).json({ error: 'no valid ids' }); return; }
  const uniq = Array.from(new Set(ids));
  let counts = {};
  try { counts = await getCounts(uniq); } catch (e) { if (process.env.VOTE_DEBUG === '1') console.warn('[vote-debug] getCounts failed', e.message); }
  const out = {}; for (const id of uniq) out[id] = counts[id] ?? 0;
  res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
  res.setHeader('X-Vote-Mode', isDbBacked() ? 'db' : 'memory');
  res.status(200).json({ votes: out, windowBucket: currentBucket(), mode: isDbBacked() ? 'db' : 'memory', maxPerWindow: maxPerWindow() });
}

async function handlePost(req, res) {
  if (process.env.VOTE_DEBUG === '1') console.log('[vote-debug] POST endorse start');
  let payload = {};
  try { if (req.body && typeof req.body === 'object') payload = req.body; else if (typeof req.body === 'string') payload = JSON.parse(req.body || '{}'); } catch {}
  const itemId = String(payload.itemId || '').trim();
  const cid = String(payload.cid || '').trim();
  if (!ITEM_ID_RE.test(itemId) || !cid) { res.status(400).json({ error: 'invalid itemId or cid' }); return; }
  const set = loadItemSet();
  if (set.size > 0 && !set.has(itemId)) { res.status(404).json({ error: 'unknown itemId' }); return; }
  const bucket = currentBucket();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const userHash = hashIdentity({ cid, ip, ua, salt: HASH_SALT });
  try {
    const { count, alreadyVoted, limitReached, usedCount } = await castVote(itemId, userHash, bucket);
    res.setHeader('X-Vote-Mode', isDbBacked() ? 'db' : 'memory');
    res.status(200).json({ itemId, count, alreadyVoted, limitReached, usedCount, maxPerWindow: maxPerWindow(), windowBucket: bucket, windowEndsAt: windowEndsAt(bucket), mode: isDbBacked() ? 'db' : 'memory' });
  } catch (e) {
    const count = await getCount(itemId).catch(() => 0);
    res.setHeader('X-Vote-Mode', isDbBacked() ? 'db' : 'memory');
    res.status(500).json({ error: 'vote_failed', itemId, count, mode: isDbBacked() ? 'db' : 'memory' });
  }
}

export default async function handler(req, res) {
  await initSchemaOnce();
  try {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    res.setHeader('Allow', 'GET,POST');
    res.status(405).end();
  } catch (err) {
    console.error('[endorse-api] unhandled error', err);
    res.status(500).json({ error: 'internal' });
  }
}
