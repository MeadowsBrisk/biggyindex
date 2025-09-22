const log = require('../../item-crawler/util/logger');

// Fetch seller user summary including dispute statistics and ratings summary
// Args: { client, sellerId }
// Returns: { statistics: { percentDisputesOpen, approximateOrders, percentDisputed }, summary: { averageRating, averageDaysToArrive, numberOfReviews } }
async function fetchSellerUserSummary({ client, sellerId }) {
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  let lastErr = null;
  for (const host of hosts) {
    const url = `${host}/core/api/reviews/user/${encodeURIComponent(sellerId)}/summary?requireMedia=false`;
    const t0 = Date.now();
    try {
      const res = await client.get(url, { responseType: 'json' });
      const ms = Date.now() - t0;
      const data = res.data || {};
      const msg = data.message || {};
      const seller = msg.seller || {};
      const statistics = seller.statistics || null;
      const summary = msg.summary || null;
      log.debug(`[sellerSummary] id=${sellerId} host=${host.replace(/^https?:\/\//,'')} ms=${ms}`);
      return { statistics, summary, url };
    } catch (e) {
      lastErr = e;
      const ms = Date.now() - t0;
      const status = e?.response?.status;
      log.warn(`[sellerSummary] fetch failed id=${sellerId} host=${host.replace(/^https?:\/\//,'')} status=${status || e.code || 'ERR'} ms=${ms}`);
      if (!(status >= 500 || !status)) break;
    }
  }
  throw lastErr || new Error('Failed to fetch seller user summary');
}

module.exports = { fetchSellerUserSummary };


