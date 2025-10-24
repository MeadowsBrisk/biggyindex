import type { MarketCode, IndexResult } from "../../shared/types";
import { createLogger } from "../../shared/logging/logger";
import { loadEnv } from "../../shared/env/loadEnv";
import { ACCEPT_LANGUAGE, marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import axios from "axios";
import { createCookieHttp, warmCookieJar } from "../../shared/http/client";
import { saveCookieJar } from "../../shared/http/cookies";

/**
 * runIndexMarket — Unified TS indexer stage (Phase A skeleton)
 * Contract: return counts and known artifacts; do not change blob key schemas.
 * Future: implement full fetch → normalize → categorize → persist for market.
 */
export async function runIndexMarket(code: MarketCode): Promise<IndexResult> {
  const env = loadEnv();
  const logger = createLogger();
  if (!env.markets.includes(code)) {
    logger.warn(`[index:${code}] Market not enabled in config; skipping.`);
    return { ok: true, market: code, counts: { items: 0, sellers: 0 }, artifacts: [] };
  }

  // Phase A1: minimal fetch + snapshot meta write (no schema changes yet)
  const storeName = marketStore(code, env.stores as any);
  const blob = getBlobClient(storeName);

  // Use a browser-like UA to avoid upstream filtering; keep our tag at the end for traceability
  const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 UnifiedCrawler/PhaseA`;
  const headers = {
    "Accept-Language": ACCEPT_LANGUAGE[code],
    "Accept": "application/json, text/plain, */*",
    "User-Agent": ua,
  } as Record<string, string>;

  const hostOverride = process.env.LB_ENDPOINT;
  const candidates = [
    hostOverride ? `${hostOverride.replace(/\/$/, "")}/core/api/items-wall/?shipsTo=${code}` : null,
    `https://littlebiggy.net/core/api/items-wall/?shipsTo=${code}`,
    `https://www.littlebiggy.net/core/api/items-wall/?shipsTo=${code}`,
  ].filter(Boolean) as string[];

  let itemsCount = 0;
  let rawItems: any[] = [];
  let chosen: string | null = null;
  logger.info(`[index:${code}] Starting fetch: trying ${candidates.length} endpoints...`);
  // Build an axios client with cookie jar via shared HTTP factory
  let client = axios as any;
  let jar: any | undefined;
  try {
    const { client: c, jar: j } = await createCookieHttp({
      headers: {
        "User-Agent": ua,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": ACCEPT_LANGUAGE[code],
        Referer: "https://littlebiggy.net/",
        Origin: "https://littlebiggy.net",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    client = c;
    jar = j;
  } catch {
    client = axios.create({ headers, timeout: 30000 });
  }

  for (const url of candidates) {
    try {
      // Warm the jar with a non-API GET to set cookies (like legacy)
  await warmCookieJar(client, url);
      logger.info(`[index:${code}] GET ${url}`);
      const res = await client.get(url, { responseType: "json" });
      logger.info(`[index:${code}] ← ${res.status} ${url}`);
      const data = res.data;
      const message = data?.data?.message || data?.message || data;
      const items = message?.items || [];
      if (Array.isArray(items)) {
        itemsCount = items.length;
        rawItems = items;
        chosen = url;
        logger.info(`[index:${code}] Selected source ${url} with ${itemsCount} items.`);
        break;
      }
    } catch (e: any) {
      logger.warn(`[index:${code}] endpoint failed ${url}: ${e?.message || e}`);
      continue;
    }
  }

  const snapshotMeta = {
    updatedAt: new Date().toISOString(),
    itemsCount,
    source: chosen || null,
    version: Date.now().toString(36),
  };
  const key = Keys.market.snapshotMeta();
  await blob.putJSON(key, snapshotMeta);
  logger.info(`[index:${code}] Wrote ${key} (itemsCount=${itemsCount}) in store "${storeName}".`);

  // Also write a minimal manifest to market store (safe, additive for Phase A)
  const manifest = {
    updatedAt: snapshotMeta.updatedAt,
    itemsCount,
    market: code,
    version: snapshotMeta.version,
  } as const;
  const manifestKey = Keys.market.manifest(code);
  await blob.putJSON(manifestKey, manifest);
  logger.info(`[index:${code}] Wrote ${manifestKey}.`);

  // Write a lightweight market index with minified fields and normalized variants (USD/BTC)
  const marketIndexItems = (Array.isArray(rawItems) ? rawItems : []).map((it: any) => {
    // Prefer refNum as canonical ID; fall back to numeric id if missing
    const ref = it?.refNum ?? it?.refnum ?? it?.ref;
    const numId = it?.id;
    const id = ref ? String(ref) : (numId != null ? String(numId) : undefined);
    if (!id) return null;
    const name = it?.name;
    const images: string[] = Array.isArray(it?.images) ? it.images : [];
    const primaryImg = images[0] || undefined;
    const imgSmall = images.length ? images.slice(0, 3) : undefined;

    // Normalize varieties into compact variant entries with USD/BTC
    const varieties: any[] = Array.isArray(it?.varieties) ? it.varieties : [];
    const v = varieties.map((vv: any) => {
      const usdStr = vv?.basePrice?.amount ?? vv?.basePrice?.value ?? undefined;
      const usd = typeof usdStr === "string" ? parseFloat(usdStr) : (typeof usdStr === "number" ? usdStr : undefined);
      const d = vv?.description;
      const vid = vv?.id;
      const out: Record<string, unknown> = {};
      if (vid != null) out.vid = vid;
      if (d) out.d = d;
      if (typeof usd === "number" && Number.isFinite(usd)) out.usd = usd;
      return out;
    }).filter((o: any) => Object.keys(o).length > 0);

    // Compute USD price bounds
    const usdVals = v.map((x: any) => x.usd).filter((n: any) => typeof n === "number" && Number.isFinite(n)) as number[];
    const uMin = usdVals.length ? Math.min(...usdVals) : undefined;
    const uMax = usdVals.length ? Math.max(...usdVals) : undefined;

    // Seller minimal info
    const sid = it?.seller?.id ?? it?.sellerId;
    const sn = it?.seller?.name;
    const h = it?.hotness;
    const sf = it?.shipsFrom ?? it?.ships_from;

  const entry: Record<string, unknown> = { id };
    if (name) entry.n = name;
    if (primaryImg) entry.i = primaryImg;
    if (imgSmall && imgSmall.length) entry.is = imgSmall;
    if (v.length) entry.v = v;
    if (uMin != null) entry.uMin = uMin;
    if (uMax != null) entry.uMax = uMax;
    if (sid != null) entry.sid = sid;
    if (sn) entry.sn = sn;
    if (h != null) entry.h = h;
    if (sf) entry.sf = sf;
    return entry;
  }).filter(Boolean) as Array<Record<string, unknown>>;
  const indexKey = Keys.market.index(code);
  if (marketIndexItems.length > 0) {
    await blob.putJSON(indexKey, marketIndexItems);
    logger.info(`[index:${code}] Wrote ${indexKey} (${marketIndexItems.length} items).`);
  } else {
    logger.warn(`[index:${code}] No items to write for ${indexKey}; leaving previous data intact.`);
  }

  // Persist cookies for reuse across stages/markets
  try { if (jar) await saveCookieJar(jar); } catch {}

  return {
    ok: true,
    market: code,
    counts: { items: itemsCount, sellers: 0 },
    artifacts: [
      "snapshot_meta.json",
      "data/manifest.json",
      "indexed_items.json",
    ],
    snapshotMeta,
  };
}
