// blobStore.js - abstraction over Netlify Blobs (or fs fallback) for crawler persistence
// Modes: fs | blobs | auto (detect presence of process.env.NETLIFY and @netlify/blobs availability)

const fs = require('fs');
const path = require('path');
let blobsApi = null;
let storeCache = null;

async function ensureBlobs() {
  if (blobsApi) return blobsApi;
  try {
    // Prefer Store API (same as indexer/front-end)
    const mod = await import('@netlify/blobs');
    blobsApi = { getStore: mod.getStore };
  } catch {
    blobsApi = null;
  }
  return blobsApi;
}

function fsWrite(baseDir, key, data) {
  const file = path.join(baseDir, key.replace(/\//g, path.sep));
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(file, data, 'utf8');
}

function fsRead(baseDir, key) {
  const file = path.join(baseDir, key.replace(/\//g, path.sep));
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file,'utf8');
}

async function initPersistence({ persistMode='auto', blobsStore='site-index', blobsPrefix='item-crawler/', outputDir='public/item-crawler', log = console } = {}) {
  const apiAvailable = !!(await ensureBlobs());
  let mode = persistMode;
  // Detect if explicit auth is present (allows using Blobs outside Netlify builds)
  const siteIDProbe = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
  const tokenProbe = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
  const haveExplicitAuth = !!(siteIDProbe && tokenProbe);
  if (persistMode === 'auto') mode = apiAvailable && (process.env.NETLIFY || haveExplicitAuth) ? 'blobs' : 'fs';
  if (mode === 'blobs' && !apiAvailable) mode = 'fs';
  // Track which auth path is active
  let authMode = 'none'; // 'explicit' | 'env' | 'none'
  let tokenSource = 'none'; // which env var supplied token (NETLIFY_BLOBS_TOKEN, NETLIFY_API_TOKEN, ... or 'implicit')
  const authPref = (process.env.CRAWLER_BLOBS_AUTH || 'auto').toLowerCase(); // 'implicit' | 'explicit' | 'auto'
  // Helper that honors preferred auth strategy
  async function createStorePreferExplicit(getStore){
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
  let token = null; tokenSource = 'none';
  if (process.env.NETLIFY_BLOBS_TOKEN) { token = process.env.NETLIFY_BLOBS_TOKEN; tokenSource = 'NETLIFY_BLOBS_TOKEN'; }
  else if (process.env.NETLIFY_API_TOKEN) { token = process.env.NETLIFY_API_TOKEN; tokenSource = 'NETLIFY_API_TOKEN'; }
    if (authPref === 'implicit') {
      try { authMode = 'env'; tokenSource = 'implicit'; return getStore({ name: blobsStore, consistency: 'strong' }); } catch {}
    } else if (authPref === 'explicit') {
      if (siteID && token) {
        try { authMode = 'explicit'; return getStore({ name: blobsStore, siteID, token, consistency: 'strong' }); } catch {}
      }
    } else {
      if (siteID && token) {
        try { authMode = 'explicit'; return getStore({ name: blobsStore, siteID, token, consistency: 'strong' }); } catch {}
      }
      try { authMode = 'env'; tokenSource = 'implicit'; return getStore({ name: blobsStore, consistency: 'strong' }); } catch {}
    }
    authMode = 'none';
    return null;
  }
  let store = null;
  if (mode === 'blobs') {
      try {
        store = await createStorePreferExplicit(blobsApi.getStore);
      } catch (e) {
        log.warn('[blob] getStore failed: ' + e.message);
        mode = 'fs';
      }
  }
  storeCache = store;

  // Try a lightweight probe to ensure current auth can write; if not, switch to explicit
  if (mode === 'blobs' && storeCache) {
    try {
      const probeKey = `${blobsPrefix}diagnostics/_probe_${Date.now()}.txt`;
      await storeCache.set(probeKey, 'ok', { contentType: 'text/plain' });
      try { if (typeof storeCache.delete === 'function') await storeCache.delete(probeKey); } catch {}
      try {
        const tail = tokenSource && tokenSource !== 'implicit' && tokenSource !== 'none' ? (process.env[tokenSource] || '').slice(-6) : '';
        log.info(`[blob] probe ok prefix=${blobsPrefix} auth=${authMode} tokenSrc=${tokenSource}${tail?`(~${tail})`:''}`);
      } catch {}
    } catch (e) {
      log.warn('[blob] probe failed: '+(e?.message||String(e))+'; switching to explicit if possible');
      try { const s = await createStorePreferExplicit(blobsApi.getStore); if (s) storeCache = s; } catch {}
    }
  }

  async function reinitStoreIfPossible(){
    try {
      const { getStore } = blobsApi;
      // Prefer explicit first if available
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
      if (siteID && token) { try { storeCache = getStore({ name: blobsStore, siteID, token, consistency: 'strong' }); authMode = 'explicit'; tokenSource = process.env.NETLIFY_BLOBS_TOKEN ? 'NETLIFY_BLOBS_TOKEN' : (process.env.NETLIFY_API_TOKEN ? 'NETLIFY_API_TOKEN' : (process.env.NETLIFY_AUTH_TOKEN ? 'NETLIFY_AUTH_TOKEN' : (process.env.BLOBS_TOKEN ? 'BLOBS_TOKEN' : 'none'))); return true; } catch {} }
      // Fallback to implicit (Netlify internal identity)
      try { storeCache = getStore({ name: blobsStore, consistency: 'strong' }); authMode = 'env'; tokenSource = 'implicit'; return true; } catch {}
    } catch {}
    return false;
  }

  const altPrefix = (process.env.CRAWLER_ALT_BLOBS_PREFIX || '').trim();
  async function writeJson(key, obj) {
    const data = JSON.stringify(obj, null, 2);
    if (mode === 'blobs') {
      const fullKey = blobsPrefix + key;
      let triedAlt = false;
      for (let attempt=1; attempt<=5; attempt++) {
        try {
          await (storeCache||store).set(fullKey, data, { contentType: 'application/json' });
          log.info(`[blob] write ${key} size=${data.length}`);
          return true;
        } catch(e) {
          const msg = e && (e.status || e.message || String(e));
          const tail = tokenSource && tokenSource !== 'implicit' && tokenSource !== 'none' ? (process.env[tokenSource] || '').slice(-6) : '';
          log.warn(`[blob] write fail ${key} attempt=${attempt} ${msg} fullKey=${fullKey} auth=${authMode} tokenSrc=${tokenSource}${tail?`(~${tail})`:''}`);
          if ((/401|403/.test(String(msg))) ) {
            const ok = await reinitStoreIfPossible();
            // Even if reinit succeeded, try alt prefix after a couple attempts
            if (altPrefix && !triedAlt && attempt >= 2) {
              triedAlt = true;
              const altKey = altPrefix.replace(/\/$/,'/') + key;
              for (let a2=1; a2<=3; a2++) {
                try {
                  await (storeCache||store).set(altKey, data, { contentType: 'application/json' });
                  log.warn(`[blob] write fallback via altPrefix ok key=${altKey}`);
                  return true;
                } catch (e2) {
                  const m2 = e2 && (e2.status || e2.message || String(e2));
                  log.warn(`[blob] altPrefix write fail ${altKey} attempt=${a2} ${m2}`);
                }
              }
            }
            if (ok) { continue; }
            // Optional prefix fallback for path-scoped tokens
            // If we get here, reinit failed; alt prefix may already have been tried above
          }
          await new Promise(r=>setTimeout(r, Math.min(1500, 200*attempt)));
        }
      }
      return false;
    } else {
      fsWrite(outputDir, key, data); return true;
    }
  }

  async function readJson(key) {
    if (mode === 'blobs') {
      try { const v = await (storeCache||store).get(blobsPrefix + key); if (!v) return null; return JSON.parse(v); } catch { return null; }
    } else {
      try { const raw = fsRead(outputDir, key); return raw? JSON.parse(raw): null; } catch { return null; }
    }
  }

  async function writeItem(itemData) { return writeJson(`items/${itemData.refNum}.json`, itemData); }
  async function readItem(refNum) { return readJson(`items/${refNum}.json`); }

  async function listKeys(prefix = '') {
    const normPrefix = String(prefix || '');
    if (mode === 'blobs') {
      const store = (storeCache || storeCache);
      if (!store || typeof store.list !== 'function') return [];
      const out = [];
      const fullPrefix = (blobsPrefix || '') + normPrefix;
      let cursor = undefined;
      try {
        while (true) {
          const res = await store.list({ prefix: fullPrefix || undefined, cursor });
          if (!res) break;
          const collected = [];
          if (Array.isArray(res)) {
            collected.push(...res);
          } else {
            if (Array.isArray(res.blobs)) collected.push(...res.blobs.map(b => (b && (b.key || b.name || b.id)) || '')); // netlify typical
            if (Array.isArray(res.keys)) collected.push(...res.keys);
            if (Array.isArray(res.items)) collected.push(...res.items.map(b => (b && (b.key || b.name || b.id)) || ''));
            // Fallback: object with enumerable string values
            if (!res.blobs && !res.keys && !res.items && typeof res === 'object') {
              const own = Object.keys(res).filter(k => typeof res[k] === 'string');
              if (own.length && own.length < 1000) collected.push(...own);
            }
          }
          for (const k of collected) {
            if (typeof k !== 'string' || !k) continue;
            let rel = k;
            if (rel.startsWith(blobsPrefix)) rel = rel.slice(blobsPrefix.length);
            out.push(rel);
          }
          cursor = res.cursor || res.nextCursor || null;
          if (!cursor) break;
        }
      } catch {
        // ignore listing errors; return whatever we have
      }
      // Deduplicate
      return Array.from(new Set(out));
    } else {
      // FS mode: list keys under outputDir/prefix and return relative paths using forward slashes
      const results = [];
      try {
        const base = path.join(outputDir, normPrefix.replace(/\//g, path.sep));
        if (!fs.existsSync(base)) return results;
        function walk(dir, relBase) {
          const ents = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of ents) {
            const abs = path.join(dir, ent.name);
            const rel = path.join(relBase, ent.name).replace(/\\+/g, '/');
            if (ent.isDirectory()) walk(abs, rel);
            else results.push(rel);
          }
        }
        walk(base, normPrefix.replace(/\\+/g, '/'));
      } catch {}
      return results;
    }
  }

  return { mode, authMode: () => authMode, tokenSource: () => tokenSource, writeJson, readJson, writeItem, readItem, listKeys };
}

module.exports = { initPersistence };
