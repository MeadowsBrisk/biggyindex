import type { MarketCode } from "../../shared/types";
import type { AxiosInstance } from "axios";
import { loadEnv } from "../../shared/env/loadEnv";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { createCookieHttp } from "../../shared/http/client";
import { saveCookieJar } from "../../shared/http/cookies";
import { login } from "../../shared/auth/login";
import { buildItemsWorklist as buildWorklist } from "../../shared/logic/dedupe";
import { ensureAuthedClient, fetchFirstReviews } from "./reviews";
import { fetchItemDescription } from "./details";
import { extractMarketShipping } from "./shipping";

export interface ItemsGlobalResult {
  ok: boolean;
  markets: MarketCode[];
  counts: { itemsPlanned: number; uniqueItems: number; toCrawl: number };
  sample?: Array<{ id: string; n?: string; market: MarketCode }>; // light sample for observability
}

export interface ItemsWorklist {
  uniqueIds: string[];
  toCrawl: Array<{ id: string; markets: string[] }>;
  alreadyHave: Array<{ id: string; markets: string[] }>;
  sample: Array<{ id: string; n?: string; market: MarketCode }>;
  presenceMap: Map<string, Set<MarketCode>>;
  client: AxiosInstance;
  counts: { itemsPlanned: number; uniqueItems: number; toCrawl: number };
}

/**
 * Build items worklist: authenticate, aggregate indexes, dedupe, create round-robin sample
 */
export async function buildItemsWorklist(markets: MarketCode[]): Promise<ItemsWorklist> {
  const env = loadEnv();
  const enabled = markets.filter((m) => env.markets.includes(m));

  // Establish an authenticated client (reuses persisted cookies; logs in if creds set)
  let jar: any | undefined;
  let authedClientRef: any | undefined;
  try {
    const { client: authedClient, jar: j } = await ensureAuthedClient();
    authedClientRef = authedClient;
    // simple probe (best-effort)
    try { await authedClient.get("https://littlebiggy.net/core/api/auth/profile", { timeout: 8000 }); } catch {}
    jar = j;
  } catch {}
  try { if (jar) await saveCookieJar(jar); } catch {}

  if (!authedClientRef) {
    throw new Error("[items] Failed to establish authenticated client");
  }

  // Collect items from each market index
  let itemsPlanned = 0;
  const indexes: Array<{ market: MarketCode; items: Array<{ id: string; n?: string }> }> = [];
  for (const code of enabled) {
    const storeName = (env.stores as any)[code];
    const blob = getBlobClient(storeName);
    const index = (await blob.getJSON<any[]>(Keys.market.index(code))) || [];
    const list = Array.isArray(index) ? index : [];
    itemsPlanned += list.length;
    indexes.push({ market: code, items: list.map(it => ({ id: String(it?.id ?? it?.refNum ?? it?.ref ?? "").trim(), n: it?.n || it?.name })) });
  }

  // Build presence map: itemId -> set of markets where this item appears
  const presenceById = new Map<string, Set<MarketCode>>();
  for (const { market, items } of indexes) {
    for (const it of items) {
      const id = it.id;
      if (!id) continue;
      if (!presenceById.has(id)) presenceById.set(id, new Set());
      presenceById.get(id)!.add(market);
    }
  }

  // Deduplicate across markets before any real crawl
  const sharedClient = getBlobClient(env.stores.shared);
  const existingCoreKeys = await sharedClient.list("items/core/");
  const existingCoreIds = new Set(
    existingCoreKeys
      .map((k) => (k.match(/^items\/core\/(.+)\.json$/)?.[1] || "").trim())
      .filter(Boolean)
  );
  const work = buildWorklist({ indexes, existingCoreIds });

  // Build round-robin sample across markets up to sampleLimit
  const sampleLimit = Math.max(0, env.itemsSampleLimit || 0);
  const sample: Array<{ id: string; n?: string; market: MarketCode }> = [];
  if (sampleLimit > 0) {
    const iters: Record<MarketCode, number> = Object.fromEntries(enabled.map((m) => [m, 0])) as any;
    let progressed = true;
    while (sample.length < sampleLimit && progressed) {
      progressed = false;
      for (const code of enabled) {
        if (sample.length >= sampleLimit) break;
        const marketEntry = indexes.find((e) => e.market === code);
        if (!marketEntry) continue;
        const i = iters[code] || 0;
        if (i >= marketEntry.items.length) continue;
        const it = marketEntry.items[i];
        iters[code] = i + 1;
        if (!it?.id) continue;
        sample.push({ id: it.id, n: it.n, market: code });
        progressed = true;
      }
    }
  }

  if (sample.length) {
    console.info(`[items] sample (${sample.length}/${itemsPlanned})`, sample.map(s => `${s.market}:${s.id}`).join(", "));
  } else {
    console.info(`[items] planned only: ${itemsPlanned} (set CRAWLER_ITEMS_SAMPLE to log a small sample)`);
  }

  console.info(`[items] dedupe unique=${work.uniqueIds.length} toCrawl=${work.toCrawl.length} alreadyHave=${work.alreadyHave.length}`);

  return {
    uniqueIds: work.uniqueIds,
    toCrawl: work.toCrawl,
    alreadyHave: work.alreadyHave,
    sample,
    presenceMap: presenceById,
    client: authedClientRef,
    counts: { itemsPlanned, uniqueItems: work.uniqueIds.length, toCrawl: work.toCrawl.length },
  };
}
