// Netlify background scheduled function for item crawler
// Background functions can run much longer than standard functions.
const path = require('path');

exports.handler = async function(event, context) {
  const started = Date.now();
  try {
    console.log('[crawler-fn-bg] entry');
  // Keep default working directory (/var/task) so relative paths to included_files resolve
    // Light env safety: skip if credentials not present
    if (!process.env.LB_LOGIN_USERNAME || !process.env.LB_LOGIN_PASSWORD) {
      console.log('[crawler-fn-bg] missing credentials; abort');
      return; // Background functions ignore response; returning ends early
    }
  // Ensure we persist to Blobs in Netlify runtime
  process.env.CRAWLER_PERSIST = process.env.CRAWLER_PERSIST || 'blobs';
    // Optional: accept query overrides for ad-hoc throttling and blob config
    try {
      const qs = (event && event.queryStringParameters) || {};
      if (qs && qs.limit) {
        const n = parseInt(String(qs.limit), 10);
        if (Number.isFinite(n) && n > 0) process.env.CRAWLER_LIMIT = String(n);
      }
      if (qs && qs.ids) {
        process.env.CRAWLER_INCLUDE_IDS = String(qs.ids);
      }
      if (qs && (qs.force!=null)) {
        const fv = String(qs.force).toLowerCase();
        if (['1','true','yes','y','on'].includes(fv)) process.env.CRAWLER_FORCE = 'true';
      }
      if (qs && qs.prefix) process.env.CRAWLER_BLOBS_PREFIX = String(qs.prefix);
      if (qs && qs.altPrefix) process.env.CRAWLER_ALT_BLOBS_PREFIX = String(qs.altPrefix);
      if (qs && qs.auth) process.env.CRAWLER_BLOBS_AUTH = String(qs.auth);
      if (qs && qs.parallel) process.env.CRAWLER_MAX_PARALLEL = String(qs.parallel);
      if (qs && qs.seed) process.env.CRAWLER_MIGRATE_SEED_LIMIT = String(qs.seed);
    } catch {}
    // Static require so bundler can include dependencies (yargs, p-queue, etc.)
    const { main } = require('../../scripts/item-crawler/crawl-items.js');
    await main();
    console.log('[crawler-fn-bg] done ms=' + (Date.now()-started));
  } catch (e) {
    console.error('[crawler-fn-bg] error', e && (e.stack || e.message || String(e)));
  }
};
