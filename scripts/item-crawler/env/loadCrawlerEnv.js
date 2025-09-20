/* Environment loader for item crawler (tidy version: deprecated vars removed). */
function toInt(val, def) { if (val == null || val === '') return def; const n = Number(val); return Number.isFinite(n) ? n : def; }
function toBool(val, def) {
  if (val == null) return def;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase().trim();
  if (['1','true','yes','y','on'].includes(s)) return true;
  if (['0','false','no','n','off'].includes(s)) return false;
  return def;
}
function loadCrawlerEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const username = env.LB_LOGIN_USERNAME || env.LB_USERNAME || null;
  const password = env.LB_LOGIN_PASSWORD || env.LB_PASSWORD || null;
  const dryRun = toBool(env.CRAWLER_DRY_RUN, false);
  if ((!username || !password) && !dryRun) throw new Error('Missing LB_LOGIN_USERNAME / LB_LOGIN_PASSWORD environment variables');

  // Simplified reviews config
  const reviewFetchSize = toInt(env.CRAWLER_REVIEW_FETCH_SIZE, 100);
  const reviewMaxStore = toInt(env.CRAWLER_REVIEW_MAX_STORE, 200);
  const reviewRefreshHours = toInt(env.CRAWLER_REVIEW_REFRESH_HOURS, 1); // refresh reviews-only snapshot age threshold
  const fullRefreshHours = toInt(env.CRAWLER_FULL_REFRESH_HOURS, 24); // force full crawl if last full older than this
  const forceFullChanged = toBool(env.CRAWLER_FORCE_FULL_CHANGED, true); // full crawl if index lastUpdatedAt changed
  const modeRaw = (env.CRAWLER_MODE || 'auto').toLowerCase();
  const mode = ['auto','full','reviews'].includes(modeRaw) ? modeRaw : 'auto';
  const itemHtmlEarlyAbort = toBool(env.CRAWLER_ITEM_HTML_EARLY_ABORT, true);
  const shareRedact = toBool(env.CRAWLER_SHARE_REDACT, false);

  return Object.freeze({
    username,
    password,
    dryRun,
    maxParallel: toInt(env.CRAWLER_MAX_PARALLEL, 4),
    minDelayMs: toInt(env.CRAWLER_MIN_DELAY_MS, 350),
    jitterMs: toInt(env.CRAWLER_JITTER_MS, 200),
    reviewFetchSize,
    reviewMaxStore,
    captureMedia: toBool(env.CRAWLER_CAPTURE_MEDIA, true),
    fetchShare: toBool(env.CRAWLER_FETCH_SHARE, true),
    shipping: toBool(env.CRAWLER_SHIPPING, true),
    shipsTo: (env.CRAWLER_SHIPS_TO || 'GB').trim().toUpperCase(),
    saveShippingHtml: toBool(env.CRAWLER_SAVE_SHIPPING_HTML, false),
    resume: toBool(env.CRAWLER_RESUME, true),
    loginTimeoutMs: toInt(env.CRAWLER_LOGIN_TIMEOUT_MS, 45000),
    reviewRetries: toInt(env.CRAWLER_REVIEW_RETRIES, 3),
    includeIds: env.CRAWLER_INCLUDE_IDS ? env.CRAWLER_INCLUDE_IDS.split(',').map(s=>s.trim()).filter(Boolean) : null,
    logCookies: toBool(env.CRAWLER_LOG_COOKIES, false),
    outputDir: env.CRAWLER_OUTPUT_DIR || 'public/item-crawler',
    logLevel: env.LOG_LEVEL || 'info',
    captureLfHtml: toBool(env.CRAWLER_CAPTURE_LF_HTML, false),
    itemHtmlMaxBytes: toInt(env.CRAWLER_ITEM_HTML_MAX_BYTES, 350000),
    aggregatedExport: toBool(env.CRAWLER_AGGREGATED_EXPORT, true) // whether to produce aggregated JSON export
  ,reviewRefreshHours
  ,fullRefreshHours
  ,forceFullChanged
  ,mode
  ,persistMode: (env.CRAWLER_PERSIST || 'auto').toLowerCase()
  ,blobsStore: env.CRAWLER_BLOBS_STORE || 'site-index'
  ,blobsPrefix: env.CRAWLER_BLOBS_PREFIX || 'item-crawler/'
  ,itemHtmlEarlyAbort
  ,shareRedact
  ,publicBase: (env.CRAWLER_PUBLIC_BASE || env.SITE_URL || env.URL || env.DEPLOY_URL || '').trim()
  ,migrateSeedLimit: toInt(env.CRAWLER_MIGRATE_SEED_LIMIT, 500)
  ,migrateEager: toBool(env.CRAWLER_MIGRATE_EAGER, false)
  });
}
module.exports = { loadCrawlerEnv };

//   ,persistMode: (env.CRAWLER_PERSIST || 'auto').toLowerCase()
