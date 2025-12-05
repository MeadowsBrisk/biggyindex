"use client";
import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAtom, useSetAtom } from 'jotai';
import { sellerAnalyticsOpenAtom, expandedSellerIdAtom } from '@/store/atoms';
import { getMarketFromPath } from "@/lib/market/market";
import { motion, AnimatePresence } from 'framer-motion';
import cn from '@/lib/core/cn';
import SellerAvatarTooltip from '@/components/seller/SellerAvatarTooltip';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useHistoryState } from '@/hooks/useHistoryState';
import { formatBritishDateTime } from '@/lib/core/format';
import { relativeCompact, translateOnlineStatus } from '@/lib/ui/relativeTimeCompact';
import { useTranslations } from 'next-intl';

const SORT_COLUMNS = {
  totalReviews: { key: 'totalReviews', i18n: 'reviews', path: 'lifetime.totalReviews' },
  positiveRate: { key: 'positiveRate', i18n: 'positiveRate', path: null }, // computed
  negativeCount: { key: 'negativeCount', i18n: 'negatives', path: 'lifetime.negativeCount' },
  perfectScores: { key: 'perfectScores', i18n: 'perfectScores', path: 'lifetime.perfectScoreCount' },
  avgRating: { key: 'avgRating', i18n: 'rating', path: 'lifetime.avgRating' },
  avgShipping: { key: 'avgShipping', i18n: 'avgShipping', path: 'lifetime.avgDaysToArrive' },
} as const;

type SortKey = keyof typeof SORT_COLUMNS;

function getNestedValue(obj: any, path: string | null) {
  if (!path) return null;
  return path.split('.').reduce((acc: any, part: string) => acc?.[part], obj);
}

// Safely access translations; fall back to defaults when provider context missing.
function useFormatUpdatedAt() {
  let tRel: any;
  try {
    tRel = useTranslations('Rel');
  } catch {
    // Fallback translator returns null so relativeCompact uses its internal defaults
    tRel = (key: string) => null;
  }
  return (isoDate?: string | null) => {
    if (!isoDate) return '';
    const relative = relativeCompact(isoDate, tRel as any);
    const formatted = formatBritishDateTime(isoDate);
    return relative ? `${formatted} (${relative})` : formatted;
  };
}

