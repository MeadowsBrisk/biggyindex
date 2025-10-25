import type { AxiosInstance } from "axios";
import type { MarketCode } from "../../shared/types";
import { loadEnv } from "../../shared/env/loadEnv";
import { marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { ensureAuthedClient, fetchFirstReviews } from "./reviews";
import { fetchItemDescription } from "./details";
import { extractMarketShipping } from "./shipping";

export interface ProcessItemResult {
  ok: boolean;
  itemId: string;
  reviewsWritten: boolean;
  descriptionWritten: boolean;
  shippingWritten: number;
  errors?: string[];
}

export async function processSingleItem(
  itemId: string,
  markets: MarketCode[],
  opts: { client?: AxiosInstance; logPrefix?: string; mode?: "full" | "reviews-only" } = {}
): Promise<ProcessItemResult> {
  const env = loadEnv();
  const prefix = opts.logPrefix || "[crawler:item]";
  const mode = opts.mode || "full";
  let client = opts.client;
  const errors: string[] = [];

  try {
    if (!client) {
      const res = await ensureAuthedClient();
      client = res.client;
    }

    // Shared store for item core
    const sharedBlob = getBlobClient(env.stores.shared);

    let reviewsWritten = false;
    let descriptionWritten = false;
    let shippingWritten = 0;

    // Reviews (shared core)
    try {
      const rev = await fetchFirstReviews(client!, itemId, Number(process.env.CRAWLER_REVIEW_FETCH_SIZE || 100));
      if (rev.ok) {
        const key = Keys.shared.itemCore(itemId);
        const existing = (await sharedBlob.getJSON<any>(key)) || {};
        const reviewsArray = Array.isArray((rev as any)?.data?.reviews)
          ? (rev as any).data.reviews
          : existing.reviews || [];
        const merged = {
          ...existing,
          id: itemId,
          reviews: reviewsArray,
          lastReviewsRefresh: new Date().toISOString(),
        };
        await sharedBlob.putJSON(key, merged);
        reviewsWritten = true;
        console.log(`${prefix} reviews stored id=${itemId} count=${reviewsArray.length}`);
      } else {
        errors.push(`reviews:${rev.error || "unknown"}`);
      }
    } catch (e: any) {
      errors.push(`reviews:${e?.message || String(e)}`);
    }

    if (mode === "full") {
      // Description (shared core)
      try {
        const desc = await fetchItemDescription(client!, itemId, { maxBytes: 160_000 });
        if (desc.ok && desc.description) {
          const key = Keys.shared.itemCore(itemId);
          const existing = (await sharedBlob.getJSON<any>(key)) || {};
          const merged = {
            ...existing,
            id: itemId,
            description: desc.description,
            descriptionMeta: desc.meta,
            lastDescriptionRefresh: new Date().toISOString(),
          };
          await sharedBlob.putJSON(key, merged);
          descriptionWritten = true;
          const len = (desc.meta && (desc.meta as any).length) || desc.description.length;
          console.log(`${prefix} description stored id=${itemId} len=${len}`);
        } else {
          errors.push(`description:${desc.error || "unknown"}`);
        }
      } catch (e: any) {
        errors.push(`description:${e?.message || String(e)}`);
      }
    }

    // Shipping per-present market
    if (mode === "full") {
      for (const mkt of markets) {
        try {
          const res = await extractMarketShipping(client!, itemId, mkt);
          if (res.ok) {
            const store = marketStore(mkt, env.stores as any);
            const blob = getBlobClient(store);
            const shipKey = Keys.market.shipping(itemId);
            const payload = {
              id: itemId,
              market: mkt,
              options: res.options || [],
              warnings: res.warnings || [],
              lastShippingRefresh: new Date().toISOString(),
            };
            await blob.putJSON(shipKey, payload);
            shippingWritten++;
            console.log(`${prefix} shipping stored id=${itemId} market=${mkt} options=${payload.options.length}`);
          } else {
            errors.push(`shipping:${mkt}:${res.error || "unknown"}`);
          }
        } catch (e: any) {
          errors.push(`shipping:${mkt}:${e?.message || String(e)}`);
        }
      }
    }

    // Mark a full crawl timestamp when running in full mode and description was written
    if (mode === "full" && descriptionWritten) {
      try {
        const key = Keys.shared.itemCore(itemId);
        const existing = (await sharedBlob.getJSON<any>(key)) || { id: itemId };
        existing.lastFullCrawl = new Date().toISOString();
        await sharedBlob.putJSON(key, existing);
        console.log(`${prefix} marked lastFullCrawl id=${itemId}`);
      } catch {}
    }

    return {
      ok: true,
      itemId,
      reviewsWritten,
      descriptionWritten,
      shippingWritten,
      errors: errors.length ? errors : undefined,
    };
  } catch (e: any) {
    errors.push(e?.message || String(e));
    return {
      ok: false,
      itemId,
      reviewsWritten: false,
      descriptionWritten: false,
      shippingWritten: 0,
      errors,
    };
  }
}
