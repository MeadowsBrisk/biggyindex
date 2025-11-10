// Wrapper to call the existing indexer with a market context (Phase A)
import type { MarketCode, IndexResult } from "../shared/types";
import { runIndexMarket } from "../stages/index/run";

export async function indexMarket(code: MarketCode): Promise<IndexResult> {
  // Phase A pivot: Use the new unified-crawler TS stage (contained here) for all markets.
  return await runIndexMarket(code);
}
