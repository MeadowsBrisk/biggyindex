import type { MarketCode } from "../types";
import { getBlobClient, type BlobClient } from "../persistence/blobs";

export interface DetectChangesInput {
  market: MarketCode;
  items: Array<{ id: string; n?: string }>;
  fullCrawlDays?: number; // default 7
}

export interface DetectChangesResult {
  newIds: string[]; // not present in shared core
  staleIds: string[]; // present but older than threshold (based on lastFullCrawl/lastDescriptionRefresh/lastReviewsRefresh)
  fullCrawlIds: string[]; // union of newIds and staleIds
}

// Minimal change detection for Phase A:
// - "New": id not found in shared core
// - "Stale": lastFullCrawl OR lastDescriptionRefresh OR lastReviewsRefresh older than N days
// NB: This uses shared store metadata; we do not diff per-market lightweight index yet.
export async function detectItemChanges(
  input: DetectChangesInput,
  opts: { sharedStoreName: string; sharedClient?: BlobClient } 
): Promise<DetectChangesResult> {
  const days = Math.max(1, input.fullCrawlDays ?? 7);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const shared = opts.sharedClient || getBlobClient(opts.sharedStoreName);

  // List all existing item cores once (key shape: items/core/<id>.json)
  const keys = await shared.list("items/core/");
  const existingIds = new Set(
    keys
      .map((k) => k.match(/^items\/core\/(.+)\.json$/)?.[1] || "")
      .filter(Boolean)
  );

  const newIds: string[] = [];
  const staleIds: string[] = [];

  // Quick pass to find news; we'll only fetch metadata for known existing items
  for (const it of input.items) {
    if (!it?.id) continue;
    if (!existingIds.has(it.id)) newIds.push(it.id);
  }

  // For staleness, sample existing items to keep Phase A cheap; adjust policy later if needed
  const existingToCheck = input.items
    .map((it) => it.id)
    .filter((id) => existingIds.has(id));

  // Limit per-run metadata checks to avoid heavy reads in Phase A
  const maxChecks = Math.min(existingToCheck.length, 500);
  for (let i = 0; i < maxChecks; i++) {
    const id = existingToCheck[i];
    try {
      const core = await shared.getJSON<any>(`items/core/${id}.json`);
      if (!core) continue;
      const times = [core.lastFullCrawl, core.lastDescriptionRefresh, core.lastReviewsRefresh]
        .filter(Boolean)
        .map((s: string) => Date.parse(s))
        .filter((n: number) => Number.isFinite(n));
      const latest = times.length ? Math.max(...times) : 0;
      if (!latest || latest < cutoff) staleIds.push(id);
    } catch {}
  }

  const fullCrawlIds = Array.from(new Set([...newIds, ...staleIds]));
  return { newIds, staleIds, fullCrawlIds };
}
