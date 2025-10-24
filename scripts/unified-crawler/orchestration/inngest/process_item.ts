import type { MarketCode } from "../../shared/types";
import { inngest } from "./client";
import { loadEnv } from "../../shared/env/loadEnv";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { ensureAuthedClient } from "../../stages/items/reviews";
import { fetchFirstReviews } from "../../stages/items/reviews";
import { fetchItemDescription } from "../../stages/items/details";
import { extractMarketShipping } from "../../stages/items/shipping";

/**
 * Process a single item: reviews + description (shared core), then shipping per market where present.
 * Each item gets its own 30-second execution window.
 * Inngest orchestrates parallel execution with concurrency limits.
 */
export const processItem = inngest.createFunction(
  { 
    id: "process-item",
    // Concurrency: 5 concurrent items (matches Inngest plan limit)
    // Upgrade plan to increase for faster processing
    concurrency: [{ limit: 5 }],
  },
  { event: "item/process" },
  async ({ event, step }) => {
    const itemId = event.data.itemId as string;
    const markets = (event.data.markets as MarketCode[]) || [];
    
    if (!itemId) {
      console.warn(`[process-item] Missing itemId in event`);
      return { ok: false, error: "Missing itemId" };
    }

    try {
      await (step as any).log?.(`process item=${itemId} markets=${markets.join(',')}`);
    } catch {}
    console.info(`[process-item] start item=${itemId} markets=${markets.join(',')}`);

    const env = loadEnv();
    const sharedBlob = getBlobClient(env.stores.shared);
    
    let reviewsWritten = false;
    let descriptionWritten = false;
    let shippingWritten = 0;

    // Step 1: Fetch and store reviews (shared core)
    await step.run("fetch-reviews", async () => {
      try {
        const { client } = await ensureAuthedClient();
        const res = await fetchFirstReviews(
          client, 
          itemId, 
          Number(process.env.CRAWLER_REVIEW_FETCH_SIZE || 100)
        );
        
        if (!res.ok) {
          console.warn(`[process-item] reviews failed id=${itemId} err=${res.error}`);
          return { ok: false };
        }

        const key = Keys.shared.itemCore(itemId);
        const existing = (await sharedBlob.getJSON<any>(key)) || {};
        const reviewsArray = Array.isArray((res as any)?.data?.reviews) 
          ? (res as any).data.reviews 
          : (existing.reviews || []);
        
        const merged = { 
          ...existing, 
          id: itemId, 
          reviews: reviewsArray, 
          lastReviewsRefresh: new Date().toISOString() 
        };
        
        await sharedBlob.putJSON(key, merged);
        reviewsWritten = true;
        console.info(`[process-item] reviews stored id=${itemId} total=${res.total} stored=${res.stored}`);
        
        return { ok: true, total: res.total, stored: res.stored };
      } catch (e: any) {
        console.warn(`[process-item] reviews error id=${itemId} ${e?.message || e}`);
        return { ok: false, error: e?.message || String(e) };
      }
    });

    // Step 2: Fetch and store description (shared core)
    await step.run("fetch-description", async () => {
      try {
        const { client } = await ensureAuthedClient();
        const desc = await fetchItemDescription(client, itemId, { maxBytes: 160_000 });
        
        if (!desc.ok || !desc.description) {
          console.warn(`[process-item] description failed id=${itemId} err=${desc.error}`);
          return { ok: false };
        }

        const key = Keys.shared.itemCore(itemId);
        const existing = (await sharedBlob.getJSON<any>(key)) || {};
        const merged = { 
          ...existing, 
          id: itemId, 
          description: desc.description, 
          descriptionMeta: desc.meta, 
          lastDescriptionRefresh: new Date().toISOString() 
        };
        
        await sharedBlob.putJSON(key, merged);
        descriptionWritten = true;
        console.info(`[process-item] description stored id=${itemId} len=${desc?.meta?.length ?? desc.description.length}`);
        
        return { ok: true, length: desc?.meta?.length ?? desc.description.length };
      } catch (e: any) {
        console.warn(`[process-item] description error id=${itemId} ${e?.message || e}`);
        return { ok: false, error: e?.message || String(e) };
      }
    });

    // Step 3: Fetch shipping for each market where item appears (presence-based)
    for (const market of markets) {
      await step.run(`fetch-shipping-${market}`, async () => {
        try {
          const { client } = await ensureAuthedClient();
          const resShip = await extractMarketShipping(client, itemId, market);
          
          if (!resShip.ok) {
            console.warn(`[process-item] shipping failed id=${itemId} market=${market} err=${resShip.error}`);
            return { ok: false };
          }

          const marketStore = (env.stores as any)[market];
          const marketBlob = getBlobClient(marketStore);
          const shipKey = Keys.market.shipping(itemId);
          const payload = { 
            id: itemId, 
            market, 
            options: resShip.options || [], 
            warnings: resShip.warnings || [], 
            lastShippingRefresh: new Date().toISOString() 
          };
          
          await marketBlob.putJSON(shipKey, payload);
          shippingWritten++;
          console.info(`[process-item] shipping stored id=${itemId} market=${market} options=${payload.options.length}`);
          
          return { ok: true, options: payload.options.length };
        } catch (e: any) {
          console.warn(`[process-item] shipping error id=${itemId} market=${market} ${e?.message || e}`);
          return { ok: false, error: e?.message || String(e) };
        }
      });
    }

    try {
      await (step as any).log?.(
        `done reviews=${reviewsWritten} desc=${descriptionWritten} shipping=${shippingWritten}`
      );
    } catch {}
    console.info(`[process-item] done item=${itemId} reviews=${reviewsWritten} desc=${descriptionWritten} shipping=${shippingWritten}`);

    return { 
      ok: true, 
      itemId, 
      reviewsWritten, 
      descriptionWritten, 
      shippingWritten 
    };
  }
);
