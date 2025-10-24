// Global and per-market state helpers (stub)
import { getBlobClient } from "./blobs";
import { Keys } from "./keys";

export interface GlobalState {
  lastFullCrawl?: string;
  lastReviewsRefresh?: string;
}

export async function loadGlobalState(store: string): Promise<GlobalState> {
  const client = getBlobClient(store);
  return (await client.getJSON<GlobalState>(Keys.shared.state())) || {};
}

export async function saveGlobalState(store: string, s: GlobalState) {
  const client = getBlobClient(store);
  await client.putJSON(Keys.shared.state(), s);
}
