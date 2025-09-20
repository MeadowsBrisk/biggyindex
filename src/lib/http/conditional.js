// Shared conditional response helper for JSON endpoints with ETag / Last-Modified support.
// Usage:
//  await conditionalJSON(req, res, {
//    prefix: 'items',            // short resource prefix for ETag namespace
//    version: 'abc123',          // opaque version token (required)
//    updatedAt: isoString,       // ISO timestamp (required)
//    cacheControl: 'public, max-age=0, must-revalidate', // header value
//    getBody: async () => ({ ... }) // only executed when sending a 200 (and not HEAD)
//    weak: true (default)        // whether to use weak ETag (W/)
//  });
// Automatically handles:
//   - If-None-Match vs ETag
//   - If-Modified-Since vs updatedAt
//   - 304 Not Modified
//   - HEAD (200 with headers only)
// Adds ETag, Last-Modified, Cache-Control headers always.

export async function conditionalJSON(req, res, opts) {
  const DEFAULT_MAX_AGE = Number(process.env.INDEX_CACHE_MAX_AGE || 600); //1200 20 minutes default
  const DEFAULT_STALE = Number(process.env.INDEX_CACHE_STALE || Math.round(DEFAULT_MAX_AGE / 4));
  const {
    prefix,
    version,
    updatedAt,
    cacheControl, // optional override
    maxAgeSeconds, // optional numeric override (takes precedence over default if provided)
    getBody,
    weak = true,
  } = opts || {};
  const finalMaxAge = Number.isFinite(maxAgeSeconds) ? maxAgeSeconds : DEFAULT_MAX_AGE;
  const finalCacheControl = cacheControl || `public, max-age=${finalMaxAge}, must-revalidate, stale-while-revalidate=${DEFAULT_STALE}`;
  if (!prefix || !version || !updatedAt) {
    res.status(500).json({ error: 'conditional_misconfigured' });
    return;
  }
  const etag = `${weak ? 'W/' : ''}"${prefix}-${version}"`;
  const inm = req.headers['if-none-match'];
  const ims = req.headers['if-modified-since'];
  let notModified = false;
  if (inm && inm === etag) {
    notModified = true;
  } else if (ims) {
    const since = Date.parse(ims);
    const snap = Date.parse(updatedAt);
    if (!isNaN(since) && !isNaN(snap) && snap <= since) notModified = true;
  }
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', new Date(updatedAt).toUTCString());
  res.setHeader('Cache-Control', finalCacheControl);
  if (notModified) {
    res.status(304).end();
    return;
  }
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }
  try {
    const body = await getBody();
    res.status(200).json(body);
  } catch (e) {
    res.status(500).json({ error: 'conditional_body_error' });
  }
}
