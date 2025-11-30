import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Type definitions
type ItemId = string;
type Bucket = string;
type VotesMap = Record<ItemId, number>;
type BucketsStore = Record<Bucket, ItemId[]>;
type VotesCache = Record<Bucket, VotesMap>;
type UsedCountsMap = Record<Bucket, number>;
type BaselinesMap = Record<ItemId, number>;

interface EndorseResponse {
  count?: number;
  maxPerWindow?: number;
  usedCount?: number;
  limitReached?: boolean;
}

// Generate a lightweight UUID v4 (not cryptographically strong but fine for pseudonymous id)
function genCid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const voteCidAtom = atomWithStorage<string>('voteCid', genCid());
export const votesAtom = atomWithStorage<VotesMap>('votesMap', {});
export const endorsedSetAtom = atom(new Set<ItemId>());
export const windowBucketAtom = atom<Bucket | null>(null);
// New: persisted bucket->array store
export const endorsedBucketsStoreAtom = atomWithStorage<BucketsStore>('endorsedBuckets', {});
export const votesCacheAtom = atomWithStorage<VotesCache>('votesCache', {}); // { bucket: { [itemId]: count } }
export const pendingEndorseAtom = atom(new Set<ItemId>());
export const voteLimitReachedAtom = atomWithStorage<boolean>('voteLimitReached', false);
export const pendingEndorsedWithoutBucketAtom = atomWithStorage<ItemId[]>('pendingEndorsedNoBucket', []); // array of itemId strings endorsed before bucket known
export const globalEndorsedAtom = atomWithStorage<ItemId[]>('endorsedAll', []); // permanent lifetime endorsements
export const voteUsedCountsAtom = atomWithStorage<UsedCountsMap>('voteUsedCounts', {}); // { bucket: number }
export const voteMaxPerWindowAtom = atomWithStorage<number>('voteMaxPerWindow', 1);

export const currentUsedCountAtom = atom((get) => {
  const bucket = get(windowBucketAtom);
  const map = get(voteUsedCountsAtom) || {};
  return bucket != null ? (map[bucket] || 0) : 0;
});

export const voteHasVotedAtom = atom((get) => {
  const max = get(voteMaxPerWindowAtom) || 1;
  const used = get(currentUsedCountAtom);
  return max > 0 && used >= max;
});

export const lastVoteBucketAtom = atomWithStorage<Bucket | null>('lastVoteBucket', null);

// Baselines & reconciliation (must be before endorseActionAtom & hydrateGlobalEndorsedAtom usage)
export const endorsementBaselinesAtom = atomWithStorage<BaselinesMap>('endorsementBaselines', {}); // { itemId: baselineCountBeforeVote }

export const reconcileLocalEndorsementsAtom = atom(null, (get, set) => {
  const globals = Array.isArray(get(globalEndorsedAtom)) ? get(globalEndorsedAtom) : [];
  const baselines = get(endorsementBaselinesAtom) || {};
  const votes = { ...(get(votesAtom) || {}) };
  let changed = false;
  for (const id of globals) {
    const base = baselines[id];
    if (base != null) {
      const current = votes[id] == null ? 0 : votes[id];
      if (current <= base) { votes[id] = base + 1; changed = true; }
    }
  }
  if (changed) set(votesAtom, votes);
});

// Early declare offline / sync atoms so endorseActionAtom can reference them safely
export const votesOfflineModeAtom = atomWithStorage<boolean>('votesOfflineMode', true);
export const pendingSyncVotesAtom = atomWithStorage<ItemId[]>('pendingSyncVotes', []); // array of itemIds needing server sync

// Hydrator: when bucket changes, merge cached counts for that bucket into votesAtom if not present
export const hydrateVotesFromCacheAtom = atom(null, (get, set) => {
  const bucket = get(windowBucketAtom);
  if (bucket == null) return;
  const cache = get(votesCacheAtom) || {};
  const bucketCache = cache[bucket] || {};
  const current = { ...(get(votesAtom) || {}) };
  let changed = false;
  for (const [id, cnt] of Object.entries(bucketCache)) {
    if (current[id] == null) { current[id] = cnt; changed = true; }
  }
  if (changed) set(votesAtom, current);
  const store = get(endorsedBucketsStoreAtom) || {};
  const pendingEarly = Array.isArray(get(pendingEndorsedWithoutBucketAtom)) ? get(pendingEndorsedWithoutBucketAtom) : [];
  if (pendingEarly.length > 0) {
    const existing = new Set(Array.isArray(store[bucket]) ? store[bucket] : []);
    let added = false;
    for (const id of pendingEarly) { if (!existing.has(id)) { existing.add(id); added = true; } }
    if (added) { store[bucket] = Array.from(existing); set(endorsedBucketsStoreAtom, { ...store }); }
    set(pendingEndorsedWithoutBucketAtom, []);
  }
  const globalList = Array.isArray(get(globalEndorsedAtom)) ? get(globalEndorsedAtom) : [];
  const bucketList = Array.isArray(store[bucket]) ? store[bucket] : [];
  const combined = new Set([...globalList, ...bucketList]);
  set(endorsedSetAtom, combined);
  // Hydrate used count from lastVoteBucket if needed (user already voted earlier this window)
  const lastBucket = get(lastVoteBucketAtom);
  if (lastBucket === bucket) {
    const usedMap = { ...(get(voteUsedCountsAtom) || {}) };
    if (usedMap[bucket] == null) {
      usedMap[bucket] = 1; // only one per window
      set(voteUsedCountsAtom, usedMap);
      set(voteLimitReachedAtom, true);
    }
  }
});

