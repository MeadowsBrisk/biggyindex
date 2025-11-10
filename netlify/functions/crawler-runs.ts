import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets, marketStore } from "../../scripts/unified-crawler/shared/env/markets";
import { Keys } from "../../scripts/unified-crawler/shared/persistence/keys";
import { getBlobClient } from "../../scripts/unified-crawler/shared/persistence/blobs";

export const handler: Handler = async (event) => {
  try {
    const env = loadEnv();
    const markets = listMarkets(env.markets);
    const market = (event.queryStringParameters?.market as string) || markets[0];
    const storeName = marketStore(market as any, env.stores as any);

    const key = Keys.runMeta.market(market);
    const client = getBlobClient(storeName);
    const entries = (await client.getJSON<any[]>(key)) || [];

    const limit = Math.max(1, Math.min(200, parseInt(event.queryStringParameters?.limit || "50", 10)));
    const recent = entries.slice(-limit).reverse();

    const compact = (event.queryStringParameters?.compact === "1" || event.queryStringParameters?.compact === "true");
    const body = JSON.stringify({ ok: true, market, count: recent.length, entries: recent }, null, compact ? undefined : 2);
    return { statusCode: 200, headers: { "content-type": "application/json; charset=utf-8" }, body } as any;
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || String(e) }) } as any;
  }
};

export default handler;
