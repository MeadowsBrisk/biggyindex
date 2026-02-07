/**
 * Index diff engine — compares the current market index against a stored
 * snapshot to detect new, changed, and removed items.
 *
 * Used by the index function + CLI to trigger fast-enrich only for items
 * that actually changed, instead of processing the entire ~950-item catalog.
 *
 * Snapshot format (stored in shared blob as aggregates/index-snapshot.json):
 *   { [refNum]: { lua: string; sig: string } }
 *   ~50-60 KB for ~950 items
 *
 * Signature = `${sid}|${uMin}|${uMax}|${variantCount}`
 * This captures price changes and seller reassignment — the two most
 * impactful changes that need re-enrichment.
 */

import type { MarketCode } from '../../shared/env/loadEnv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotEntry {
  /** lastUpdatedAt from the upstream source */
  lua: string;
  /** Stable hash of key fields: sid|uMin|uMax|variantCount */
  sig: string;
}

export type IndexSnapshot = Record<string, SnapshotEntry>;

export interface IndexDiffItem {
  /** Canonical refNum (item ID) */
  id: string;
  /** Markets this item appears in (may be multiple) */
  markets: MarketCode[];
  /** The full index entry from the current run — passed to processSingleItem */
  indexEntry: any;
  /** Why this item is in the diff */
  reason: 'new' | 'changed';
  /** What specific fields changed (for logging) */
  changes?: string[];
}

export interface IndexDiffResult {
  newItems: IndexDiffItem[];
  changedItems: IndexDiffItem[];
  removedIds: string[];
  /** Updated snapshot to save after the diff is processed */
  snapshot: IndexSnapshot;
}

// ---------------------------------------------------------------------------
// Signature computation
// ---------------------------------------------------------------------------

/**
 * Build a stable signature from an index entry.
 * Changes to any of these fields trigger a "changed" diff.
 */
function computeSig(entry: any): string {
  const sid = entry.sid ?? '';
  const uMin = entry.uMin ?? '';
  const uMax = entry.uMax ?? '';
  const vCount = Array.isArray(entry.v) ? entry.v.length : 0;
  return `${sid}|${uMin}|${uMax}|${vCount}`;
}

// ---------------------------------------------------------------------------
// Main diff logic
// ---------------------------------------------------------------------------

/**
 * Compute the diff between the current index entries and a stored snapshot.
 *
 * @param currentEntries - Array of market index entries from the just-completed
 *   index run. Each entry must have at least `refNum` (or `id`), `lua`, `sid`,
 *   `uMin`, `uMax`, `v`.
 * @param previousSnapshot - The snapshot from the last run (or empty `{}` on first run).
 * @param market - The market code these entries belong to.
 * @returns Diff result with new, changed, removed items and the updated snapshot.
 */
export function computeIndexDiff(
  currentEntries: any[],
  previousSnapshot: IndexSnapshot,
  market: MarketCode,
): IndexDiffResult {
  const newItems: IndexDiffItem[] = [];
  const changedItems: IndexDiffItem[] = [];
  const newSnapshot: IndexSnapshot = {};
  const seenIds = new Set<string>();

  for (const entry of currentEntries) {
    const id = String(entry.refNum || entry.id || '').trim();
    if (!id) continue;

    // Dedupe within market (shouldn't happen but be safe)
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const lua = String(entry.lua || '');
    const sig = computeSig(entry);

    // Build the new snapshot entry
    newSnapshot[id] = { lua, sig };

    const prev = previousSnapshot[id];

    if (!prev) {
      // New item — never seen before
      newItems.push({
        id,
        markets: [market],
        indexEntry: entry,
        reason: 'new',
      });
      continue;
    }

    // Existing item — check for changes
    const changes: string[] = [];
    if (prev.lua !== lua && lua) changes.push('lua');
    if (prev.sig !== sig) changes.push('sig');

    if (changes.length > 0) {
      changedItems.push({
        id,
        markets: [market],
        indexEntry: entry,
        reason: 'changed',
        changes,
      });
    }
  }

  // Find removed items (in previous snapshot but not in current)
  const removedIds: string[] = [];
  for (const id of Object.keys(previousSnapshot)) {
    if (!seenIds.has(id)) {
      removedIds.push(id);
    }
  }

  return { newItems, changedItems, removedIds, snapshot: newSnapshot };
}

// ---------------------------------------------------------------------------
// Multi-market merge
// ---------------------------------------------------------------------------

/**
 * Merge diffs from multiple markets into a single combined diff.
 * Items that appear as "new" in multiple markets are deduplicated —
 * the first market's index entry is kept, but all markets are recorded.
 */
export function mergeMarketDiffs(diffs: IndexDiffResult[]): {
  newItems: IndexDiffItem[];
  changedItems: IndexDiffItem[];
  removedIds: string[];
} {
  const newMap = new Map<string, IndexDiffItem>();
  const changedMap = new Map<string, IndexDiffItem>();
  const allRemoved = new Set<string>();

  for (const diff of diffs) {
    for (const item of diff.newItems) {
      const existing = newMap.get(item.id);
      if (existing) {
        // Add market to existing entry
        for (const m of item.markets) {
          if (!existing.markets.includes(m)) existing.markets.push(m);
        }
      } else {
        newMap.set(item.id, { ...item });
      }
    }

    for (const item of diff.changedItems) {
      // Skip if already recorded as new (new takes precedence)
      if (newMap.has(item.id)) {
        const existing = newMap.get(item.id)!;
        for (const m of item.markets) {
          if (!existing.markets.includes(m)) existing.markets.push(m);
        }
        continue;
      }

      const existing = changedMap.get(item.id);
      if (existing) {
        for (const m of item.markets) {
          if (!existing.markets.includes(m)) existing.markets.push(m);
        }
      } else {
        changedMap.set(item.id, { ...item });
      }
    }

    for (const id of diff.removedIds) {
      allRemoved.add(id);
    }
  }

  // Don't report items as removed if they still appear in another market
  for (const id of [...allRemoved]) {
    if (newMap.has(id) || changedMap.has(id)) allRemoved.delete(id);
  }

  return {
    newItems: Array.from(newMap.values()),
    changedItems: Array.from(changedMap.values()),
    removedIds: Array.from(allRemoved),
  };
}
