import type { MarketCode } from "../../shared/types";

export interface SellersRunResult {
  ok: boolean;
  markets: MarketCode[];
  counts?: { processed?: number };
  note?: string;
}

// Phase A stub: seller crawl stage
// For now, just log intent and return quickly to keep within background function time budget.
export async function runSellers(markets: MarketCode[]): Promise<SellersRunResult> {
  try {
    console.log(`[crawler:sellers] start markets=${markets.join(',')}`);
    // TODO: Implement seller profile fetch + persistence
    console.log(`[crawler:sellers] stub complete`);
    return { ok: true, markets, counts: { processed: 0 }, note: "stub" };
  } catch (e: any) {
    console.error(`[crawler:sellers] error`, e?.message || e);
    return { ok: false, markets, counts: { processed: 0 }, note: e?.message || String(e) } as any;
  }
}
