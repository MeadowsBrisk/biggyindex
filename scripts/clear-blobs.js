#!/usr/bin/env node
// Clear Netlify Blob store keys (with dry-run, optional prefix, and local backup)
// Usage:
//   NETLIFY_SITE_ID=xxx NETLIFY_API_TOKEN=xxx node scripts/clear-blobs.js            (dry run)
//   NETLIFY_SITE_ID=xxx NETLIFY_API_TOKEN=xxx node scripts/clear-blobs.js --confirm   (delete all keys)
// Options:
//   --prefix=some/path    Only operate on keys starting with this prefix
//   --no-backup           Skip creating a local JSON backup before deletion
//   --keep=key1,key2      Comma separated keys to preserve (never deleted)
//   --batch=25            Concurrency batch size (default 20)
//   --store=site-index    Override store name
//node scripts/clear-blobs.js --confirm
'use strict';

const fs = require('fs');
const path = require('path');
let getStore;
async function loadGetStore() {
  if (getStore) return getStore;
  try {
    ({ getStore } = require('@netlify/blobs'));
    return getStore;
  } catch (e) {
    // Attempt dynamic import (ESM fallback)
    try {
      const mod = await import('@netlify/blobs');
      getStore = mod.getStore;
      return getStore;
    } catch (e2) {
      console.error('Unable to load @netlify/blobs. Install dependencies (npm/yarn install) or ensure the package is available. Root cause:', e2.message);
      process.exit(1);
    }
  }
}

// Attempt to hydrate env vars from .env if missing (minimal parser)
(function ensureEnvFromDotenv() {
  const needed = ['NETLIFY_SITE_ID', 'NETLIFY_API_TOKEN', 'NETLIFY_AUTH_TOKEN'];
  const missing = needed.filter(k => !process.env[k]);
  if (missing.length === needed.length) { // all missing; try load
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      try {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          if (!line || line.startsWith('#')) continue;
          const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
          if (m) {
            const key = m[1];
            if (!process.env[key]) {
              let val = m[2];
              // Remove optional surrounding quotes
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              process.env[key] = val;
            }
          }
        }
        console.log('[clear-blobs] Loaded .env file');
      } catch (e) {
        console.warn('[clear-blobs] Failed to parse .env:', e.message);
      }
    }
  }
})();

const args = process.argv.slice(2);
const getArg = (name, def = null) => {
  const pref = `--${name}=`;
  const hit = args.find(a => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  if (args.includes(`--${name}`)) return true;
  return def;
};

const STORE_NAME = getArg('store', 'site-index');
const SITE_ID = process.env.NETLIFY_SITE_ID;
const TOKEN = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
const PREFIX = getArg('prefix', '');
const NO_BACKUP = !!getArg('no-backup', false);
const BATCH = Number(getArg('batch', 20)) || 20;
const KEEP = (getArg('keep', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const CONFIRM = args.includes('--confirm');

if (!SITE_ID || !TOKEN) {
  console.error('Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN');
  process.exit(1);
}

(async () => {
  const getStoreFn = await loadGetStore();
  const store = getStoreFn({ name: STORE_NAME, siteID: SITE_ID, token: TOKEN, consistency: 'strong' });

  async function listAllKeys() {
    // Supports shapes: array<string>, { blobs:[{key}] }, { keys:[...] }, { items:[{key}] }, pagination via cursor
    const all = [];
    if (!store || typeof store.list !== 'function') return all;
    let cursor = undefined;
    try {
      while (true) {
        const res = await store.list({ prefix: PREFIX || undefined, cursor });
        if (!res) break;
        if (Array.isArray(res)) { // simple array of keys
          for (const k of res) if (!KEEP.includes(k)) all.push(k);
          break; // no pagination info in this shape
        }
        // object shape
        const candidateArrays = [];
        if (Array.isArray(res.blobs)) candidateArrays.push(res.blobs.map(b => b && (b.key || b.name || b.id || b))); // netlify style
        if (Array.isArray(res.keys)) candidateArrays.push(res.keys);
        if (Array.isArray(res.items)) candidateArrays.push(res.items.map(b => b && (b.key || b.name || b.id || b)));
        if (candidateArrays.length === 0 && typeof res === 'object') {
          // maybe an object whose own enumerable keys are the blob keys
          const ownKeys = Object.keys(res).filter(k => typeof res[k] === 'string');
          if (ownKeys.length && ownKeys.length < 500) candidateArrays.push(ownKeys);
        }
        for (const arr of candidateArrays) {
          for (const k of arr) {
            if (typeof k !== 'string') continue;
            if (KEEP.includes(k)) continue;
            all.push(k);
          }
        }
        cursor = res.cursor || res.nextCursor || null;
        if (!cursor) break;
      }
    } catch (e) {
      console.warn('Listing blobs failed:', e.message);
      return all; // return whatever collected so far
    }
    // Deduplicate just in case
    return Array.from(new Set(all));
  }

  const keys = await listAllKeys();
  if (keys.length === 0) {
    console.log(`No keys found${PREFIX ? ` with prefix '${PREFIX}'` : ''} in store '${STORE_NAME}'.`);
    return;
  }
  console.log(`Store: ${STORE_NAME}`);
  if (PREFIX) console.log(`Prefix: ${PREFIX}`);
  if (KEEP.length) console.log('Keeping keys:', KEEP.join(', '));
  console.log('Discovered', keys.length, 'keys to operate on');
  keys.slice(0, 30).forEach(k => console.log(' -', k));
  if (keys.length > 30) console.log(` ... (${keys.length - 30} more)`);

  if (!CONFIRM) {
    console.log('\nDry run only. Re-run with --confirm to delete these keys.');
    return;
  }

  // Optional backup
  if (!NO_BACKUP) {
    try {
      const backup = {};
      let fetched = 0;
      for (const k of keys) {
        try {
          const val = await store.get(k);
          backup[k] = val || null;
        } catch (e) {
          backup[k] = null;
        }
        fetched++;
        if (fetched % 25 === 0) process.stdout.write(`Backup progress ${fetched}/${keys.length}\r`);
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const outDir = path.join(process.cwd(), 'scripts');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const file = path.join(outDir, `blob-backup-${STORE_NAME}${PREFIX ? '-' + PREFIX.replace(/[^a-z0-9_-]/gi,'_') : ''}-${ts}.json`);
      fs.writeFileSync(file, JSON.stringify({ meta: { store: STORE_NAME, prefix: PREFIX, keys: keys.length, generatedAt: new Date().toISOString() }, data: backup }, null, 2));
      console.log(`\nBackup written: ${file}`);
    } catch (e) {
      console.warn('Backup failed, continuing anyway:', e.message);
    }
  } else {
    console.log('Skipping backup (--no-backup specified)');
  }

  // Delete in batches
  let deleted = 0;
  const errors = [];
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    await Promise.all(slice.map(async k => {
      try { await store.delete(k); deleted++; }
      catch (e) { errors.push({ key: k, error: e.message }); }
    }));
    process.stdout.write(`Deleted ${deleted}/${keys.length}\r`);
  }
  process.stdout.write('\n');
  console.log(`Finished. Deleted=${deleted} errors=${errors.length}`);
  if (errors.length) {
    console.log('Errors:');
    errors.slice(0, 20).forEach(e => console.log(' -', e.key, e.error));
    if (errors.length > 20) console.log(` ... (${errors.length - 20} more)`);
  }
})();
