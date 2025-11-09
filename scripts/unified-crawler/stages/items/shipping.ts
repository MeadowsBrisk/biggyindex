import type { AxiosInstance } from "axios";
import type { MarketCode } from "../../shared/types";
import { getLocationTokens } from "./details";
import { seedLocationFilterCookie } from "../../shared/http/lfCookie";
import { setLocationFilter } from "../../shared/fetch/setLocationFilter";
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
    // If we have a cookie jar and a known LF cookie value for the market, preset it to reduce reliance on token scraping.
    await seedLocationFilterCookie(client, market);
    const warnings: string[] = [];
    // First attempt: rely solely on preseeded lf cookie (skip token scrape/POST)
    // settle delay to ensure LF cookie is applied before fetching page
    const settleMs = market === 'GB' ? 200 : 500;
    await new Promise((r) => setTimeout(r, settleMs));
    // Fetch the item page with shipsTo param after setting filter (unified TS fetcher)
    const { fetchItemPage } = await import("../../shared/fetch/fetchItemPage");
  let page = await fetchItemPage({ client, refNum, shipsTo: market, maxBytes: 180_000, earlyAbort: true, earlyAbortMinBytes: 8192 });
  let parsed = extractShippingHtml(page?.html || "");
    if (!parsed.options || parsed.options.length === 0) {
      // Retry with no early abort and larger window
      warnings.push("retry_noEarlyAbort");
      // Fallback: now do token scrape + LF POST application
      let tokens: any = {};
      try {
        const tokensRes = await getLocationTokens(client, refNum);
        tokens = (tokensRes && tokensRes.ok && tokensRes.tokens) ? tokensRes.tokens : {};
        if (!tokens || Object.keys(tokens).length === 0) warnings.push("lf_tokens_missing_fallback");
      } catch { warnings.push('lf_tokens_error'); }
      try {
        await setLocationFilter({ client, shipsTo: market, tokens });
        warnings.push('lf_repeat');
      } catch {}
      await new Promise((r) => setTimeout(r, settleMs));
  page = await fetchItemPage({ client, refNum, shipsTo: market, maxBytes: 240_000, earlyAbort: false });
      parsed = extractShippingHtml(page?.html || "");
      if ((page as any)?.truncated) warnings.push('truncated_retry');
    }
    if (!parsed.options || parsed.options.length === 0) {
      // Final fallback: fetch without shipsTo param but LF set
      warnings.push("retry_noShipsToParam");
      // Force full text fetch (no maxBytes) with a longer timeout in case the page is heavy
  page = await fetchItemPage({ client, refNum, timeout: 30_000, earlyAbort: false });
      parsed = extractShippingHtml(page?.html || "");
      if ((!parsed.options || parsed.options.length === 0) && (!parsed.warnings || !parsed.warnings.length)) {
        warnings.push('no_shipping_blocks');
      }
    }
    const ms = Date.now() - t0;
    return { ok: true, market, refNum, options: parsed.options || [], warnings: [...(parsed.warnings || []), ...warnings, `settle=${settleMs}`], ms };
  } catch (e: any) {
    return { ok: false, market, refNum, error: e?.message || String(e) };
  }
}
