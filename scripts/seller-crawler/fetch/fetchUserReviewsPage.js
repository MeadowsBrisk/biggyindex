const log = require('../../item-crawler/util/logger');

// Fetch a page of seller (user) received reviews
// Args: { client, sellerId, offset=0, pageSize=100 }
// Returns { reviews, first, n, raw, url, ms }
async function fetchUserReviewsPage({ client, sellerId, offset = 0, pageSize = 100 }) {
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  let lastErr = null;
  for (const host of hosts) {
    const url = `${host}/core/api/reviews/user/${encodeURIComponent(sellerId)}/received?first=${offset}&n=${pageSize}&requireMedia=false`;
    const t0 = Date.now();
    try {
      const res = await client.get(url, { responseType: 'json' });
      const ms = Date.now() - t0;
      const data = res.data || {};
      const message = data.message || {};
      const out = {
        reviews: Array.isArray(message.reviews) ? message.reviews : [],
        first: message.first || offset,
        n: message.n || pageSize,
        raw: data,
        url,
        ms
      };
      log.debug(`[userReviews] sellerId=${sellerId} host=${host.replace(/^https?:\/\//,'')} offset=${offset} got=${out.reviews.length} ms=${ms}`);
      return out;
    } catch (e) {
      lastErr = e;
      const ms = Date.now() - t0;
      const status = e?.response?.status;
      log.warn(`[userReviews] fetch failed sellerId=${sellerId} host=${host.replace(/^https?:\/\//,'')} status=${status || e.code || 'ERR'} offset=${offset} ms=${ms}`);
      if (!(status >= 500 || !status)) break;
    }
  }
  throw lastErr || new Error('Failed to fetch user received reviews');
}

module.exports = { fetchUserReviewsPage };


