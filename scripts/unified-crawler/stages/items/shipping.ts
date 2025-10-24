import type { AxiosInstance } from "axios";
import type { MarketCode } from "../../shared/types";
import { getLocationTokens } from "./details";

// Legacy helpers for parity
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setLocationFilter } = require("../../../item-crawler/fetch/setLocationFilter");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractShippingHtml } = require("../../../item-crawler/parse/shippingHtmlExtractor");

export interface MarketShippingResult {
  ok: boolean;
  market: MarketCode;
  refNum: string;
  options?: Array<{ label: string; cost: number }>;
  warnings?: string[];
  ms?: number;
  error?: string;
}

export async function extractMarketShipping(
  client: AxiosInstance,
  refNum: string,
  market: MarketCode
): Promise<MarketShippingResult> {
  const t0 = Date.now();
  try {
    // Fetch minimal page to extract tokens
    const tokensRes = await getLocationTokens(client, refNum);
    const tokens = (tokensRes && tokensRes.ok && tokensRes.tokens) ? tokensRes.tokens : {};
    // Set the location filter for the market
    try {
      await setLocationFilter({ client, shipsTo: market, tokens });
    } catch {}
    // Fetch the item page with shipsTo param after setting filter
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchItemPage } = require("../../../item-crawler/fetch/fetchItemPage");
    const page = await fetchItemPage({ client, refNum, shipsTo: market, maxBytes: 160_000, earlyAbort: true, earlyAbortMinBytes: 8192 });
    const parsed = extractShippingHtml(page?.html || "");
    const ms = Date.now() - t0;
    return { ok: true, market, refNum, options: parsed.options || [], warnings: parsed.warnings || [], ms };
  } catch (e: any) {
    return { ok: false, market, refNum, error: e?.message || String(e) };
  }
}
