// Deterministic blob key builders used across workflows
export const Keys = {
  shared: {
    itemCore: (id: string) => `items/core/${id}.json`,
    seller: (id: string) => `sellers/${id}.json`,
    state: () => `shared/state-global.json`,
    cookies: () => `shared/cookies/jar.json`,
  },
  market: {
    index: (code: string) => `indexed_items.json`, // top-level in market store
    manifest: (code: string) => `data/manifest.json`,
    shipping: (id: string) => `market-shipping/${id}.json`,
    state: () => `state.json`,
    analytics: (suffix: string) => `analytics/${suffix}`,
    snapshotMeta: () => `snapshot_meta.json`,
  },
  runMeta: {
    market: (code: string) => `run-meta/${code}.json`,
    global: () => `run-meta/global.json`,
  },
};
