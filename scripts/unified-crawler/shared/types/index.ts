// Shared types for the unified crawler (stub)
export type MarketCode = "GB" | "DE" | "FR";

export interface ItemCore {
  id: string;
  name?: string;
}

export interface GlobalState {
  lastFullCrawl?: string;
  lastReviewsRefresh?: string;
}

export interface RunMetaEntry {
  at: string;
  scope: string;
  counts?: Record<string, number>;
  error?: { message: string; code?: string };
}

export interface IndexResult {
  ok: boolean;
  market: MarketCode;
  counts?: Record<string, number>;
  artifacts?: string[];
  snapshotMeta?: Record<string, unknown>;
}
