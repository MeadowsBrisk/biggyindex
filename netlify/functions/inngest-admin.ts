import type { Handler } from "@netlify/functions";
import { inngest } from "../../scripts/unified-crawler/orchestration/inngest/client";

export const handler: Handler = async (evt) => {
  try {
    const body = evt.body ? JSON.parse(evt.body) : {};
    const markets: ("GB" | "DE" | "FR")[] = Array.isArray(body?.markets)
      ? body.markets
      : ["GB", "DE", "FR"];

    await inngest.send({
      name: "indexes.updated",
      data: { markets, snapshotMeta: { source: "admin" } },
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, markets }),
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    };
  }
};
