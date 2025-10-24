import type { AxiosInstance } from "axios";

// Reuse proven legacy helpers for parity
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchItemPage } = require("../../../item-crawler/fetch/fetchItemPage");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractDescription } = require("../../../item-crawler/parse/descriptionExtractor");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractLocationTokens } = require("../../../item-crawler/parse/extractLocationTokens");

export interface ItemDescriptionResult {
  ok: boolean;
  refNum: string;
  description?: string;
  meta?: { length?: number; warnings?: string[] };
  ms?: number;
  error?: string;
}

export async function fetchItemDescription(
  client: AxiosInstance,
  refNum: string,
  opts: { shipsTo?: string; maxBytes?: number; timeoutMs?: number } = {}
): Promise<ItemDescriptionResult> {
  try {
    const { shipsTo, maxBytes = 150_000, timeoutMs = 20_000 } = opts;
    const page = await fetchItemPage({
      client,
      refNum,
      shipsTo,
      maxBytes,
      timeout: timeoutMs,
      earlyAbort: true,
      earlyAbortMinBytes: 8192,
    });
    const desc = extractDescription(page?.html || "");
    if (!desc || !desc.description) {
      return { ok: false, refNum, error: "no_description", ms: page?.ms };
    }
    return {
      ok: true,
      refNum,
      description: desc.description,
      meta: desc.meta,
      ms: page?.ms,
    };
  } catch (e: any) {
    return { ok: false, refNum, error: e?.message || String(e) };
  }
}

export interface LocationTokensResult {
  ok: boolean;
  refNum: string;
  tokens?: Record<string, string>;
  error?: string;
}

export async function getLocationTokens(
  client: AxiosInstance,
  refNum: string,
  opts: { timeoutMs?: number } = {}
): Promise<LocationTokensResult> {
  try {
    const { timeoutMs = 20_000 } = opts;
    const page = await fetchItemPage({ client, refNum, timeout: timeoutMs, maxBytes: 80_000, earlyAbort: true, earlyAbortMinBytes: 8192 });
    const tokens = extractLocationTokens(page?.html || "");
    return { ok: true, refNum, tokens };
  } catch (e: any) {
    return { ok: false, refNum, error: e?.message || String(e) };
  }
}
