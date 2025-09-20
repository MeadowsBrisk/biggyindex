// Netlify function to set/clear a crawler stop flag in Blobs
// Usage:
//  - GET ?status -> returns current control state
//  - POST with JSON { stop: true, reason?: string, ttlSeconds?: number } -> set stop flag
//  - POST with JSON { stop: false } -> clear stop flag

exports.handler = async function(event, context) {
  const started = Date.now();
  try {
    const qs0 = event.queryStringParameters || {};
    // Diagnostic mode: quickly report environment without depending on blobs
    if (qs0.diag !== undefined) {
      let importOk = false; let importErr = null;
      let hasSite = !!(process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID);
      let hasToken = !!(process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN);
      try { await import('@netlify/blobs'); importOk = true; } catch(e) { importErr = e?.message || String(e); }
      return { statusCode: 200, body: JSON.stringify({ ok: true, diag: true, node: process.version, importOk, importErr, hasSite, hasToken, bundler: 'esbuild', ms: Date.now()-started }) };
    }
    const { getStore } = await import('@netlify/blobs');
    const storeName = process.env.CRAWLER_BLOBS_STORE || 'site-index';
    let store = null;
    try { store = getStore({ name: storeName, consistency: 'strong' }); } catch {}
    if (!store) {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
      if (siteID && token) {
        try { store = getStore({ name: storeName, siteID, token, consistency: 'strong' }); } catch {}
      }
    }
    const key = 'control/crawler.json';
    const qs = event.queryStringParameters || {};
    const secret = process.env.CRAWLER_CONTROL_SECRET || null;
    if (!store) {
      if (event.httpMethod === 'GET' && typeof qs.stop === 'undefined') {
        const hasSite = !!(process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID);
        const hasToken = !!(process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN);
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'blobs store unavailable', hint: 'Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN (or NETLIFY_BLOBS_TOKEN) in Netlify site env, then redeploy.', hasSite, hasToken }) };
      }
      return { statusCode: 500, body: JSON.stringify({ error: 'blobs store unavailable', hint: 'Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN or NETLIFY_BLOBS_TOKEN in site env, or ensure implicit context is available.' }) };
    }

    

    if (event.httpMethod === 'GET') {
      // Optional quick control via query params: ?stop=1|0&reason=...&ttl=seconds
      if (typeof qs.stop !== 'undefined') {
        if (secret && qs.secret !== secret) {
          return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
        }
        const setStop = /^1|true|yes$/i.test(String(qs.stop));
        const reason = qs.reason ? String(qs.reason).slice(0,200) : undefined;
        const ttlSeconds = qs.ttl ? parseInt(String(qs.ttl),10) : undefined;
        let until = undefined;
        if (Number.isFinite(ttlSeconds) && ttlSeconds>0) until = new Date(Date.now()+ttlSeconds*1000).toISOString();
        const payload = JSON.stringify({ stop: setStop, reason, until, updatedAt: new Date().toISOString() });
        await store.set(key, payload, { contentType: 'application/json' });
        return { statusCode: 200, body: JSON.stringify({ ok: true, control: JSON.parse(payload), via: 'query', ms: Date.now()-started }) };
      }
      // Compose richer bot status
      const raw = await store.get(key);
      const ctl = raw ? JSON.parse(raw) : { stop: false };
      async function getJsonSafe(k){ try { const v = await store.get(k); return v? JSON.parse(v): null; } catch { return null; } }
      // Last run meta (crawler writes to item-crawler/run-meta.json)
      let lastRun = await getJsonSafe('item-crawler/run-meta.json');
      if (!lastRun) lastRun = await getJsonSafe('run-meta.json');
      // Index items count (from indexed_items.json at store root)
      let indexStats = null;
      try {
        const idxRaw = await store.get('indexed_items.json');
        if (idxRaw) { const arr = JSON.parse(idxRaw); indexStats = { count: Array.isArray(arr)? arr.length : 0 }; }
      } catch {}
      const deploy = {
        id: process.env.DEPLOY_ID || null,
        context: process.env.CONTEXT || null,
        branch: process.env.BRANCH || null,
        commit: process.env.COMMIT_REF || null,
        node: process.version
      };
      const bot = {
        store: storeName,
        prefix: 'item-crawler/',
        control: ctl,
        lastRun: lastRun ? {
          startedAt: lastRun.startedAt,
          finishedAt: lastRun.finishedAt,
          durationMs: lastRun.durationMs,
          itemsPlanned: lastRun.itemsPlanned,
          itemsCompleted: lastRun.itemsCompleted,
          full: lastRun.fullItemsProcessed,
          reviewsOnly: lastRun.reviewOnlyItemsProcessed,
          skipped: lastRun.skippedUnchanged,
          errors: lastRun.errors
        } : null,
        index: indexStats,
        deploy
      };
      return { statusCode: 200, body: JSON.stringify({ ok: true, control: ctl, bot, ms: Date.now()-started }) };
    }
    if (event.httpMethod === 'POST') {
      if (secret && (event.headers['x-crawler-control-secret'] !== secret)) {
        // Allow secret in header or body
        try { const body = JSON.parse(event.body||'{}'); if (body.secret !== secret) { return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) }; } }
        catch { return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) }; }
      }
      let body = {};
      try { body = JSON.parse(event.body||'{}'); } catch {}
      const stop = !!body.stop;
      const reason = body.reason ? String(body.reason).slice(0,200) : undefined;
      let until = undefined;
      const ttlSeconds = Number.parseInt(body.ttlSeconds,10);
      if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
        until = new Date(Date.now() + ttlSeconds*1000).toISOString();
      }
      const payload = JSON.stringify({ stop, reason, until, updatedAt: new Date().toISOString() });
      await store.set(key, payload, { contentType: 'application/json' });
      return { statusCode: 200, body: JSON.stringify({ ok: true, control: JSON.parse(payload), ms: Date.now()-started }) };
    }
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error: e.message, stack: e.stack }) };
  }
};
