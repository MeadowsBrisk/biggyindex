import { inngest } from "./client";
import { indexMarket } from "../../indexer/indexMarket";
import { loadEnv } from "../../shared/env/loadEnv";
import { marketStore } from "../../shared/env/markets";
import { Keys } from "../../shared/persistence/keys";
import { appendRunMeta } from "../../shared/persistence/runMeta";

// Phase A: minimal workflow that will sequentially run per-market index steps.
// Implementation will call a wrapper that delegates to existing indexer (GB only initially).
export const indexAllMarkets = inngest.createFunction(
  { id: "index-all-markets" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const env = loadEnv();
    const markets: ("GB" | "DE" | "FR")[] = ["GB", "DE", "FR"];

    const snapshotMeta: Record<string, unknown> = {};

    for (const code of markets) {
      await step.run(`index:market:${code}`, async () => {
        try { await (step as any).log?.(`Starting index for ${code}...`); } catch {}
        console.info(`[inngest] Starting index for ${code}...`);
        const res = await indexMarket(code);
        try { await (step as any).log?.(`Index complete for ${code}: items=${res?.counts?.items ?? 0}`); } catch {}
        console.info(`[inngest] Index complete for ${code}: items=${res?.counts?.items ?? 0}`);
        // Append per-market run meta for observability
        try {
          const storeName = marketStore(code, env.stores as any);
          const key = Keys.runMeta.market(code);
          await appendRunMeta(storeName, key, {
            scope: code,
            counts: res.counts,
            notes: { snapshotMeta: res.snapshotMeta },
          });
        } catch (err) {
          // Swallow run-meta errors to avoid failing the whole run
        }
        return res;
      });
    }

    if (process.env.INNGEST_ENABLE_INDEX_EVENTS === "1") {
      await step.sendEvent("indexes.updated", {
        name: "indexes.updated",
        data: { markets, snapshotMeta },
      });
    }

    return { ok: true, markets };
  }
);
