"use client";
import React, { useEffect, useState, useCallback } from "react";
import Link from 'next/link';
import cn from "@/lib/core/cn";
import { useAtom, useAtomValue } from 'jotai';
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom, pushOverlayAtom, includedSellersAtom, excludedSellersAtom } from '@/store/atoms';
import { loadSellersIndex, getCachedSellerByName } from '@/lib/data/sellersIndex';
import { useTranslations } from 'next-intl';

type SellerOnlineFlag = 'today' | 'yesterday' | null;

function OnlineDot({ online }: { online: SellerOnlineFlag }) {
  if (online !== 'today') return null;
  return (
    <span className="ml-0.5 relative inline-flex" title="online today" aria-label="online today">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-600 ring-2 ring-white dark:ring-gray-900 shadow-sm" />
    </span>
  );
}

type Props = { 
  sellerName: string; 
  sellerUrl?: string; 
  sellerOnline?: SellerOnlineFlag; 
  market?: string;
  /** When set, clicking the seller badge navigates to this URL instead of opening the overlay */
  sellerPageHref?: string;
  className?: string;
};

export default function SellerPill({ sellerName, sellerUrl, sellerOnline, market, sellerPageHref, className }: Props) {
  const tUI = useTranslations('UI');
  const openSeller = useSetAtom(expandedSellerIdAtom);
  const pushOverlay = useSetAtom(pushOverlayAtom);
  const [sellerId, setSellerId] = useState<number | string | null>(null);
  const [onlineFlag, setOnlineFlag] = useState<SellerOnlineFlag>(null);
  
  const [included, setIncluded] = useAtom(includedSellersAtom as any) as [string[], (v: any) => void];
  const [excluded, setExcluded] = useAtom(excludedSellersAtom as any) as [string[], (v: any) => void];
  
  const lower = (sellerName || '').toLowerCase();
  const isIncluded = (included || []).includes(lower);
  const isExcluded = (excluded || []).includes(lower);

  useEffect(() => {
    setSellerId(null);
    setOnlineFlag(null);
    if (!sellerName) return;
    const lower = sellerName.toLowerCase();
    const cached = getCachedSellerByName(lower);
    if (cached && cached.id != null) {
      setSellerId(cached.id);
      if (cached.online) setOnlineFlag(cached.online as SellerOnlineFlag);
      return;
    }
    let cancelled = false;
    loadSellersIndex()
      .then(() => {
        if (cancelled) return;
        const fetched = getCachedSellerByName(lower);
        if (fetched && fetched.id != null) setSellerId(fetched.id);
        if (fetched && fetched.online) setOnlineFlag(fetched.online as SellerOnlineFlag);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sellerName, market]);

  const handleSellerClick = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (sellerId != null) {
      pushOverlay('seller');
      (openSeller as any)(sellerId);
    }
  }, [sellerId, pushOverlay, openSeller]);

  const toggleInclude = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lower) return;
    if (isIncluded) {
      setIncluded(included.filter((s: string) => s !== lower));
    } else {
      setIncluded([...(included || []), lower]);
      if ((excluded || []).includes(lower)) {
        setExcluded(excluded.filter((s: string) => s !== lower));
      }
    }
  }, [lower, isIncluded, included, excluded, setIncluded, setExcluded]);

  const toggleExclude = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lower) return;
    if (isExcluded) {
      setExcluded(excluded.filter((s: string) => s !== lower));
    } else {
      setExcluded([...(excluded || []), lower]);
      if ((included || []).includes(lower)) {
        setIncluded(included.filter((s: string) => s !== lower));
      }
    }
  }, [lower, isExcluded, included, excluded, setIncluded, setExcluded]);

  const disabled = sellerId == null && !sellerPageHref;
  const effectiveOnline: SellerOnlineFlag = (sellerOnline ?? onlineFlag ?? null) as SellerOnlineFlag;

  // Determine what buttons to show
  const showBothButtons = !isIncluded && !isExcluded;

  const badgeClassName = cn(
    "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium border-y border-l rounded-l-full transition-all duration-200",
    disabled
      ? "border-gray-200/70 dark:border-gray-700/50 bg-white/40 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 cursor-default"
      : "border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 hover:bg-white hover:border-gray-300 hover:shadow-sm dark:hover:bg-gray-700/50 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
  );

  const badgeContent = (
    <>
      <span className="truncate max-w-[140px]">{sellerName || "Unknown"}</span>
      <OnlineDot online={effectiveOnline} />
    </>
  );

  return (
    <div className={cn("inline-flex items-stretch", className)}>
      {/* Seller Badge - rounded left */}
      {sellerPageHref ? (
        <Link href={sellerPageHref} className={badgeClassName}>
          {badgeContent}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleSellerClick}
          disabled={disabled}
          className={badgeClassName}
        >
          {badgeContent}
        </button>
      )}

      {/* Include Button - conditionally shown */}
      {(showBothButtons || isIncluded) && (
        <button
          type="button"
          onClick={toggleInclude}
          title={isIncluded ? tUI('removeInclude') : tUI('include')}
          aria-label={isIncluded ? tUI('removeInclude') : tUI('include')}
          aria-pressed={isIncluded}
          className={cn(
            "inline-flex items-center justify-center w-6 h-auto text-xs border-y border-l transition-colors",
            showBothButtons && "border-r-0",
            !showBothButtons && isIncluded && "rounded-r-full border-r",
            isIncluded
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700/50"
          )}
        >
          {isIncluded ? '✓' : '+'}
        </button>
      )}

      {/* Exclude Button - conditionally shown or rounded right */}
      {(showBothButtons || isExcluded) && (
        <button
          type="button"
          onClick={toggleExclude}
          title={isExcluded ? tUI('removeExclude') : tUI('exclude')}
          aria-label={isExcluded ? tUI('removeExclude') : tUI('exclude')}
          aria-pressed={isExcluded}
          className={cn(
            "inline-flex items-center justify-center w-6 h-auto text-xs border-y border-r rounded-r-full transition-colors",
            showBothButtons && "border-l",
            isExcluded
              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700/50"
          )}
        >
          {isExcluded ? '✓' : '−'}
        </button>
      )}
    </div>
  );
}
