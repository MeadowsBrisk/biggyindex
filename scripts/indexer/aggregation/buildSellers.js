const { buildSellerUrl } = require('../util/urls');

function buildSellers(processedItems, sellerReviewSummaries) {
  const sellerCounts = new Map();
  for (const i of processedItems) {
    const key = (i?.sellerId != null) ? `id:${i.sellerId}` : `name:${i?.sellerName || ''}`;
    sellerCounts.set(key, (sellerCounts.get(key) || 0) + 1);
  }
  const sellersMap = new Map();
  for (const i of processedItems) {
    const sid = i?.sellerId ?? null;
    const sname = i?.sellerName ?? '';
    const key = sid != null ? `id:${sid}` : `name:${sname}`;
    if (!sellersMap.has(key)) {
      const stats = sid != null ? sellerReviewSummaries?.[String(sid)] : null;
      sellersMap.set(key, {
        id: sid,
        name: sname,
        url: buildSellerUrl(sname, sid),
        online: i.sellerOnline || null,
        itemsCount: sellerCounts.get(key) || 0,
        averageRating: stats?.averageRating ?? null,
        averageDaysToArrive: stats?.averageDaysToArrive ?? null,
        numberOfReviews: stats?.numberOfReviews ?? null,
      });
    } else {
      const existing = sellersMap.get(key);
      if (i.sellerOnline === 'today' && existing.online !== 'today') existing.online = 'today';
    }
  }
  const sellers = Array.from(sellersMap.values()).sort((a, b) => {
    const ar = (b.numberOfReviews || 0) - (a.numberOfReviews || 0);
    if (ar !== 0) return ar;
    return (a.name || '').localeCompare(b.name || '');
  });
  return sellers;
}

module.exports = { buildSellers };