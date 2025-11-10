import path from "node:path";

export interface LegacyItemCrawlerOptions {
  blobsStore: string; // Which Netlify Blobs store the legacy crawler should use
  limit?: number;
  offset?: number;
  ids?: string[];
  force?: boolean;
  dryRun?: boolean;
  logLevel?: "debug" | "info" | "warn" | "error";
}

// Runs the legacy JS crawler programmatically, preserving its behavior.
// We set env vars instead of reimplementing flags to avoid divergence.
export async function runLegacyItemCrawler(opts: LegacyItemCrawlerOptions): Promise<void> {
  const legacyPath = path.join(process.cwd(), "scripts", "item-crawler", "crawl-items.js");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const legacy = require(legacyPath);
  if (!legacy?.main || typeof legacy.main !== "function") {
    throw new Error("Legacy item crawler entry not found or invalid export: crawl-items.js main()");
  }

  // Prepare environment for legacy code
  const prevEnv = { ...process.env };
  try {
    process.env.CRAWLER_BLOBS_STORE = opts.blobsStore; // where it reads indexed_items.json and writes outputs
    if (opts.limit != null) process.env.CRAWLER_LIMIT = String(opts.limit);
    if (opts.force) process.env.CRAWLER_FORCE = "1";
    if (opts.dryRun) process.env.CRAWLER_DRY_RUN = "1";
    if (opts.logLevel) process.env.LOG_LEVEL = opts.logLevel;
    if (opts.ids && opts.ids.length) {
      // The legacy script accepts --ids CLI; for env path, we keep behavior simple: rely on internal filters if provided via CLI
      // For programmatic usage, we can set a temporary env consumed by our own shim; not used here to avoid modifying legacy.
    }
    await legacy.main();
  } finally {
    // Restore env to avoid leaking settings to other steps
    for (const k of Object.keys(process.env)) delete (process.env as any)[k];
    Object.assign(process.env, prevEnv);
  }
}
