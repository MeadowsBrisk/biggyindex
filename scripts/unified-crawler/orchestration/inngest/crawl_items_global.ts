import { inngest } from "./client";
import { runItemsGlobal } from "../../stages/items/run";

// Phase A stub: listen to indexes.updated and no-op.
export const crawlItemsGlobal = inngest.createFunction(
  { id: "crawl-items-global" },
  { event: "indexes.updated" },
  async ({ event, step }) => {
    const markets = Array.isArray(event.data?.markets) ? (event.data.markets as any) : ["GB", "DE", "FR"];
    try { await (step as any).log?.(`crawl_items_global start markets=${markets.join(',')}`); } catch {}
    console.info(`[inngest] crawl_items_global start markets=${markets.join(',')}`);
    const res = await step.run("items:global", async () => {
      const r = await runItemsGlobal(markets);
      try { await (step as any).log?.(`items:global planned=${r.counts.itemsPlanned} sample=${r.sample?.length ?? 0}`); } catch {}
      console.info(`[inngest] items:global planned=${r.counts.itemsPlanned} sample=${r.sample?.length ?? 0}`);
      return r;
    });
    try { await (step as any).log?.(`crawl_items_global done planned=${res.counts.itemsPlanned}`); } catch {}
    console.info(`[inngest] crawl_items_global done planned=${res.counts.itemsPlanned}`);
    return { received: event.data, result: res };
  }
);
