import type { MarketCode } from "../../shared/env/loadEnv";
import type { AxiosInstance } from "axios";
import { loadEnv } from "../../shared/env/loadEnv";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { createCookieHttp } from "../../shared/http/client";
import { buildItemsWorklist as buildWorklist } from "../../shared/logic/dedupe";
import { computeIndexSignature } from "../../shared/logic/changes";
import { buildItemImageLookupFromIndex } from "../../shared/aggregation/buildItemImageLookup";
import { buildRecentItemsCompact } from "../../shared/aggregation/buildRecentItemsCompact";

export interface ItemsGlobalResult {
  ok: boolean;
  markets: MarketCode[];
  counts: { itemsPlanned: number; uniqueItems: number; toCrawl: number };
}

export interface ItemsWorklist {
  uniqueIds: string[];
  toCrawl: Array<{ id: string; markets: string[] }>;
  alreadyHave: Array<{ id: string; markets: string[] }>;
  presenceMap: Map<string, Set<MarketCode>>;
  client: AxiosInstance;
  idSig: Map<string, string>;
  counts: { itemsPlanned: number; uniqueItems: number; toCrawl: number };
}

/**
 * Build items worklist: aggregate indexes, dedupe, create round-robin sample (no auth needed here)
 */
export async function buildItemsWorklist(markets: MarketCode[]): Promise<ItemsWorklist> {
  const env = loadEnv();
  const enabled = markets.filter((m) => env.markets.includes(m));

  // Create a lightweight cookie-enabled HTTP client without logging in; actual auth happens per-item
  const { client: anonClient } = await createCookieHttp({ headers: { "User-Agent": "UnifiedCrawler/Worklist" }, timeoutMs: 10000 });

  // Collect items from each market index
  let itemsPlanned = 0;
  const indexes: Array<{ market: MarketCode; items: Array<{ id: string; n?: string; raw?: any }> }> = [];
  const tIdxStart = Date.now();
  console.info(`[items] reading market indexes for ${enabled.length} markets...`);
  const marketSizes: string[] = [];
  for (const code of enabled) {
    const storeName = (env.stores as any)[code];
    const blob = getBlobClient(storeName);
    const index = (await blob.getJSON<any[]>(Keys.market.index(code))) || [];
    const list = Array.isArray(index) ? index : [];
    itemsPlanned += list.length;
    // Prefer canonical ref-based identifier for dedupe; fall back to numeric id if no ref exists.
    indexes.push({
      market: code,
      items: list.map((it) => ({
        id: String(it?.refNum ?? it?.ref ?? it?.id ?? "").trim(),
        n: it?.n || it?.name,
        raw: it,
      })),
    });
    marketSizes.push(`${code}=${list.length}`);
  }
  console.info(`[items] indexes loaded ${marketSizes.join(' ')} planned=${itemsPlanned} (${Math.max(0, Date.now() - tIdxStart)}ms)`);

  // Build presence map: itemId -> set of markets where this item appears
  const presenceById = new Map<string, Set<MarketCode>>();
  const idSig = new Map<string, string>();
  for (const { market, items } of indexes) {
    for (const it of items) {
      const id = it.id;
      if (!id) continue;
      if (!presenceById.has(id)) presenceById.set(id, new Set());
      presenceById.get(id)!.add(market);
      // Compute/update a global-ish signature from index entry
      try {
        const sig = computeIndexSignature(it.raw || {});
        if (sig && (!idSig.has(id) || idSig.get(id) !== sig)) idSig.set(id, sig);
      } catch {}
    }
  }

  // Build per-market item image lookup + recent-items compact (lightweight) once indexes are loaded.
  // We generate image lookup and a compact recent-items aggregate for the front-end carousel.
  try {
  const MAX_RECENT = Number.parseInt(process.env.RECENT_ITEMS_LIMIT || '120', 10);
    for (const { market, items } of indexes) {
      const storeName = (env.stores as any)[market];
      const blob = getBlobClient(storeName);
      const lookup = buildItemImageLookupFromIndex(items.map(i => i.raw || i));
      // Write lookup only if non-empty for clarity.
      if (Object.keys(lookup.byRef).length || Object.keys(lookup.byId).length) {
        await blob.putJSON(Keys.market.data.itemImageLookup(), lookup);
      }

      // Build compact recent items lists: recently added and recently updated
      try {
        const rawList = items.map(i => (i.raw || i) as any);
        const payload = buildRecentItemsCompact(rawList, MAX_RECENT);
        await blob.putJSON(Keys.market.data.recentItems(), payload);
        
        // Consolidated logging per market
        console.info(`[items] market=${market} lookup=${Object.keys(lookup.byRef).length} recent=${payload.added.length}+${payload.updated.length}`);
      } catch (e: any) {
        console.warn(`[items][warn] recent-items write failed market=${market} reason=${e?.message || e}`);
      }
    }
  } catch (e: any) {
    console.warn(`[items][warn] item-image-lookup write failed reason=${e?.message || e}`);
  }

  // Deduplicate across markets before any real crawl
  const sharedClient = getBlobClient(env.stores.shared);
  // Load existing IDs quickly via cached list if available; otherwise build once and cache
  const tIdsStart = Date.now();
  console.info(`[items] loading existing core IDs...`);
  let existingCoreIds: Set<string>;
  try {
    const cached = await sharedClient.getJSON<string[]>(Keys.shared.itemIds());
    if (Array.isArray(cached) && cached.length) {
      existingCoreIds = new Set(cached.map((s) => String(s).trim()).filter(Boolean));
    } else {
      const existingCoreKeys = await sharedClient.list("items/");
      const ids = existingCoreKeys
        .map((k) => (k.match(/^items\/(.+)\.json$/)?.[1] || "").trim())
        .filter(Boolean);
      existingCoreIds = new Set(ids);
      // Best-effort cache for future runs
      try { await sharedClient.putJSON(Keys.shared.itemIds(), Array.from(existingCoreIds)); } catch {}
    }
  } catch {
    // Fallback: try listing if cache read failed
    const existingCoreKeys = await sharedClient.list("items/");
    const ids = existingCoreKeys
      .map((k) => (k.match(/^items\/(.+)\.json$/)?.[1] || "").trim())
      .filter(Boolean);
    existingCoreIds = new Set(ids);
  }
  console.info(`[items] existing IDs loaded: ${existingCoreIds.size} in ${Math.max(0, Date.now() - tIdsStart)}ms`);
  const work = buildWorklist({ indexes, existingCoreIds });

  // Removed legacy sample-building logic; use explicit --limit in CLI when needed

  console.info(`[items] dedupe unique=${work.uniqueIds.length} toCrawl=${work.toCrawl.length} alreadyHave=${work.alreadyHave.length}`);

  return {
    uniqueIds: work.uniqueIds,
    toCrawl: work.toCrawl,
    alreadyHave: work.alreadyHave,
    presenceMap: presenceById,
    client: anonClient,
    idSig,
    counts: { itemsPlanned, uniqueIds: work.uniqueIds.length, toCrawl: work.toCrawl.length },
  };
}
