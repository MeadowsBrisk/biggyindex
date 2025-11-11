import type { AxiosInstance } from "axios";
import type { MarketCode } from "../../shared/types";
import { seedLocationFilterCookie } from "../../shared/http/lfCookie";

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
    const warnings: string[] = [];
    
    // OPTIMIZATION: Use precomputed lf cookie instead of token scraping
    // This eliminates 1 HTML fetch (~4s) and 1 POST (~1s) per market
    await seedLocationFilterCookie(client, market);
    warnings.push('lf_seeded');
    
    // Short settle to allow cookie to take effect
    await new Promise((r) => setTimeout(r, 50));
    
    // Use unified fetchItemPage and shippingHtmlExtractor
    const { fetchItemPage } = await import("../../shared/fetch/fetchItemPage");
    let page = await fetchItemPage({ client, refNum, shipsTo: market, maxBytes: 800_000, earlyAbort: true, earlyAbortMinBytes: 8192 });
    let parsed = extractShippingHtml(page?.html || "");
    

    
    // Legacy-style retry if no options
    if (!parsed.options || parsed.options.length === 0) {
      warnings.push("retry");
      await new Promise((r) => setTimeout(r, 500));
      // Retry fetch with larger limits if first attempt failed
      page = await fetchItemPage({ client, refNum, shipsTo: market, maxBytes: 1_500_000, earlyAbort: false, earlyAbortMinBytes: 8192 });
      parsed = extractShippingHtml(page?.html || "");
    }
    const ms = Date.now() - t0;
    return { ok: true, market, refNum, options: parsed.options || [], warnings: [...(parsed.warnings || []), ...warnings], ms };
  } catch (e: any) {
    return { ok: false, market, refNum, error: e?.message || String(e) };
  }
}
