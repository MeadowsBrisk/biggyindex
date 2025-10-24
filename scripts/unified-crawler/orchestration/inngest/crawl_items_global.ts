import { inngest } from "./client";
import { buildItemsWorklist } from "../../stages/items/run";

/**
 * Items crawler: build worklist, then fan out to parallel item processors.
 * Each item processes in its own function with full 30s window.
 * Inngest handles concurrency and retries automatically.
 */
export const crawlItemsGlobal = inngest.createFunction(
  { id: "crawl-items-global" },
  { event: "indexes.updated" },
  async ({ event, step }) => {
    const markets = Array.isArray(event.data?.markets) ? (event.data.markets as any) : ["GB", "DE", "FR"];
    
    try { await (step as any).log?.(`crawl_items_global start markets=${markets.join(',')}`); } catch {}
    console.info(`[inngest] crawl_items_global start markets=${markets.join(',')}`);
    
    // Step 1: Build worklist (authentication + dedupe)
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

    // Step 2: Fan out events to process items in parallel
    // Inngest will invoke process-item function for each event with concurrency control
    const eventsToSend = worklistData.sample.map(item => ({
      name: "item/process",
      data: {
        itemId: item.id,
        itemName: item.n,
        markets: worklistData.presenceRecord[item.id] || [],
      },
    }));

    await step.run("items:fan-out", async () => {
      if (eventsToSend.length === 0) {
        console.info(`[inngest] No items to process (sample empty)`);
        return { sent: 0 };
      }

      // Send all events at once - Inngest handles parallelism via concurrency settings
      await inngest.send(eventsToSend);
      
      try {
        await (step as any).log?.(`fanned out ${eventsToSend.length} item events`);
      } catch {}
      console.info(`[inngest] fanned out ${eventsToSend.length} item/process events`);
      
      return { sent: eventsToSend.length };
    });

    try { 
      await (step as any).log?.(
        `crawl_items_global done - ${eventsToSend.length} items queued for parallel processing`
      ); 
    } catch {}
    console.info(
      `[inngest] crawl_items_global done - ${eventsToSend.length} items queued for parallel processing`
    );
    
    return { 
      received: event.data, 
      result: { 
        itemsQueued: eventsToSend.length,
        counts: worklistData.counts 
      } 
    };
  }
);
