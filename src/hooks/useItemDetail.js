import { useEffect, useState, useCallback } from 'react';
import { loadItemDetail, getCachedDetail, clearItemDetail, isDetailAvailable, isDetailNotFound, subscribeItemDetail, prefetchItemDetail } from '@/lib/itemDetailsCache';

export function useItemDetail(refNum) {
  const [detail, setDetail] = useState(() => (refNum ? getCachedDetail(refNum) : null));
  const [loading, setLoading] = useState(!!refNum && !detail);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    if (!refNum) return;
    setLoading(true);
    setError(null);
    loadItemDetail(refNum).then(d => {
      setDetail(d);
      setLoading(false);
    }).catch(e => {
      setError(e);
      setLoading(false);
    });
  }, [refNum]);

  // Refetch whenever refNum changes. Clear stale previous detail (different refNum) immediately for correct skeleton state.
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
    const cached = getCachedDetail(refNum);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      return; // no fetch needed
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadItemDetail(refNum)
      .then(d => { if (!cancelled) { setDetail(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e); setLoading(false); } });
    return () => { cancelled = true; };
  }, [refNum]);

  return { detail, loading, error, reload };
}

export function useItemDetailLazy(refNum, enabled) {
  const [active, setActive] = useState(enabled);
  useEffect(() => { if (enabled) setActive(true); }, [enabled]);
  return useItemDetail(active ? refNum : null);
}

// Hook that returns tri-state availability for a detail JSON without loading full detail unless prefetch triggered
// States:
//  available: boolean | null (null = unknown yet)
//  notFound: boolean (true if we confirmed 404)
//  ensure() triggers a prefetch (idempotent) to resolve state
export function useDetailAvailability(refNum) {
  const [tick, setTick] = useState(0);
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
