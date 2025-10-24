import { inngest } from "./client";
import { buildItemsWorklist } from "../../stages/items/run";
import { processItemBatch } from "../../stages/items/batch";
import { ensureAuthedClient } from "../../stages/items/reviews";

// Items crawler: orchestrate per-batch steps to avoid timeout
export const crawlItemsGlobal = inngest.createFunction(
  { id: "crawl-items-global" },
  { event: "indexes.updated" },
  async ({ event, step }) => {
    const markets = Array.isArray(event.data?.markets) ? (event.data.markets as any) : ["GB", "DE", "FR"];
    
    try { await (step as any).log?.(`crawl_items_global start markets=${markets.join(',')}`); } catch {}
    console.info(`[inngest] crawl_items_global start markets=${markets.join(',')}`);
    
    // Step 1: Build worklist (authentication + dedupe) - returns serializable data
    const worklistData = await step.run("items:build-worklist", async () => {
      const wl = await buildItemsWorklist(markets);
      try { 
        await (step as any).log?.(
          `worklist built unique=${wl.uniqueIds.length} toCrawl=${wl.toCrawl.length} sample=${wl.sample.length}`
        ); 
      } catch {}
      console.info(
        `[inngest] worklist built unique=${wl.uniqueIds.length} toCrawl=${wl.toCrawl.length} sample=${wl.sample.length}`
      );
      
      // Return only serializable data (no Map, no AxiosInstance)
      const presenceRecord: Record<string, string[]> = {};
      wl.presenceMap.forEach((markets, id) => {
        presenceRecord[id] = Array.from(markets);
      });
      
      return {
        uniqueIds: wl.uniqueIds,
        toCrawl: wl.toCrawl,
        alreadyHave: wl.alreadyHave,
        sample: wl.sample,
        presenceRecord,  // Plain object instead of Map
        counts: wl.counts,
      };
    });

    // Step 2: Process items in batches (10 items per batch to stay under 30s timeout)
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < worklistData.sample.length; i += batchSize) {
      batches.push(worklistData.sample.slice(i, i + batchSize));
    }

    let totalProcessed = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      await step.run(`items:batch-${i}`, async () => {
        // Get fresh authenticated client for this batch
        const { client } = await ensureAuthedClient();
        
        // Convert presenceRecord back to Map for this batch
        const presenceMap = new Map<string, Set<any>>();
        Object.entries(worklistData.presenceRecord).forEach(([id, markets]) => {
          presenceMap.set(id, new Set(markets));
        });
        
        const result = await processItemBatch(batch, presenceMap as any, client);
        totalProcessed += result.processed;
        try {
          await (step as any).log?.(
            `batch ${i + 1}/${batches.length} processed=${result.processed} total=${totalProcessed}`
          );
        } catch {}
        console.info(
          `[inngest] batch ${i + 1}/${batches.length} processed=${result.processed} total=${totalProcessed}`
        );
        return result;
      });
    }

    try { await (step as any).log?.(`crawl_items_global done total=${totalProcessed}`); } catch {}
    console.info(`[inngest] crawl_items_global done total=${totalProcessed}`);
    
    return { 
      received: event.data, 
      result: { 
        totalProcessed,
        batches: batches.length,
        counts: worklistData.counts 
      } 
    };
  }
);
