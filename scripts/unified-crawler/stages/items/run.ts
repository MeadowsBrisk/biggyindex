import type { MarketCode } from "../../shared/types";
import { loadEnv } from "../../shared/env/loadEnv";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { createCookieHttp } from "../../shared/http/client";
import { saveCookieJar } from "../../shared/http/cookies";
import { login } from "../../shared/auth/login";
import { buildItemsWorklist } from "../../shared/logic/dedupe";
import { ensureAuthedClient, fetchFirstReviews } from "./reviews";
import { fetchItemDescription } from "./details";
import { extractMarketShipping } from "./shipping";

export interface ItemsGlobalResult {
  ok: boolean;
  markets: MarketCode[];
  counts: { itemsPlanned: number; uniqueItems: number; toCrawl: number };
  sample?: Array<{ id: string; n?: string; market: MarketCode }>; // light sample for observability
}

// Minimal items stage skeleton: authenticate (reuse persisted cookies if possible),
// read market indexes to build a worklist (no heavy crawling yet).
export async function runItemsGlobal(markets: MarketCode[]): Promise<ItemsGlobalResult> {
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

  // Collect items from each market index and build a small cross-market sample
  let itemsPlanned = 0;
  const sample: Array<{ id: string; n?: string; market: MarketCode }> = [];
  const sampleLimit = Math.max(0, env.itemsSampleLimit || 0);
  const indexes: Array<{ market: MarketCode; items: Array<{ id: string; n?: string }> }> = [];
  for (const code of enabled) {
    const storeName = (env.stores as any)[code];
    const blob = getBlobClient(storeName);
    const index = (await blob.getJSON<any[]>(Keys.market.index(code))) || [];
    const list = Array.isArray(index) ? index : [];
    itemsPlanned += list.length;
    indexes.push({ market: code, items: list.map(it => ({ id: String(it?.id ?? it?.refNum ?? it?.ref ?? "").trim(), n: it?.n || it?.name })) });
  }

  // Build a round-robin sample across markets up to sampleLimit
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
  const work = buildItemsWorklist({ indexes, existingCoreIds });

  // Already limited by the round-robin builder above
  const limited = sampleLimit > 0 ? sample : [];
  if (limited.length) {
    // eslint-disable-next-line no-console
    console.info(`[items] sample (${limited.length}/${itemsPlanned})`, limited.map(s => `${s.market}:${s.id}`).join(", "));
  } else {
    // eslint-disable-next-line no-console
    console.info(`[items] planned only: ${itemsPlanned} (set CRAWLER_ITEMS_SAMPLE to log a small sample)`);
  }

  // Report dedupe results
  console.info(`[items] dedupe unique=${work.uniqueIds.length} toCrawl=${work.toCrawl.length} alreadyHave=${work.alreadyHave.length}`);

  // Pilot: fetch first reviews page for a capped subset of toCrawl and write to shared core
  const sharedBlob = sharedClient;
  const targetCount = Math.max(0, env.itemsSampleLimit || 0);
  const targets = work.toCrawl.slice(0, targetCount);
  let processed = 0;
  let descWritten = 0;
  let shippingWritten = 0;
  for (const t of targets) {
    const refNum = t.id;
    try {
      const client = authedClientRef || (await ensureAuthedClient()).client;
      const res = await fetchFirstReviews(client, refNum, Number(process.env.CRAWLER_REVIEW_FETCH_SIZE || 100));
      if (!res.ok) {
        console.warn(`[items] reviews failed id=${refNum} err=${res.error}`);
        // continue to description even if reviews failed
      }
      {
        const key = Keys.shared.itemCore(refNum);
        const existing = (await sharedBlob.getJSON<any>(key)) || {};
        const reviewsArray = res && (res as any).ok && Array.isArray((res as any)?.data?.reviews) ? (res as any).data.reviews : (existing.reviews || []);
        const merged = { ...existing, id: refNum, reviews: reviewsArray, ...(res?.ok ? { lastReviewsRefresh: new Date().toISOString() } : {}) };
        await sharedBlob.putJSON(key, merged);
        processed++;
        if (res?.ok) console.info(`[items] reviews stored id=${refNum} total=${res.total} stored=${res.stored}`);
      }

      // Fetch and store description (shared core) under the same cap
      try {
        const desc = await fetchItemDescription(client, refNum, { maxBytes: 160_000 });
        if (desc.ok && desc.description) {
          const key = Keys.shared.itemCore(refNum);
          const existing = (await sharedBlob.getJSON<any>(key)) || {};
          const merged = { ...existing, id: refNum, description: desc.description, descriptionMeta: desc.meta, lastDescriptionRefresh: new Date().toISOString() };
          await sharedBlob.putJSON(key, merged);
          descWritten++;
          console.info(`[items] description stored id=${refNum} len=${desc?.meta?.length ?? desc.description.length}`);
        } else {
          console.warn(`[items] description failed id=${refNum} err=${desc.error}`);
        }
      } catch (e: any) {
        console.warn(`[items] description error id=${refNum} ${e?.message || e}`);
      }

      // Shipping: fetch per markets where the item appears (GB, DE, FR as present), not all markets blindly
      const marketsForItem = Array.from(presenceById.get(refNum) || []);
      for (const mkt of marketsForItem) {
        try {
          const resShip = await extractMarketShipping(client, refNum, mkt);
          if (!resShip.ok) {
            console.warn(`[items] shipping failed id=${refNum} market=${mkt} err=${resShip.error}`);
            continue;
          }
          const marketStore = (env.stores as any)[mkt];
          const marketBlob = getBlobClient(marketStore);
          const shipKey = Keys.market.shipping(refNum);
          const payload = { id: refNum, market: mkt, options: resShip.options || [], warnings: resShip.warnings || [], lastShippingRefresh: new Date().toISOString() };
          await marketBlob.putJSON(shipKey, payload);
          shippingWritten++;
          console.info(`[items] shipping stored id=${refNum} market=${mkt} options=${payload.options.length}`);
        } catch (e: any) {
          console.warn(`[items] shipping error id=${refNum} market=${mkt} ${e?.message || e}`);
        }
      }
    } catch (e: any) {
      console.warn(`[items] reviews error id=${refNum} ${e?.message || e}`);
    }
  }

  console.info(`[items] pilot reviews processed=${processed}/${targets.length}`);
  console.info(`[items] pilot descriptions stored=${descWritten}/${targets.length}`);
  console.info(`[items] pilot shipping overlays stored=${shippingWritten}`);
  return { ok: true, markets: enabled, counts: { itemsPlanned, uniqueItems: work.uniqueIds.length, toCrawl: work.toCrawl.length }, sample: limited };
}
