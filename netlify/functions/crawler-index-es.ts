import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { marketStore } from "../../scripts/unified-crawler/shared/env/markets";
import { indexMarket } from "../../scripts/unified-crawler/indexer/indexMarket";
import { Keys } from "../../scripts/unified-crawler/shared/persistence/keys";
import { appendRunMeta } from "../../scripts/unified-crawler/shared/persistence/runMeta";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async (event) => {
  const started = Date.now();
  const log = (m: string) => console.log(`[crawler:index-es] ${m}`);
  const warn = (m: string) => console.warn(`[crawler:index-es] ${m}`);
  const errlog = (m: string) => console.error(`[crawler:index-es] ${m}`);

  try {
    const force = event?.queryStringParameters?.force === "1" || event?.queryStringParameters?.force === "true";
    if (!force && process.env.CRAWLER_UNIFIED_INDEX !== "1") {
      warn("disabled via CRAWLER_UNIFIED_INDEX != 1; skipping");
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) } as any;
    }

    const env = loadEnv();
    const code = 'ES' as const;
    const t0 = Date.now();
    log(`start market=${code}`);
    try {
      const res: any = await indexMarket(code as any);
      log(`done market=${code} items=${res?.counts?.items ?? 0} elapsed=${since(t0)}s`);
      // run-meta best-effort
      try {
        const storeName = marketStore(code as any, env.stores as any);
        const key = Keys.runMeta.market(code as any);
        await appendRunMeta(storeName, key, {
          scope: `index:${code}`,
          counts: res?.counts || {},
          notes: { snapshotMeta: res?.snapshotMeta },
        });
      } catch {}
    } catch (e: any) {
      errlog(`error market=${code} ${e?.message || e}`);
    }

    log(`done total=${since(started)}s`);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) } as any;
  } catch (e: any) {
    errlog(`fatal ${e?.stack || e?.message || String(e)}`);
    return { statusCode: 500, body: "error" } as any;
  }
};

export default handler;
