function buildItemUrl(item) {
  const candidate = item?.url || item?.href || item?.link;
  if (typeof candidate === 'string' && candidate.startsWith('http')) return candidate;
  const ref = item?.refNum || item?.id || item?.name || '';
  const q = typeof ref === 'string' ? ref : String(ref);
  return `https://littlebiggy.net/items-wall?shipsTo=GB&search=${encodeURIComponent(q)}`;
}

function buildSellerUrl(sellerName, sellerId) {
  if (sellerId) return `https://littlebiggy.net/viewSubject/p/${encodeURIComponent(String(sellerId))}`;
  if (sellerName) return `https://littlebiggy.net/seller/${encodeURIComponent(sellerName)}`;
  return 'https://littlebiggy.net';
}

module.exports = { buildItemUrl, buildSellerUrl };