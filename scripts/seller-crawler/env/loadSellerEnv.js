const path = require('path');

function toInt(value, fallback) {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (value == null) return fallback;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return fallback;
}

function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).length > 0) return v;
  }
  return undefined;
}

function loadSellerEnv(overrides = {}) {
  const env = process.env;

  const maxParallel = toInt(pick(env.SELLER_CRAWLER_MAX_PARALLEL, env.CRAWLER_MAX_PARALLEL), 4);
  const minDelayMs = toInt(pick(env.SELLER_CRAWLER_MIN_DELAY_MS, env.CRAWLER_MIN_DELAY_MS), 350);
  const jitterMs = toInt(pick(env.SELLER_CRAWLER_JITTER_MS, env.CRAWLER_JITTER_MS), 200);
  const htmlMaxBytes = toInt(pick(env.SELLER_CRAWLER_HTML_MAX_BYTES, env.CRAWLER_ITEM_HTML_MAX_BYTES), 250000);
  const htmlEarlyAbort = toBool(pick(env.SELLER_CRAWLER_HTML_EARLY_ABORT, env.CRAWLER_ITEM_HTML_EARLY_ABORT), true);
  const reviewFetchSize = toInt(pick(env.SELLER_CRAWLER_REVIEW_FETCH_SIZE, env.CRAWLER_REVIEW_FETCH_SIZE), 100);
  const reviewMaxStore = toInt(pick(env.SELLER_CRAWLER_REVIEW_MAX_STORE, env.CRAWLER_REVIEW_MAX_STORE), 150);
  const reviewRetries = toInt(pick(env.SELLER_CRAWLER_REVIEW_RETRIES, env.CRAWLER_REVIEW_RETRIES), 3);
  const mode = String(pick(env.SELLER_CRAWLER_MODE, env.CRAWLER_MODE) || 'auto').trim();
  const resume = toBool(pick(env.SELLER_CRAWLER_RESUME, env.CRAWLER_RESUME), true);
  const manifestoRefreshHours = toInt(env.SELLER_CRAWLER_MANIFESTO_REFRESH_HOURS, 80);
  const reviewRefreshHours = toInt(pick(env.SELLER_CRAWLER_REVIEW_REFRESH_HOURS, env.CRAWLER_REVIEW_REFRESH_HOURS), 1);
  const fetchShare = toBool(pick(env.SELLER_CRAWLER_FETCH_SHARE, env.CRAWLER_FETCH_SHARE), true);
  const shareRedact = toBool(pick(env.SELLER_CRAWLER_SHARE_REDACT, env.CRAWLER_SHARE_REDACT), false);
  const maxRuntimeMs = toInt(env.SELLER_CRAWLER_MAX_RUNTIME_MS, 900000);
  const captureMedia = toBool(pick(env.SELLER_CRAWLER_CAPTURE_MEDIA, env.CRAWLER_CAPTURE_MEDIA), true);
  const recentReviewsLimit = toInt(env.SELLER_CRAWLER_RECENT_REVIEWS_LIMIT, 200);
  const recentMediaLimit = toInt(env.SELLER_CRAWLER_RECENT_MEDIA_LIMIT, 50);

  // Leaderboard configuration (key settings only)
  const leaderboardWindowDays = toInt(env.SELLER_CRAWLER_LEADERBOARD_WINDOW_DAYS, 10);
  const leaderboardLimit = toInt(env.SELLER_CRAWLER_LEADERBOARD_LIMIT, 10);
  const leaderboardMinNegatives = toInt(env.SELLER_CRAWLER_LEADERBOARD_MIN_NEGATIVES, 2);

  const persistMode = String(pick(env.CRAWLER_PERSIST, 'auto'));
  const blobsStore = String(pick(env.CRAWLER_BLOBS_STORE, 'site-index'));
  const blobsPrefix = String(pick(env.SELLER_CRAWLER_BLOBS_PREFIX, 'seller-crawler/'));
  const outputDir = path.join(process.cwd(), 'public', 'seller-crawler');
  const publicBase = String(pick(env.PUBLIC_BASE, env.CRAWLER_PUBLIC_BASE, '')) || null;

  const logLevel = String(pick(overrides.LOG_LEVEL, env.LOG_LEVEL, 'info'));
  const dryRun = toBool(pick(overrides.SELLER_CRAWLER_DRY_RUN, overrides.CRAWLER_DRY_RUN, env.SELLER_CRAWLER_DRY_RUN, env.CRAWLER_DRY_RUN), false);

  return {
    username: env.LB_LOGIN_USERNAME || null,
    password: env.LB_LOGIN_PASSWORD || null,
    maxParallel,
    minDelayMs,
    jitterMs,
    htmlMaxBytes,
    htmlEarlyAbort,
    reviewFetchSize,
    reviewMaxStore,
    reviewRetries,
    mode,
    resume,
    manifestoRefreshHours,
    reviewRefreshHours,
    fetchShare,
    shareRedact,
    maxRuntimeMs,
    captureMedia,
    recentReviewsLimit,
    recentMediaLimit,
    leaderboardWindowDays,
    leaderboardLimit,
    leaderboardMinNegatives,
    persistMode,
    blobsStore,
    blobsPrefix,
    outputDir,
    publicBase,
    logLevel,
    dryRun
  };
}

module.exports = { loadSellerEnv };


