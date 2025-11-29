import type { AxiosInstance } from "axios";
import type { MarketCode } from "../../shared/types";
import { seedLocationFilterCookie, getLocationFilterCookie } from "../../shared/http/lfCookie";

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

/**
 * Create an isolated HTTP client with a fresh cookie jar pre-seeded for a specific market.
 * This prevents cookie conflicts when fetching shipping in parallel.
 */
async function createMarketClient(market: MarketCode): Promise<AxiosInstance> {
  const [{ CookieJar }, httpMod, axios] = await Promise.all([
    import("tough-cookie"),
    import("http-cookie-agent/http"),
    import("axios"),
  ]);
  const { HttpCookieAgent, HttpsCookieAgent } = httpMod as any;
  const jar = new CookieJar();
  
  // Pre-seed the location filter cookie for this market
  const lfVal = getLocationFilterCookie(market);
  if (lfVal) {
    const cookieStr = `lf=${lfVal}; Domain=.littlebiggy.net; Path=/`;
    try { jar.setCookieSync(cookieStr, "https://littlebiggy.net"); } catch {}
    try { jar.setCookieSync(cookieStr, "https://www.littlebiggy.net"); } catch {}
  }
  
  const client = axios.default.create({
    httpAgent: new HttpCookieAgent({ cookies: { jar } }),
    httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
    withCredentials: true,
    timeout: 30000,
    headers: { "User-Agent": "UnifiedCrawler/Shipping" },
    validateStatus: (s: number) => s >= 200 && s < 300,
  });
  (client as any).__jar = jar;
  return client;
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

/**
 * Extract shipping for multiple markets in parallel using isolated per-market clients.
 * Each market gets its own cookie jar with pre-seeded location filter to avoid conflicts.
 * 
 * Expected speedup: 5 markets sequential (~25s) → parallel (~5-6s)
 */
export async function extractAllMarketsShippingParallel(
  refNum: string,
  markets: MarketCode[]
): Promise<Map<MarketCode, MarketShippingResult>> {
  const results = new Map<MarketCode, MarketShippingResult>();
  
  const promises = markets.map(async (market) => {
    // Create isolated client per market with pre-seeded LF cookie
    const client = await createMarketClient(market);
    const result = await extractMarketShipping(client, refNum, market);
    return { market, result };
  });
  
  const settled = await Promise.allSettled(promises);
  
  for (const res of settled) {
    if (res.status === 'fulfilled') {
      results.set(res.value.market, res.value.result);
    } else {
      // Log but don't fail the whole batch
      const market = (res.reason as any)?.market;
      if (market) {
        results.set(market, { ok: false, market, refNum, error: res.reason?.message || 'unknown' });
      }
    }
  }
  
  return results;
}
