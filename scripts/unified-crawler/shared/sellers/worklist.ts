import { loadEnv } from "../env/loadEnv";
import type { MarketCode } from "../env/loadEnv";
import { marketStore } from "../env/markets";
import { getBlobClient } from "../persistence/blobs";
import { Keys } from "../persistence/keys";

export interface SellerMetaRecord {
  sellerId: string;
  sellerName?: string;
  sellerUrl?: string;
  imageUrl?: string;
}

export interface SellerWorklist {
  sellerItems: Map<string, Set<string>>;
  sellerItemsByMarket: Map<MarketCode, Map<string, Set<string>>>;
  sellerMarkets: Map<string, Set<MarketCode>>;
  sellerMeta: Map<string, SellerMetaRecord>;
  selectedSellerIds: string[];
  totalDiscovered: number;
}

export async function buildSellerWorklist(markets: MarketCode[], limit?: number): Promise<SellerWorklist> {
  const env = loadEnv();
  const sellerItems = new Map<string, Set<string>>();
  const sellerItemsByMarket = new Map<MarketCode, Map<string, Set<string>>>();
  const sellerMarkets = new Map<string, Set<MarketCode>>();
  const sellerMeta = new Map<string, SellerMetaRecord>();

  for (const mkt of markets) {
    const storeName = marketStore(mkt, env.stores as any);
    const blob = getBlobClient(storeName);
    const idx = (await blob.getJSON<any[]>(Keys.market.index(mkt))) || [];
    for (const entry of Array.isArray(idx) ? idx : []) {
      const id = String(entry?.refNum ?? entry?.ref ?? entry?.id ?? "").trim();
      const sidRaw = entry?.sid ?? entry?.sellerId;
      const sellerName = entry?.sn ?? entry?.sellerName;
      if (!id || sidRaw == null) continue;
      const sellerId = String(sidRaw);
      if (!sellerItems.has(sellerId)) sellerItems.set(sellerId, new Set());
      sellerItems.get(sellerId)!.add(id);
      if (!sellerItemsByMarket.has(mkt)) sellerItemsByMarket.set(mkt, new Map());
      const marketMap = sellerItemsByMarket.get(mkt)!;
      if (!marketMap.has(sellerId)) marketMap.set(sellerId, new Set());
      marketMap.get(sellerId)!.add(id);
      if (!sellerMarkets.has(sellerId)) sellerMarkets.set(sellerId, new Set());
      sellerMarkets.get(sellerId)!.add(mkt);
      if (!sellerMeta.has(sellerId)) {
        sellerMeta.set(sellerId, {
          sellerId,
          sellerName: sellerName || undefined,
          sellerUrl: `https://littlebiggy.net/seller/${encodeURIComponent(sellerId)}`,
        });
      } else if (sellerName && !sellerMeta.get(sellerId)!.sellerName) {
        sellerMeta.get(sellerId)!.sellerName = sellerName;
      }
    }
  }

  const totalDiscovered = sellerItems.size;
  const defaultLimit = Number(process.env.SELLERS_LIMIT || process.env.SELLER_LIMIT || process.env.SELLERS_SCAN_LIMIT || 0);
  const effectiveLimit = typeof limit === "number" && limit > 0 ? limit : (defaultLimit > 0 ? defaultLimit : 0);
  const allSellerIds = Array.from(sellerItems.keys());
  const selectedSellerIds = effectiveLimit > 0 ? allSellerIds.slice(0, effectiveLimit) : allSellerIds;

  console.log(`[crawler:sellers] discovered sellers=${totalDiscovered}` + (effectiveLimit > 0 ? ` (limiting to ${selectedSellerIds.length})` : ""));

  return {
    sellerItems,
    sellerItemsByMarket,
    sellerMarkets,
    sellerMeta,
    selectedSellerIds,
    totalDiscovered,
  };
}
