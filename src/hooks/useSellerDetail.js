import { useEffect, useState, useCallback } from 'react';
import { loadSellerDetail, getCachedSellerDetail } from '@/lib/sellerDetailsCache';

export function useSellerDetail(sellerId) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    if (!sellerId) return;
    setLoading(true); setError(null);
    const cached = getCachedSellerDetail(sellerId);
    if (cached) { setDetail(cached); setLoading(false); return; }
    loadSellerDetail(sellerId)
      .then((j) => { setDetail(j); setLoading(false); })
      .catch((e) => { setError(e); setLoading(false); });
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId) { setDetail(null); setError(null); setLoading(false); return; }
    setLoading(true); setError(null);
    loadSellerDetail(sellerId)
      .then((j) => { setDetail(j); setLoading(false); })
      .catch((e) => { setError(e); setLoading(false); });
  }, [sellerId]);

  return { detail, loading, error, reload };
}


