// NOTE: Deprecated background index function. Not scheduled. Kept temporarily; always skips.
// Use crawler-index.ts (regular scheduled function) instead.
import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets, marketStore } from "../../scripts/unified-crawler/shared/env/markets";
import { indexMarket } from "../../scripts/unified-crawler/indexer/indexMarket";
import { Keys } from "../../scripts/unified-crawler/shared/persistence/keys";
import { appendRunMeta } from "../../scripts/unified-crawler/shared/persistence/runMeta";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async () => {
  const started = Date.now();
  const warn = (m: string) => console.warn(`[crawler:index-bg:DEPRECATED] ${m}`);

  try {
    warn("deprecated function invoked; skipping");
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, deprecated: true }) } as any;
  } catch (e: any) {
    warn(`fatal ${e?.stack || e?.message || String(e)}`);
    return { statusCode: 500, body: "error" } as any;
  }
};

export default handler;
