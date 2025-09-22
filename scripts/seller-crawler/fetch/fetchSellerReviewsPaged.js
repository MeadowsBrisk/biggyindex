const log = require('../../item-crawler/util/logger');
const { fetchUserReviewsPage } = require('./fetchUserReviewsPage');

// Fetch recent reviews for sellerRef up to maxStore using pageSize.
// Returns { reviews, sourceFetched, meta }
async function fetchSellerReviewsPaged({ client, sellerId, pageSize = 100, maxStore = 300, retries = 3 }) {
  let reviews = [];
  let offset = 0;
  let totalFetched = 0;
  const pagesMeta = [];
  while (reviews.length < maxStore) {
    let lastErr = null;
    let page = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const t0 = Date.now();
        page = await fetchUserReviewsPage({ client, sellerId, offset, pageSize });
        log.debug(`[sellerReviews] sellerId=${sellerId} offset=${offset} got=${page.reviews.length} ms=${Date.now() - t0}`);
        break;
      } catch (e) {
        lastErr = e;
        const status = e?.response?.status;
        log.warn(`[sellerReviews] ref=${sellerRef} attempt=${attempt} failed status=${status || e.code || 'ERR'} msg=${e.message}`);
        if (attempt < retries) await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
    if (!page) throw lastErr || new Error('seller reviews fetch failed');
    const got = page.reviews.length;
    totalFetched += got;
    const hasItem = page.reviews.some(r => r && r.item && (r.item.refNum || r.item.id || r.item.name));
    pagesMeta.push({ url: page.url, count: got, hasItem });
    if (!got) break;
    for (const r of page.reviews) {
      // pass through raw; normalization happens upstream if desired, but we already normalized in item crawler
      reviews.push(r);
      if (reviews.length >= maxStore) break;
    }
    if (got < pageSize) break; // exhausted
    offset += got;
  }
  return { reviews, sourceFetched: totalFetched, meta: { fetched: reviews.length, sourceFetched: totalFetched, pageSizeRequested: pageSize, mode: 'paged', pages: pagesMeta } };
}

module.exports = { fetchSellerReviewsPaged };


