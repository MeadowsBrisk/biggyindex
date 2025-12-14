import { useEffect, useState, useCallback } from 'react';
import {
  loadItemDetail,
  getCachedDetail,
  isDetailAvailable,
  isDetailNotFound,
  subscribeItemDetail,
  prefetchItemDetail
} from '@/lib/data/itemDetailsCache';

interface ItemDetail {
  refNum: string | number;
  notFound?: boolean;
  [key: string]: unknown;
}

interface UseItemDetailResult {
  detail: ItemDetail | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Hook to load item details with smart cache invalidation.
 * @param refNum - The item reference number
 * @param indexLua - Optional. The item's lastUpdatedAt from the index (e.g., baseItem.lua). 
 *                   If provided and newer than the cached version, triggers a refetch.
 */
export function useItemDetail(refNum: string | number | null, indexLua?: string): UseItemDetailResult {
  const [detail, setDetail] = useState<ItemDetail | null>(() => (refNum ? getCachedDetail(refNum, indexLua) : null));
  const [loading, setLoading] = useState<boolean>(!!refNum && !detail);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(() => {
    if (!refNum) return;
    setLoading(true);
    setError(null);
    loadItemDetail(refNum, indexLua).then((d: ItemDetail | null) => {
      setDetail(d);
      setLoading(false);
    }).catch((e: Error) => {
      setError(e);
      setLoading(false);
    });
  }, [refNum, indexLua]);

  // Refetch whenever refNum or indexLua changes. Clear stale previous detail (different refNum) immediately for correct skeleton state.
  useEffect(() => {
    if (!refNum) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }
    // If current detail belongs to a different item, reset it.
    if (detail && detail.refNum !== refNum) {
      setDetail(null);
    }
    const cached = getCachedDetail(refNum, indexLua);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      return; // no fetch needed
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadItemDetail(refNum, indexLua)
      .then((d: ItemDetail | null) => { if (!cancelled) { setDetail(d); setLoading(false); } })
      .catch((e: Error) => { if (!cancelled) { setError(e); setLoading(false); } });
    return () => { cancelled = true; };
  }, [refNum, indexLua]);

  return { detail, loading, error, reload };
}

export function useItemDetailLazy(refNum: string | number | null, enabled: boolean): UseItemDetailResult {
  const [active, setActive] = useState(enabled);
  useEffect(() => { if (enabled) setActive(true); }, [enabled]);
  return useItemDetail(active ? refNum : null);
}

// Hook that returns tri-state availability for a detail JSON without loading full detail unless prefetch triggered
// States:
//  available: boolean | null (null = unknown yet)
//  notFound: boolean (true if we confirmed 404)
//  ensure() triggers a prefetch (idempotent) to resolve state
interface DetailAvailabilityResult {
  available: boolean | null;
  notFound: boolean;
  ensure: () => void;
}

export function useDetailAvailability(refNum: string | number | null): DetailAvailabilityResult {
  const [, setTick] = useState(0);
  const force = () => setTick(t => t + 1);

  useEffect(() => {
    const unsub = subscribeItemDetail((changed) => { if (changed === refNum) force(); });
    return unsub;
  }, [refNum]);

  const available = refNum ? (isDetailAvailable(refNum) ? true : (isDetailNotFound(refNum) ? false : null)) : null;
  const notFound = refNum ? isDetailNotFound(refNum) : false;
  const ensure = () => { if (refNum && available == null) prefetchItemDetail(refNum); };

  return { available, notFound, ensure };
}
