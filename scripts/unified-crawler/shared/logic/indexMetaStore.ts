export interface IndexMetaEntry {
  fsa?: string;
  lua?: string;
  lur?: string;
}

export interface IndexMetaCandidate {
  fsa?: string | null;
  lua?: string | null;
  lur?: string | null;
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

  return { changed, next };
}

export function pruneIndexMeta(
  meta: Record<string, IndexMetaEntry>,
  activeIds: Set<string>
): { removed: number } {
  let removed = 0;
  for (const id of Object.keys(meta)) {
    if (!activeIds.has(id)) {
      delete meta[id];
      removed++;
    }
  }
  return { removed };
}