export default function SellerAnalyticsModal(): React.ReactElement | null {
  const [open, setOpen] = useAtom<boolean>(sellerAnalyticsOpenAtom as any);
  const router = useRouter();
  const setExpandedSeller = useSetAtom(expandedSellerIdAtom as any);
  const [analytics, setAnalytics] = useState<any>(null);
  const [sellersIndex, setSellersIndex] = useState<Map<any, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('totalReviews');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const formatUpdatedAt = useFormatUpdatedAt();
  // Localizations
  let tRel: any;
  try { tRel = useTranslations('Rel'); } catch { tRel = (k: string) => null; }
  let tA: any;
  try { tA = useTranslations('Analytics'); } catch { tA = (k: string, _?: any) => k; }
  
  useBodyScrollLock(open);

  // Use centralized history manager
  useHistoryState({
    id: 'analytics-modal',
    type: 'analytics',
    isOpen: open,
    onClose: () => setOpen(false)
  });

  // Sync URL hash with modal state for shareable URLs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // On open, set hash to #sellers
    if (open && window.location.hash !== '#sellers') {
      window.history.replaceState(null, '', '#sellers');
    }
    // On close, remove hash (if it's #sellers)
    if (!open && window.location.hash === '#sellers') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [open]);

  // Open modal if page loads with #sellers hash
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#sellers' && !open) {
      setOpen(true);
    }
    // Listen for hash changes (e.g., user clicks a link with #sellers)
    const onHashChange = () => {
      if (window.location.hash === '#sellers' && !open) {
        setOpen(true);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    
    setLoading(true);
    setError(null);
    
    const mkt = getMarketFromPath(typeof window !== 'undefined' ? window.location.pathname : '/');
    const qs = `?mkt=${encodeURIComponent(mkt)}`;
    Promise.all([
      fetch(`/api/index/seller-analytics${qs}`).then(res => res.ok ? res.json() : null),
      fetch(`/api/index/sellers${qs}`).then(res => res.ok ? res.json() : null)
    ])
      .then(([analyticsData, sellersData]) => {
        setAnalytics(analyticsData);
        if (sellersData?.sellers) {
          const map = new Map<any, any>();
          sellersData.sellers.forEach((s: any) => {
            if (s.id != null) map.set(String(s.id), s);
          });
          setSellersIndex(map);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Analytics load error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [open]);

  useEffect(() => {
    if (!open && router?.pathname === '/sellers') {
      router.replace('/');
    }
  }, [open, router]);

  const sortedSellers = useMemo(() => {
    if (!analytics?.sellers) return [] as any[];
    
    const sellers = [...analytics.sellers];
    const col = SORT_COLUMNS[sortBy];
    const dir = sortDir === 'desc' ? -1 : 1;
    
    sellers.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      
      if (sortBy === 'positiveRate') {
        const aTotal = a.lifetime?.totalReviews || 0;
        const aPos = a.lifetime?.positiveCount || 0;
        const bTotal = b.lifetime?.totalReviews || 0;
        const bPos = b.lifetime?.positiveCount || 0;
        aVal = aTotal > 0 ? (aPos / aTotal) * 100 : 0;
        bVal = bTotal > 0 ? (bPos / bTotal) * 100 : 0;
      } else {
        aVal = getNestedValue(a, col.path);
        bVal = getNestedValue(b, col.path);
      }
      
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      return (aVal - bVal) * dir;
    });
    
    return sellers;
  }, [analytics, sortBy, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  const handleSellerClick = (sellerId: any) => {
    setExpandedSeller(sellerId);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={() => setOpen(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-4xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{tA('title')}</h2>
              {analytics && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                  {tA('sellersTracked', { count: analytics.totalSellers })} • {tA('updated')} {formatUpdatedAt(analytics.generatedAt)}
                </p>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              aria-label={tA('close')}
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="h-12 w-12 rounded-full border-4 border-gray-300 dark:border-gray-600 border-t-blue-500 animate-spin" />
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="text-4xl mb-3">⚠️</div>
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              </div>
            )}

            {!loading && !error && sortedSellers.length === 0 && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">No analytics data available yet</p>
                </div>
              </div>
            )}

            {!loading && !error && sortedSellers.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/80 backdrop-blur-sm z-10">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 w-64">
                        {tA('columns.seller')}
                      </th>
                      {Object.values(SORT_COLUMNS).map((col) => (
                        <th
                          key={col.key}
                          className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors select-none"
                          onClick={() => handleSort(col.key as SortKey)}
                        >
                          <div className="inline-flex items-center gap-1">
                            {tA(`columns.${col.i18n}`)}
                            {sortBy === col.key && (
                              <span className="text-blue-600 dark:text-blue-400">
                                {sortDir === 'desc' ? '↓' : '↑'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {sortedSellers.map((seller: any, idx: number) => {
                      const positiveRate = seller.lifetime?.totalReviews > 0
                        ? ((seller.lifetime.positiveCount / seller.lifetime.totalReviews) * 100).toFixed(1)
                        : '0.0';
                      
                      const sellerInfo = sellersIndex?.get(String(seller.sellerId));
                      // online field from sellers index: 'today', 'yesterday', '2 days ago', etc.
                      // Use translateOnlineStatus for proper i18n
                      const onlineVal = sellerInfo?.online;
                      const lastSeenLabel = translateOnlineStatus(onlineVal, tRel);
                      
                      return (
                        <tr
                          key={seller.sellerId}
                          className={cn(
                            'hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors cursor-pointer',
                            idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'
                          )}
                          onClick={() => handleSellerClick(seller.sellerId)}
                        >
                          {/* Seller column */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="shrink-0">
                                {seller.imageUrl ? (
                                  <SellerAvatarTooltip sellerName={seller.sellerName} sellerImageUrl={seller.imageUrl}>
                                    <img
                                      src={seller.imageUrl}
                                      alt={seller.sellerName}
                                      className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                                    />
                                  </SellerAvatarTooltip>
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm font-semibold">
                                    {seller.sellerName?.[0]?.toUpperCase() || '?'}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                  {seller.sellerName || 'Unknown'}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {lastSeenLabel}
                                </div>
                              </div>
                            </div>
                          </td>
                          
                          {/* Total Reviews */}
                          <td className="px-3 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                            {seller.lifetime?.totalReviews?.toLocaleString() || '0'}
                          </td>
                          
                          {/* Positive % */}
                          <td className="px-3 py-3 text-right">
                            <span className={cn(
                              'inline-flex items-center justify-center min-w-14 px-2 py-1 rounded-full text-xs font-semibold',
                              parseFloat(positiveRate) >= 95 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' :
                              parseFloat(positiveRate) >= 85 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                              parseFloat(positiveRate) >= 70 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                              'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            )}>
                              {positiveRate}%
                            </span>
                          </td>
                          
                          {/* Negatives */}
                          <td className="px-3 py-3 text-right">
                            <span className={cn(
                              'inline-flex items-center justify-center min-w-8 text-sm font-medium',
                              seller.lifetime?.negativeCount > 0 
                                ? 'text-red-600 dark:text-red-400' 
                                : 'text-gray-400 dark:text-gray-600'
                            )}>
                              {seller.lifetime?.negativeCount || '0'}
                            </span>
                          </td>
                          
                          {/* Perfect Scores (10/10) - COUNT of 10/10 reviews */}
                          <td className="px-3 py-3 text-right">
                            <span className={cn(
                              'inline-flex items-center justify-center min-w-8 text-sm font-medium',
                              seller.lifetime?.perfectScoreCount > 0 
                                ? 'text-emerald-600 dark:text-emerald-400' 
                                : 'text-gray-400 dark:text-gray-600'
                            )}>
                              {seller.lifetime?.perfectScoreCount || '0'}
                            </span>
                          </td>
                          
                          {/* Avg Rating - average rating across all reviews */}
                          <td className="px-3 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                            {seller.lifetime?.avgRating != null ? seller.lifetime.avgRating.toFixed(1) : '—'}
                          </td>
                          
                          {/* Avg Shipping */}
                          <td className="px-3 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                            {seller.lifetime?.avgDaysToArrive != null ? `${seller.lifetime.avgDaysToArrive.toFixed(1)}${(tRel && tRel('day')) || 'd'}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer hint */}
          {!loading && !error && sortedSellers.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Click any seller to view their full profile
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
