import type { MarketCode } from "../../shared/types";
import type { AxiosInstance } from "axios";
import { loadEnv } from "../../shared/env/loadEnv";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { fetchFirstReviews } from "./reviews";
import { fetchItemDescription } from "./details";
import { extractMarketShipping } from "./shipping";

export interface ItemBatchResult {
  processed: number;
  reviewsWritten: number;
  descriptionsWritten: number;
  shippingWritten: number;
}

/**
 * Process a batch of items: reviews + description (shared core), then shipping per market where present
 */
export async function processItemBatch(
  items: Array<{ id: string; n?: string; market: MarketCode }>,
  presenceMap: Map<string, Set<MarketCode>>,
  authedClient: AxiosInstance
): Promise<ItemBatchResult> {
  const env = loadEnv();
  const sharedBlob = getBlobClient(env.stores.shared);

  let processed = 0;
  let reviewsWritten = 0;
  let descriptionsWritten = 0;
  let shippingWritten = 0;

  for (const item of items) {
    const refNum = item.id;
    try {
      // Fetch and store reviews (shared core)
      const res = await fetchFirstReviews(authedClient, refNum, Number(process.env.CRAWLER_REVIEW_FETCH_SIZE || 100));
      if (!res.ok) {
        console.warn(`[items] reviews failed id=${refNum} err=${res.error}`);
      } else {
        const key = Keys.shared.itemCore(refNum);
        const existing = (await sharedBlob.getJSON<any>(key)) || {};
        const reviewsArray = Array.isArray((res as any)?.data?.reviews) ? (res as any).data.reviews : (existing.reviews || []);
        const merged = { 
          ...existing, 
          id: refNum, 
          reviews: reviewsArray, 
          lastReviewsRefresh: new Date().toISOString() 
        };
        await sharedBlob.putJSON(key, merged);
        reviewsWritten++;
        console.info(`[items] reviews stored id=${refNum} total=${res.total} stored=${res.stored}`);
      }

      // Fetch and store description (shared core)
      try {
        const desc = await fetchItemDescription(authedClient, refNum, { maxBytes: 160_000 });
        if (desc.ok && desc.description) {
          const key = Keys.shared.itemCore(refNum);
          const existing = (await sharedBlob.getJSON<any>(key)) || {};
          const merged = { 
            ...existing, 
            id: refNum, 
            description: desc.description, 
            descriptionMeta: desc.meta, 
            lastDescriptionRefresh: new Date().toISOString() 
          };
          await sharedBlob.putJSON(key, merged);
          descriptionsWritten++;
          console.info(`[items] description stored id=${refNum} len=${desc?.meta?.length ?? desc.description.length}`);
        } else {
          console.warn(`[items] description failed id=${refNum} err=${desc.error}`);
        }
      } catch (e: any) {
        console.warn(`[items] description error id=${refNum} ${e?.message || e}`);
      }

      // Shipping: fetch per markets where the item appears (presence-based)
      const marketsForItem = Array.from(presenceMap.get(refNum) || []);
      for (const mkt of marketsForItem) {
        try {
          const resShip = await extractMarketShipping(authedClient, refNum, mkt);
          if (!resShip.ok) {
            console.warn(`[items] shipping failed id=${refNum} market=${mkt} err=${resShip.error}`);
            continue;
          }
          const marketStore = (env.stores as any)[mkt];
          const marketBlob = getBlobClient(marketStore);
          const shipKey = Keys.market.shipping(refNum);
          const payload = { 
            id: refNum, 
            market: mkt, 
            options: resShip.options || [], 
            warnings: resShip.warnings || [], 
            lastShippingRefresh: new Date().toISOString() 
          };
          await marketBlob.putJSON(shipKey, payload);
          shippingWritten++;
          console.info(`[items] shipping stored id=${refNum} market=${mkt} options=${payload.options.length}`);
        } catch (e: any) {
          console.warn(`[items] shipping error id=${refNum} market=${mkt} ${e?.message || e}`);
        }
      }

      processed++;
    } catch (e: any) {
      console.warn(`[items] batch error id=${refNum} ${e?.message || e}`);
    }
  }

  return { processed, reviewsWritten, descriptionsWritten, shippingWritten };
}
