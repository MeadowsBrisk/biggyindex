// Deterministic blob key builders used across workflows
export const Keys = {
  shared: {
    itemCore: (id: string) => `items/${id}.json`,
    itemIds: () => `items/_ids.json`,
    seller: (id: string) => `sellers/${id}.json`,
    sellerReviewsCache: () => `sellers/_reviews-cache.json`,
    state: () => `shared/state-global.json`,
    cookies: () => `shared/cookies/jar.json`,
    translation: (id: string) => `translations/${id}.json`,
    aggregates: {
      shares: () => `aggregates/shares.json`,
      indexMeta: () => `aggregates/index-meta.json`,
      shippingMeta: () => `aggregates/shipping-meta.json`,
      sellerState: () => `aggregates/seller-state.json`,
      translationMeta: () => `aggregates/translation-meta.json`,
      translations: () => `aggregates/translations.json`,
      r2Meta: () => `aggregates/r2-meta.json`,
      gifMap: () => `aggregates/gif-map`,
    },
    analytics: {
      sellers: () => `seller-analytics.json`,
      sellersLeaderboard: () => `sellers-leaderboard.json`,
      recentReviews: () => `recent-reviews.json`,
      recentMedia: () => `recent-media.json`,
    },
    images: {
      sellers: () => `seller-images.json`,
    },
  },
  market: {
    index: (code: string) => `indexed_items.json`, // top-level in market store
    manifest: (code: string) => `data/manifest.json`,
    data: {
      itemImageLookup: () => `data/item-image-lookup.json`,
      recentItems: () => `data/recent-items.json`,
    },
    shipping: (id: string) => `market-shipping/${id}.json`,
    state: () => `state.json`,
    snapshotMeta: () => `snapshot_meta.json`,
    aggregates: {
      shipSummary: () => `aggregates/ship.json`,
      sellerAnalytics: () => `aggregates/seller-analytics.json`,
      sellersLeaderboard: () => `aggregates/sellers-leaderboard.json`,
      recentReviews: () => `aggregates/recent-reviews.json`,
      recentMedia: () => `aggregates/recent-media.json`,
      // Pricing aggregates for price-per-gram sorting
      pricingSummary: () => `aggregates/pricing/summary.json`,
      pricingByWeight: (weight: number) => `aggregates/pricing/${weight}g.json`,
    },
  },
  runMeta: {
    market: (code: string) => `run-meta/${code}.json`,
    global: () => `run-meta/global.json`,
  },
};
