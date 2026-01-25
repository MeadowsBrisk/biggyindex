import { useEffect, useRef } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import { atom } from 'jotai';
import { fetchVotesActionAtom, prefetchAllVotesActionAtom } from '@/store/votesAtoms';
import { isLoadingAtom, sortedItemsAtom, sortKeyAtom } from '@/store/atoms';

/**
 * Module-level caches to prevent duplicate requests across renders.
 * These persist for the lifetime of the page session.
 */
let lastVotesSigCache = '';
let allVotesSigCache = '';
let prefetchedAllNonEndorseCache = false;

/** Atom to track if initial vote fetch has been triggered */
export const votesInitialFetchTriggeredAtom = atom(false);

/** Reset caches (useful for testing or page transitions) */
export function resetVotesPrefetchCache(): void {
  lastVotesSigCache = '';
  allVotesSigCache = '';
  prefetchedAllNonEndorseCache = false;
}

/** Check if initial votes have been fetched (for loading UI) */
export function hasInitialVotesFetched(): boolean {
  return lastVotesSigCache !== '';
}

/**
 * Consolidated hook for vote prefetching.
 * Handles three scenarios:
 * 1. Initial viewport (first 120 items) - fetch immediately
 * 2. Sorting by endorsements - prefetch all votes immediately
 * 3. Non-endorsement sorts - delayed prefetch of all votes
 */
export function useVotesPrefetch(): void {
  const isLoading = useAtomValue(isLoadingAtom);
  const sorted = useAtomValue(sortedItemsAtom);
  const sortKey = useAtomValue(sortKeyAtom);
  const fetchVotes = useSetAtom(fetchVotesActionAtom);
  const prefetchAllVotes = useSetAtom(prefetchAllVotesActionAtom);
  const setInitialFetchTriggered = useSetAtom(votesInitialFetchTriggeredAtom);

  // Use refs to track current timer IDs for cleanup
  const viewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayedPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timers on cleanup or dependency change
    return () => {
      if (viewportTimerRef.current) {
        clearTimeout(viewportTimerRef.current);
        viewportTimerRef.current = null;
      }
      if (delayedPrefetchTimerRef.current) {
        clearTimeout(delayedPrefetchTimerRef.current);
        delayedPrefetchTimerRef.current = null;
      }
    };
  }, [isLoading, sorted, sortKey]);

  useEffect(() => {
    // Guard: wait for loading to complete and items to be available
    if (isLoading) return;
    if (!sorted || sorted.length === 0) return;

    // Extract all item IDs once
    const allIds = sorted.map((it: any) => it.id).filter(Boolean);
    if (allIds.length === 0) return;

    // === SCENARIO 1: Fetch votes for first 120 visible items ===
    // (Skip if sorting by endorsements - we'll prefetch all instead)
    if (sortKey !== 'endorsements') {
      const viewportIds = allIds.slice(0, 120);
      const viewportSig = viewportIds.join(',');
      
      if (viewportSig !== lastVotesSigCache) {
        const isFirstFetch = lastVotesSigCache === '';
        lastVotesSigCache = viewportSig;
        
        // Clear existing timer and set new one
        if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
        viewportTimerRef.current = setTimeout(() => {
          fetchVotes(viewportIds);
          if (isFirstFetch) setInitialFetchTriggered(true);
          viewportTimerRef.current = null;
        }, 40);
      }
    }

    // === SCENARIO 2: Sorting by endorsements - prefetch ALL votes ===
    if (sortKey === 'endorsements') {
      const sigObj = { 
        kind: 'all', 
        count: sorted.length, 
        first: sorted[0]?.id, 
        last: sorted[sorted.length - 1]?.id 
      };
      const allSig = JSON.stringify(sigObj);
      
      if (allSig !== allVotesSigCache) {
        allVotesSigCache = allSig;
        prefetchAllVotes(allIds);
      }
      return; // Don't run delayed prefetch when sorting by endorsements
    }

    // === SCENARIO 3: Non-endorsement sort with >120 items - delayed prefetch ===
    if (sorted.length > 120 && !prefetchedAllNonEndorseCache) {
      // Clear existing timer
      if (delayedPrefetchTimerRef.current) clearTimeout(delayedPrefetchTimerRef.current);
      
      delayedPrefetchTimerRef.current = setTimeout(() => {
        prefetchAllVotes(allIds);
        prefetchedAllNonEndorseCache = true;
        delayedPrefetchTimerRef.current = null;
      }, 400);
    }
  }, [isLoading, sorted, sortKey, fetchVotes, prefetchAllVotes]);
}
