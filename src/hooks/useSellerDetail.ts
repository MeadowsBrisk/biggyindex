"use client";
import { useEffect, useState, useCallback, useRef } from 'react';
import { loadSellerDetail, getCachedSellerDetail } from '@/lib/data/sellerDetailsCache';

// Define a flexible type for seller detail since it comes from external API
export interface SellerDetail {
  sellerId?: string;
  sellerName?: string;
  [key: string]: unknown;
}

export interface UseSellerDetailResult {
  detail: SellerDetail | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Hook to load seller detail by ID with caching support.
 */
export function useSellerDetail(sellerId: string | null | undefined): UseSellerDetailResult {
  const [detail, setDetail] = useState<SellerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback((forceRefresh = false) => {
    if (!sellerId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = getCachedSellerDetail(sellerId);
      if (cached) {
        setDetail(cached as SellerDetail);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    loadSellerDetail(sellerId)
      .then((j) => {
        if (mountedRef.current) {
          setDetail(j as SellerDetail);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (mountedRef.current) {
          setError(e);
          setLoading(false);
        }
      });
  }, [sellerId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  return { detail, loading, error, reload };
}
