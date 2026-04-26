// Wrapper to call the existing indexer with a market context (Phase A)
import type { MarketCode, IndexResult } from "../shared/types";
import { runIndexMarket, type RunIndexMarketOptions } from "../stages/index/run";

export async function indexMarket(code: MarketCode, opts?: RunIndexMarketOptions): Promise<IndexResult> {
  // Phase A pivot: Use the new unified-crawler TS stage (contained here) for all markets.
  return await runIndexMarket(code, opts);
}
