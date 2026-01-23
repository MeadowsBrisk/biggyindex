export interface IndexMetaEntry {
  fsa?: string;  // firstSeenAt
  lua?: string;  // lastUpdatedAt
  lur?: string;  // lastUpdateReason
  lsi?: string;  // lastSeenInIndex - when item was last present in any market index
}

export interface IndexMetaCandidate {
  fsa?: string | null;
  lua?: string | null;
  lur?: string | null;
  lsi?: string | null;  // lastSeenInIndex
}

const toTimestamp = (value?: string | null): number | null => {
  if (!value || typeof value !== 'string') return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
};

export function mergeIndexMetaEntry(
  prev: IndexMetaEntry | undefined,
  candidate: IndexMetaCandidate
): { changed: boolean; next: IndexMetaEntry } {
  const next: IndexMetaEntry = prev ? { ...prev } : {};
  let changed = false;

  if (candidate.fsa) {
    const candTs = toTimestamp(candidate.fsa);
    const prevTs = toTimestamp(next.fsa);
    if (!next.fsa || (candTs != null && (prevTs == null || candTs < prevTs))) {
      next.fsa = candidate.fsa;
      changed = true;
    }
  }

  if (candidate.lua) {
    const candTs = toTimestamp(candidate.lua);
    const prevTs = toTimestamp(next.lua);
    if (!next.lua || (candTs != null && (prevTs == null || candTs > prevTs))) {
      next.lua = candidate.lua;
      if (candidate.lur) next.lur = candidate.lur;
      changed = true;
    } else if (candidate.lur && next.lua && candTs === prevTs && candidate.lur !== next.lur) {
      next.lur = candidate.lur;
      changed = true;
    }
  } else if (candidate.lur && !next.lur) {
    next.lur = candidate.lur;
    changed = true;
  }

  // lsi: always update to latest seen timestamp (items stage sets this when item is in index)
  if (candidate.lsi) {
    const candTs = toTimestamp(candidate.lsi);
    const prevTs = toTimestamp(next.lsi);
    if (!next.lsi || (candTs != null && (prevTs == null || candTs > prevTs))) {
      next.lsi = candidate.lsi;
      changed = true;
    }
  }

  return { changed, next };
}

export interface PruneOptions {
  retentionDays?: number;  // Default 365 - items not seen for this long are pruned
  now?: Date;              // For testing
}

/**
 * Prune indexMeta entries using retention-based logic.
 * Items are only pruned if:
 * 1. Not in activeIds (current index)
 * 2. AND lsi (lastSeenInIndex) is older than retentionDays
 * 
 * Items without lsi are updated with current timestamp (migration case).
 */
export function pruneIndexMeta(
  meta: Record<string, IndexMetaEntry>,
  activeIds: Set<string>,
  opts: PruneOptions = {}
): { removed: number; retained: number; migrated: number } {
  const retentionDays = opts.retentionDays ?? 365;
  const now = opts.now ?? new Date();
  const cutoffMs = now.getTime() - (retentionDays * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  
  let removed = 0;
  let retained = 0;
  let migrated = 0;
  
  for (const id of Object.keys(meta)) {
    if (activeIds.has(id)) {
      // Item is active - update lsi to now
      meta[id].lsi = nowIso;
      continue;
    }
    
    // Item not in current index - check retention
    const entry = meta[id];
    const lsiTs = toTimestamp(entry.lsi);
    
    if (!lsiTs) {
      // No lsi timestamp - migrate by setting to now (give it a full retention period)
      entry.lsi = nowIso;
      migrated++;
      retained++;
      continue;
    }
    
    if (lsiTs >= cutoffMs) {
      // Within retention period - keep it
      retained++;
      continue;
    }
    
    // Past retention period - prune
    delete meta[id];
    removed++;
  }
  
  return { removed, retained, migrated };
}
