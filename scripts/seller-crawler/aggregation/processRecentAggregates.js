/**
 * Process and aggregate recent reviews and media for output
 */

/**
 * Process recent review and media candidates into sorted, trimmed lists
 * @param {Object} params
 * @param {Array} params.recentReviewCand - Array of review candidates
 * @param {Array} params.recentMediaCand - Array of media candidates
 * @param {Map} params.sellerNameById - Map of seller IDs to names
 * @param {Set} params.processedSellers - Set of already processed seller IDs
 * @param {Function} params.loadPersistedSellerData - Function to load seller data by ID
 * @param {Object} params.limits - Limit configuration
 * @param {number} params.limits.recentReviewsLimit - Max recent reviews to keep
 * @param {number} params.limits.recentMediaLimit - Max recent media to keep
 * @returns {Promise<Object>} { trimmedReviews: Array, trimmedMedia: Array }
 */
async function processRecentAggregates({
  recentReviewCand,
  recentMediaCand,
  sellerNameById,
  processedSellers,
  loadPersistedSellerData,
  limits,
}) {
  const { recentReviewsLimit = 50, recentMediaLimit = 20 } = limits;

  // Find sellers missing names
  const sellerIdsMissing = new Set();
  for (const entry of recentReviewCand) {
    if (!entry || entry.sellerName) continue;
    sellerIdsMissing.add(entry.sellerId);
  }
  for (const id of recentMediaCand) {
    if (!id || id.sellerName) continue;
    sellerIdsMissing.add(id.sellerId);
  }

  // Load missing seller names from cache
  for (const sellerId of sellerIdsMissing) {
    if (!sellerId || processedSellers.has(sellerId)) continue;
    const cached = await loadPersistedSellerData(sellerId);
    if (cached && cached.sellerName) {
      sellerNameById.set(sellerId, cached.sellerName);
    }
  }

  // Normalize entries by adding missing seller names
  const normalizeEntry = (entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    if (!entry.sellerName && sellerNameById.has(entry.sellerId)) {
      entry.sellerName = sellerNameById.get(entry.sellerId);
    }
    return entry;
  };

  // Sort and trim
  const sortedReviews = recentReviewCand
    .map(normalizeEntry)
    .sort((a, b) => (b.created || 0) - (a.created || 0));
  const sortedMedia = recentMediaCand
    .map(normalizeEntry)
    .sort((a, b) => (b.created || 0) - (a.created || 0));

  const trimmedReviews = sortedReviews.slice(0, recentReviewsLimit);
  const trimmedMedia = sortedMedia.slice(0, recentMediaLimit);

  return { trimmedReviews, trimmedMedia };
}

module.exports = { processRecentAggregates };
