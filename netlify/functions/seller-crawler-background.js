// Netlify background scheduled function for seller crawler
exports.handler = async function(event, context) {
  const started = Date.now();
  try {
    console.log('[seller-crawler-bg] entry');
    if (!process.env.LB_LOGIN_USERNAME || !process.env.LB_LOGIN_PASSWORD) {
      console.log('[seller-crawler-bg] missing credentials; abort');
      return;
    }
    process.env.CRAWLER_PERSIST = process.env.CRAWLER_PERSIST || 'blobs';
  process.env.SELLER_CRAWLER_PERSIST = process.env.SELLER_CRAWLER_PERSIST || process.env.CRAWLER_PERSIST || 'blobs';
    try {
      const qs = (event && event.queryStringParameters) || {};
      if (qs && qs.limit) {
        const n = parseInt(String(qs.limit), 10);
        if (Number.isFinite(n) && n > 0) {
          process.env.SELLER_CRAWLER_LIMIT = String(n);
        }
      }
      if (qs && qs.ids) {
        process.env.SELLER_CRAWLER_INCLUDE_IDS = String(qs.ids);
      }
      // Note: we intentionally do not support a remote 'force' flag for sellers; keep this a local-only knob.
      if (qs && qs.prefix) process.env.SELLER_CRAWLER_BLOBS_PREFIX = String(qs.prefix);
      if (qs && qs.altPrefix) {
        process.env.CRAWLER_ALT_BLOBS_PREFIX = String(qs.altPrefix);
      }
      if (qs && qs.auth) {
        process.env.CRAWLER_BLOBS_AUTH = String(qs.auth);
      }
      if (qs && qs.parallel) {
        process.env.SELLER_CRAWLER_MAX_PARALLEL = String(qs.parallel);
      }
      if (qs && qs.mode) process.env.SELLER_CRAWLER_MODE = String(qs.mode);
    } catch {}
    const { main } = require('../../scripts/seller-crawler/crawl-sellers.js');
    await main();
    console.log('[seller-crawler-bg] done ms=' + (Date.now() - started));
  } catch (e) {
    console.error('[seller-crawler-bg] error', e && (e.stack || e.message || String(e)));
  }
};