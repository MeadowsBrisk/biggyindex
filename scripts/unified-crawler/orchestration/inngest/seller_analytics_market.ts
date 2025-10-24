import { inngest } from "./client";

// Phase D stub: compute per-market seller analytics
export const sellerAnalyticsMarket = inngest.createFunction(
  { id: "seller-analytics-market" },
  { event: "items.crawled" },
  async ({ event }) => {
    // TODO Phase D: compute seller analytics after items crawl
    return { received: event.data };
  }
);