// Action: endorse a single item (optimistic increment)
export const endorseActionAtom = atom(null, async (get, set, rawId: string | number | null | undefined) => {
  if (rawId == null) return;
  const itemId = String(rawId);
  const globalList = Array.isArray(get(globalEndorsedAtom)) ? get(globalEndorsedAtom) : [];
  const limitReached = get(voteLimitReachedAtom);
  const used = get(currentUsedCountAtom);
  const maxPer = get(voteMaxPerWindowAtom) || 1;
  if (!globalList.includes(itemId) && (limitReached || used >= maxPer)) {
    return;
  }
  if (globalList.includes(itemId)) {
    const currentSet = new Set(get(endorsedSetAtom));
    if (!currentSet.has(itemId)) { currentSet.add(itemId); set(endorsedSetAtom, currentSet); }
    return;
  }
  let addedGlobally = false; // track if we added to global list optimistically
  // In offline mode, mark as pending sync and update state optimistically
  if (get(votesOfflineModeAtom)) {
    const pendingSync = new Set(Array.isArray(get(pendingSyncVotesAtom)) ? get(pendingSyncVotesAtom) : []);
    pendingSync.add(itemId);
    set(pendingSyncVotesAtom, Array.from(pendingSync));
    if (!globalList.includes(itemId)) set(globalEndorsedAtom, [...globalList, itemId]);
    const votes = { ...(get(votesAtom) || {}) };
    const baselines = { ...(get(endorsementBaselinesAtom) || {}) };
    if (baselines[itemId] == null) baselines[itemId] = votes[itemId] || 0; // capture pre-increment baseline
    set(endorsementBaselinesAtom, baselines);
    votes[itemId] = (votes[itemId] || 0) + 1;
    set(votesAtom, votes);
    // Persist into bucket cache if bucket known so later hydrations / other tabs stay in sync
    const bucket = get(windowBucketAtom);
    if (bucket != null) {
      const cache = { ...(get(votesCacheAtom) || {}) };
      const bucketMap = { ...(cache[bucket] || {}) };
      bucketMap[itemId] = votes[itemId];
      cache[bucket] = bucketMap;
      set(votesCacheAtom, cache);
    }
    const endorsedSet = new Set(get(endorsedSetAtom)); endorsedSet.add(itemId); set(endorsedSetAtom, endorsedSet);
    // Immediate daily limit enforcement (even before server bucket known)
    const maxPerNow = get(voteMaxPerWindowAtom) || 1;
    if (maxPerNow > 0) set(voteLimitReachedAtom, true);
    return;
  }
  const cid = get(voteCidAtom);
  const bucket = get(windowBucketAtom);
  const votes = { ...(get(votesAtom) || {}) };
  // Capture baseline before optimistic increment if first time endorsing this id locally
  const baselines = { ...(get(endorsementBaselinesAtom) || {}) };
  if (baselines[itemId] == null) { baselines[itemId] = votes[itemId] || 0; set(endorsementBaselinesAtom, baselines); }
  const endorsed = new Set(get(endorsedSetAtom));
  const pending = new Set(get(pendingEndorseAtom));
  if (endorsed.has(itemId) || pending.has(itemId)) return;
  console.debug('[endorse][client] click start', { itemId, cid, bucket });
  votes[itemId] = (votes[itemId] || 0) + 1; // optimistic count increment
  endorsed.add(itemId);
  pending.add(itemId);
  set(votesAtom, votes);
  // Immediate daily limit (for maxPer==1 mostly) even before bucket known
  if ((get(voteMaxPerWindowAtom) || 1) > 0) set(voteLimitReachedAtom, true);
  // Persist to cache if bucket known
  if (bucket != null) {
    const cache = { ...(get(votesCacheAtom) || {}) };
    const bucketMap = { ...(cache[bucket] || {}) };
    bucketMap[itemId] = votes[itemId];
    cache[bucket] = bucketMap;
    set(votesCacheAtom, cache);
  }
  // Commit local endorsed + pending sets
  set(endorsedSetAtom, new Set(endorsed));
  set(pendingEndorseAtom, new Set(pending));
  // Add to global list so refresh persists endorsement
  if (!globalList.includes(itemId)) {
    set(globalEndorsedAtom, [...globalList, itemId]);
    addedGlobally = true;
  }
  // Optimistically bump used count if bucket known
  if (bucket != null && !globalList.includes(itemId)) {
    const usedMap = { ...(get(voteUsedCountsAtom) || {}) };
    const currentUsed = usedMap[bucket] || used;
    if (currentUsed < maxPer) {
      usedMap[bucket] = currentUsed + 1;
      set(voteUsedCountsAtom, usedMap);
      if (currentUsed + 1 >= maxPer) set(voteLimitReachedAtom, true);
    }
  }
  const store = { ...(get(endorsedBucketsStoreAtom) || {}) }; // (reassign store below if bucket)
  if (bucket != null) {
    const arr = new Set(Array.isArray(store[bucket]) ? store[bucket] : []);
    arr.add(itemId); store[bucket] = Array.from(arr);
    set(endorsedBucketsStoreAtom, store);
  } else {
    const pendingEarly = new Set(Array.isArray(get(pendingEndorsedWithoutBucketAtom)) ? get(pendingEndorsedWithoutBucketAtom) : []);
    pendingEarly.add(itemId); set(pendingEndorsedWithoutBucketAtom, Array.from(pendingEarly));
  }
  try {
    console.debug('[endorse][client] issuing fetch', { itemId });
    const res = await fetch('/api/endorse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, cid }) });
    console.debug('[endorse][client] fetch returned', res.status, { itemId });
    let data: EndorseResponse | null = null; 
    try { data = await res.json(); } catch { /* ignore parse errors */ }
    if (!res.ok) {
      if (res.status === 404) {
        // API route not available; keep optimistic vote and schedule sync attempts (offline mode)
        const pendingSync = new Set(Array.isArray(get(pendingSyncVotesAtom)) ? get(pendingSyncVotesAtom) : []);
        pendingSync.add(itemId);
        set(pendingSyncVotesAtom, Array.from(pendingSync));
        set(votesOfflineModeAtom, true); // don't spam network until manual refresh
        return; // exit without rollback
      }
      throw new Error(`HTTP ${res.status}`);
    }
    if (typeof data?.maxPerWindow === 'number') set(voteMaxPerWindowAtom, data.maxPerWindow || 1);
    if (typeof data?.usedCount === 'number' && bucket != null) {
      const usedMap = { ...(get(voteUsedCountsAtom) || {}) };
      usedMap[bucket] = data.usedCount;
      set(voteUsedCountsAtom, usedMap);
    }
    if (data?.limitReached) {
      // rollback optimistic count and endorsed flags (can't endorse new item now)
      const rollbackVotes = { ...(get(votesAtom) || {}) };
      rollbackVotes[itemId] = Math.max(0, (rollbackVotes[itemId] || 1) - 1);
      set(votesAtom, rollbackVotes);
      // Rollback cache value too
      if (bucket != null) {
        const cache = { ...(get(votesCacheAtom) || {}) };
        if (cache[bucket]) {
          const bmap = { ...cache[bucket] };
          bmap[itemId] = rollbackVotes[itemId];
          cache[bucket] = bmap;
          set(votesCacheAtom, cache);
        }
      }
      const endSet = new Set(get(endorsedSetAtom)); endSet.delete(itemId); set(endorsedSetAtom, endSet);
      if (bucket != null) {
        const st = { ...(get(endorsedBucketsStoreAtom) || {}) };
        if (Array.isArray(st[bucket])) st[bucket] = st[bucket].filter(id => id !== itemId);
        set(endorsedBucketsStoreAtom, st);
      }
      // Remove optimistic global addition if we made one
      if (addedGlobally) {
        const gl = Array.isArray(get(globalEndorsedAtom)) ? get(globalEndorsedAtom) : [];
        set(globalEndorsedAtom, gl.filter(id => id !== itemId));
        addedGlobally = false;
      }
      set(voteLimitReachedAtom, true);
      const pend = new Set(get(pendingEndorseAtom)); pend.delete(itemId); set(pendingEndorseAtom, pend);
      console.debug('[endorse][client] limit reached rollback', { itemId });
      return;
    }
    // Successful endorsement: nothing to do for global list (already added optimistically)
    // Merge authoritative server count if returned (protect against concurrent votes by others)
    if (typeof data?.count === 'number') {
      const vmap = { ...(get(votesAtom) || {}) };
      if (vmap[itemId] == null || data.count > vmap[itemId]) {
        vmap[itemId] = data.count;
        set(votesAtom, vmap);
        // Update cache authoritative count
        if (bucket != null) {
          const cache = { ...(get(votesCacheAtom) || {}) };
          const bucketMap = { ...(cache[bucket] || {}) };
          bucketMap[itemId] = vmap[itemId];
          cache[bucket] = bucketMap;
          set(votesCacheAtom, cache);
        }
      }
    }
    if (bucket != null) set(lastVoteBucketAtom, bucket);
  } catch (e) {
    const error = e as Error;
    // Distinguish network / fetch failure (treat like offline) vs real server error
    if (error?.message && /Failed to fetch|NetworkError/i.test(error.message)) {
      const pendingSync = new Set(Array.isArray(get(pendingSyncVotesAtom)) ? get(pendingSyncVotesAtom) : []);
      pendingSync.add(itemId);
      set(pendingSyncVotesAtom, Array.from(pendingSync));
      // keep optimistic state, do not rollback
    } else {
      // original rollback path
      const curVotes = { ...(get(votesAtom) || {}) };
      curVotes[itemId] = Math.max(0, (curVotes[itemId] || 1) - 1);
      set(votesAtom, curVotes);
      // rollback cache as well if bucket known
      const bucket = get(windowBucketAtom);
      if (bucket != null) {
        const cache = { ...(get(votesCacheAtom) || {}) };
        if (cache[bucket]) {
          const bmap = { ...cache[bucket] };
          bmap[itemId] = curVotes[itemId];
          cache[bucket] = bmap;
          set(votesCacheAtom, cache);
        }
      }
      const endSet = new Set(get(endorsedSetAtom)); endSet.delete(itemId); set(endorsedSetAtom, endSet);
      if (bucket != null) {
        const st = { ...(get(endorsedBucketsStoreAtom) || {}) };
        if (Array.isArray(st[bucket])) st[bucket] = st[bucket].filter(id => id !== itemId);
        set(endorsedBucketsStoreAtom, st);
      } else {
        const pendingEarly = new Set(Array.isArray(get(pendingEndorsedWithoutBucketAtom)) ? get(pendingEndorsedWithoutBucketAtom) : []);
        pendingEarly.delete(itemId); set(pendingEndorsedWithoutBucketAtom, Array.from(pendingEarly));
      }
      if (addedGlobally) {
        const gl = Array.isArray(get(globalEndorsedAtom)) ? get(globalEndorsedAtom) : [];
        set(globalEndorsedAtom, gl.filter(id => id !== itemId));
      }
      if (process.env.NEXT_PUBLIC_VOTE_DEBUG === '1') console.warn('[vote-debug][client] endorse failed, rolled back', { itemId, error: error?.message });
    }
  } finally {
    const p2 = new Set(get(pendingEndorseAtom)); p2.delete(itemId); set(pendingEndorseAtom, p2);
  }
});

// Hydrator: early hydration of global endorsements
export const hydrateGlobalEndorsedAtom = atom(null, (get, set) => {
  const global = Array.isArray(get(globalEndorsedAtom)) ? get(globalEndorsedAtom) : [];
  const store = get(endorsedBucketsStoreAtom) || {};
  // Migrate legacy bucket endorsements into global list (one-time union)
  const union = new Set(global.map(String));
  for (const val of Object.values(store)) {
    if (Array.isArray(val)) {
      for (const id of val) union.add(String(id));
    }
  }
  if (union.size !== global.length) {
    set(globalEndorsedAtom, Array.from(union));
  }
  if (union.size === 0) return;
  const current = get(endorsedSetAtom);
  if (current.size === 0) {
    set(endorsedSetAtom, new Set(union));
  } else {
    // merge if needed
    let changed = false;
    for (const id of union) { if (!current.has(id)) { current.add(id); changed = true; } }
    if (changed) set(endorsedSetAtom, new Set(current));
  }
  // After hydrating sets, reconcile any local baseline deltas
  set(reconcileLocalEndorsementsAtom);
});

export const votesRequestedSetAtom = atom(new Set<ItemId>()); // track ids already requested this session

export const fetchVotesActionAtom = atom(null, async (get, set, _ids: ItemId[]) => {
  // No server-backed votes; rely on snapshot ec and local optimistic updates
  set(hydrateGlobalEndorsedAtom);
  return;
});

export const prefetchAllVotesActionAtom = atom(null, async (get, set, _ids: ItemId[]) => {
  // No server prefetch; counts come from snapshot ec and local state
  set(hydrateGlobalEndorsedAtom);
  return;
});
