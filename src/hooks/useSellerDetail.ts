"use client";
import { useEffect, useState, useCallback } from 'react';
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

  const reload = useCallback(() => {
    if (!sellerId) return;
    setLoading(true);
    setError(null);
    
    const cached = getCachedSellerDetail(sellerId);
    if (cached) {
      setDetail(cached as SellerDetail);
      setLoading(false);
      return;
    }
    
    loadSellerDetail(sellerId)
      .then((j) => { 
        setDetail(j as SellerDetail); 
        setLoading(false); 
      })
      .catch((e: Error) => { 
        setError(e); 
        setLoading(false); 
      });
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    loadSellerDetail(sellerId)
      .then((j) => { 
        setDetail(j as SellerDetail); 
        setLoading(false); 
      })
      .catch((e: Error) => { 
        setError(e); 
        setLoading(false); 
      });
  }, [sellerId]);

  return { detail, loading, error, reload };
}
