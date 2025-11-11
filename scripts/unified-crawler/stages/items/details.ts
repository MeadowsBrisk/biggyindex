import type { AxiosInstance } from "axios";

// Unified implementations
import { fetchItemPage } from "../../shared/fetch/fetchItemPage";
import { extractDescription } from "../../shared/parse/descriptionExtractor";
import { extractLocationTokens } from "../../shared/parse/extractLocationTokens";
import { extractShippingHtml } from "../../shared/parse/shippingHtmlExtractor";

export interface ItemDescriptionResult {
  ok: boolean;
  refNum: string;
  description?: string;
  meta?: { length?: number; warnings?: string[] };
  ms?: number;
  error?: string;
  html?: string;
  gbShipping?: { options: Array<{ label: string; cost: number }>; warnings?: string[] };
}

export async function fetchItemDescription(
  client: AxiosInstance,
  refNum: string,
  opts: { shipsTo?: string; maxBytes?: number; timeoutMs?: number } = {}
): Promise<ItemDescriptionResult> {
  try {
    const { shipsTo, maxBytes = 100_000, timeoutMs = 20_000 } = opts;
    const page = await fetchItemPage({
      client,
      refNum,
      shipsTo,
      maxBytes,
      timeout: timeoutMs,
      earlyAbort: true,
      earlyAbortMinBytes: 8192,
    });
    const rawHtml = page?.html || "";
    const desc = extractDescription(rawHtml);
    if (!desc || !desc.description) {
      return { ok: false, refNum, error: "no_description", ms: page?.ms, html: rawHtml };
    }
    
    // OPTIMIZATION: Extract GB shipping from description HTML if shipsTo=GB
    // This eliminates the need for a separate shipping fetch for GB market
    let gbShipping: { options: Array<{ label: string; cost: number }>; warnings?: string[] } | undefined;
    if (shipsTo === 'GB' || !shipsTo) {
      const shipResult = extractShippingHtml(rawHtml);
      if (shipResult.options && shipResult.options.length > 0) {
        gbShipping = {
          options: shipResult.options,
          warnings: shipResult.warnings
        };
      }
    }
    
    return {
      ok: true,
      refNum,
      description: desc.description,
      meta: desc.meta,
      ms: page?.ms,
      html: rawHtml,
      gbShipping,
    };
  } catch (e: any) {
    return { ok: false, refNum, error: e?.message || String(e) };
  }
}

export interface LocationTokensResult {
  ok: boolean;
  refNum: string;
  tokens?: { [k: string]: string };
  error?: string;
}

export async function getLocationTokens(
  client: AxiosInstance,
  refNum: string,
  opts: { timeoutMs?: number } = {}
): Promise<LocationTokensResult> {
  try {
    const { timeoutMs = 20_000 } = opts;
    // First attempt: fast streaming fetch
    let page = await fetchItemPage({ client, refNum, timeout: timeoutMs, maxBytes: 100_000, earlyAbort: true, earlyAbortMinBytes: 8192 });
    let tokensObj = extractLocationTokens(page?.html || "");
    let tokens: { [k: string]: string } | undefined = undefined;
    if (tokensObj && (tokensObj._sourcePage || tokensObj.__fp)) {
      tokens = {};
      if (tokensObj._sourcePage) tokens._sourcePage = tokensObj._sourcePage;
      if (tokensObj.__fp) tokens.__fp = tokensObj.__fp;
    }
    if (!tokens || Object.keys(tokens || {}).length === 0) {
      // Fallback: full fetch (no early abort) to ensure hidden inputs are captured
      page = await fetchItemPage({ client, refNum, timeout: timeoutMs, maxBytes: 180_000, earlyAbort: false });
      tokensObj = extractLocationTokens(page?.html || "");
      if (tokensObj && (tokensObj._sourcePage || tokensObj.__fp)) {
        tokens = {};
        if (tokensObj._sourcePage) tokens._sourcePage = tokensObj._sourcePage;
        if (tokensObj.__fp) tokens.__fp = tokensObj.__fp;
      }
    }
    return { ok: true, refNum, tokens };
  } catch (e: any) {
    return { ok: false, refNum, error: e?.message || String(e) };
  }
}
