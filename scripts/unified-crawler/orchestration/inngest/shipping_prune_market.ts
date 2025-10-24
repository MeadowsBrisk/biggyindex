import { inngest } from "./client";

// Phase C stub: scheduled shipping refresh and pruning per market
export const shippingPruneMarket = inngest.createFunction(
  { id: "shipping-prune-market" },
  // Disabled schedule for now; enable in Phase C
  // { cron: "30 */6 * * *" },
  // Use manual event name to allow testing without enabling a cron
  { event: "shipping.prune.test" },
  async () => {
    return { ok: true, note: "stub" };
  }
);
