// decideCrawlKind.js
// Differential recrawl decision: returns 'full' | 'reviews' | 'skip'
// Rules (2025-09 update):
//  - New item (no state record) => full
//  - Mode overrides: env.mode == 'full' => full for all; 'reviews' => reviews for all existing (new still full)
//  - Index change (item.lastUpdatedAt newer than state.lastIndexedUpdatedAt) AND forceFullChanged => full
//  - Otherwise if lastReviewSnapshotAt missing OR older than reviewRefreshHours => reviews
//  - Else skip

function decideCrawlKindDetailed({ item, rec, env, now = Date.now() }) {
  if (!rec) return { kind:'full', reason:'new' };
  if (env.mode === 'full') return { kind:'full', reason:'mode=full' };
  if (env.mode === 'reviews') return { kind:'reviews', reason:'mode=reviews' };
  const indexedUpdatedAt = item.lastUpdatedAt ? Date.parse(item.lastUpdatedAt) : null;
  const lastIndexedKnown = rec.lastIndexedUpdatedAt ? Date.parse(rec.lastIndexedUpdatedAt) : null;
  if (env.forceFullChanged && indexedUpdatedAt && (!lastIndexedKnown || indexedUpdatedAt > lastIndexedKnown)) return { kind:'full', reason:'indexChanged' };
  const lastReview = rec.lastReviewSnapshotAt ? Date.parse(rec.lastReviewSnapshotAt) : null;
  if (!lastReview) return { kind:'reviews', reason:'missingReviewSnapshot' };
  const ageHrs = (now - lastReview) / 3600000;
  if (ageHrs >= env.reviewRefreshHours) return { kind:'reviews', reason:`staleReviews(${ageHrs.toFixed(2)}h)` };
  return { kind:'skip', reason:'fresh' };
}

function decideCrawlKind(opts){ return decideCrawlKindDetailed(opts).kind; }

module.exports = { decideCrawlKind, decideCrawlKindDetailed };
