import type { AxiosInstance } from "axios";
import type { MarketCode } from "../../shared/types";
import { getLocationTokens } from "./details";
import { seedLocationFilterCookie } from "../../shared/http/lfCookie";
import { setLocationFilter } from "../../shared/fetch/setLocationFilter";

// Unified shipping extractor
import { extractShippingHtml } from "../../shared/parse/shippingHtmlExtractor";

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
    // Use EXACT legacy crawler sequence
    const warnings: string[] = [];
    
    // Step 1: Get location tokens (legacy pattern)
    let tokens: any = {};
    try {
      const tokensRes = await getLocationTokens(client, refNum);
      tokens = (tokensRes && tokensRes.ok && tokensRes.tokens) ? tokensRes.tokens : {};
    } catch {}
    
    // Step 2: Set location filter with tokens (legacy pattern)
    try {
      const lfResult = await setLocationFilter({ client, shipsTo: market, tokens });
      warnings.push(lfResult.ok ? 'lf_ok' : 'lf_failed');
    } catch {
      warnings.push('lf_error');
    }
    
    // Step 3: Short settle then fetch (reduced delay)
    await new Promise((r) => setTimeout(r, 50));
    
    // Use unified fetchItemPage and shippingHtmlExtractor
    const { fetchItemPage } = await import("../../shared/fetch/fetchItemPage");
    let page = await fetchItemPage({ client, refNum, shipsTo: market, maxBytes: 2_000_000, earlyAbort: true, earlyAbortMinBytes: 50_000 });
    let parsed = extractShippingHtml(page?.html || "");
    

    
    // Legacy-style retry if no options
    if (!parsed.options || parsed.options.length === 0) {
      warnings.push("retry");
      await new Promise((r) => setTimeout(r, 500));
      // Retry fetch with larger limits if first attempt failed
      page = await fetchItemPage({ client, refNum, shipsTo: market, maxBytes: 5_000_000, earlyAbort: false, earlyAbortMinBytes: 8192 });
      parsed = extractShippingHtml(page?.html || "");
    }
    const ms = Date.now() - t0;
    return { ok: true, market, refNum, options: parsed.options || [], warnings: [...(parsed.warnings || []), ...warnings], ms };
  } catch (e: any) {
    return { ok: false, market, refNum, error: e?.message || String(e) };
  }
}
