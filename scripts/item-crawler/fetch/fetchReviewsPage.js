const log = require('../util/logger');

// Fetch a page of reviews via API endpoint with host fallback & richer diagnostics.
// Options: { client, refNum, offset, pageSize, logSnippet }
// Returns { item, reviews, first, n, raw, url, ms }
async function fetchReviewsPage({ client, refNum, offset = 0, pageSize = 100, logSnippet = false }) {
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  let lastErr = null;
  for (const host of hosts) {
    const url = `${host}/core/api/reviews/item/${encodeURIComponent(refNum)}?first=${offset}&n=${pageSize}&requireMedia=false`;
    const t0 = Date.now();
    try {
      const res = await client.get(url, { responseType: 'json' });
      const ms = Date.now() - t0;
      const data = res.data || {};
      const message = data.message || {};
      const out = {
        item: message.item || null,
        reviews: Array.isArray(message.reviews) ? message.reviews : [],
        first: message.first || offset,
        n: message.n || pageSize,
        raw: data,
        url,
        ms
      };
      log.debug(`Fetched reviews page ref=${refNum} host=${host.replace(/^https?:\/\//,'')} offset=${offset} got=${out.reviews.length} ms=${ms}`);
      return out;
    } catch (e) {
      lastErr = e;
      const ms = Date.now() - t0;
      const status = e?.response?.status;
      let snippet = '';
      if (logSnippet && e?.response && e.response.data) {
        try {
          if (typeof e.response.data === 'string') snippet = e.response.data.slice(0, 400).replace(/\s+/g,' ').trim();
          else snippet = JSON.stringify(e.response.data).slice(0, 400);
        } catch {}
      }
      log.warn(`[reviews] fetch failed ref=${refNum} host=${host.replace(/^https?:\/\//,'')} status=${status || e.code || 'ERR'} offset=${offset} ms=${ms}${snippet?` snippet="${snippet}"`:''}`);
      // Retry on next host only if server error (>=500) or network error (no response)
      if (!(status >= 500 || !status)) {
        break; // do not try alternate host for 4xx
      }
    }
  }
  throw lastErr || new Error('Failed to fetch reviews after host fallback');
}

module.exports = { fetchReviewsPage };
