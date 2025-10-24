// Unified env loader for crawler/orchestrator
// Centralizes access and prevents leaking secrets in logs.

export type MarketCode = "GB" | "DE" | "FR";

export interface UnifiedEnv {
  markets: MarketCode[];
  maxParallel: number;
  shippingParallel: number;
  maxRuntimeMs: number;
  retry: { attempts: number; baseMs: number; factor: number };
  persistMode: "auto" | "fs" | "blobs";
  stores: Record<MarketCode | "shared", string>;
  auth: { username?: string; password?: string };
  inngest: { enabled: boolean; eventKey?: string };
  itemsSampleLimit: number; // cap how many items to process in pilot runs
}

export function loadEnv(): UnifiedEnv {
  const markets = (process.env.MARKETS?.split(",").map((s) => s.trim()) as MarketCode[]) || [
    "GB",
    "DE",
    "FR",
  ];
  return {
    markets,
    maxParallel: parseInt(process.env.CRAWLER_MAX_PARALLEL || "6", 10),
    shippingParallel: parseInt(
      process.env.CRAWLER_SHIPPING_MAX_PARALLEL || "3",
      10
    ),
    maxRuntimeMs: parseInt(
      process.env.CRAWLER_MAX_RUNTIME_MS || (process.env.NETLIFY_DEV ? "25000" : "900000"),
      10
    ),
    retry: {
      attempts: parseInt(process.env.CRAWLER_RETRY_ATTEMPTS || "3", 10),
      baseMs: parseInt(process.env.CRAWLER_RETRY_BASE_MS || "250", 10),
      factor: parseFloat(process.env.CRAWLER_RETRY_FACTOR || "1.8"),
    },
    persistMode:
      (process.env.CRAWLER_PERSIST as UnifiedEnv["persistMode"]) || "auto",
    stores: {
      shared: process.env.SHARED_STORE || "site-index-shared",
      GB: process.env.GB_STORE || "site-index-gb",
      DE: process.env.DE_STORE || "site-index-de",
      FR: process.env.FR_STORE || "site-index-fr",
    },
    auth: {
      username:
        process.env.LB_LOGIN_USERNAME || process.env.SELLER_CRAWLER_USERNAME,
      password:
        process.env.LB_LOGIN_PASSWORD || process.env.SELLER_CRAWLER_PASSWORD,
    },
    inngest: {
      enabled: process.env.INNGEST_ENABLE_INDEX !== "0",
      eventKey: process.env.INNGEST_EVENT_KEY,
    },
    itemsSampleLimit: parseInt(process.env.CRAWLER_ITEMS_SAMPLE || "10", 10),
  };
}
