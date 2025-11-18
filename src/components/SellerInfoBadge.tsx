"use client";
import React, { useEffect, useState, useCallback } from "react";
import cn from "@/app/cn";
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom, pushOverlayAtom } from '@/store/atoms';
import { loadSellersIndex, getCachedSellerByName } from '@/lib/sellersIndex';

// deprecated?6
type SellerOnlineFlag = 'today' | 'yesterday' | null;

function OnlineDot({ online }: { online: SellerOnlineFlag }) {
  if (online !== 'today') return null;
  return (
    <span className="ml-0.5 relative inline-flex" title="online today" aria-label="online today">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-600 ring-2 ring-white dark:ring-gray-900 shadow-sm" />
    </span>
  );
}

type Props = { sellerName: string; sellerUrl?: string; sellerOnline?: SellerOnlineFlag; market?: string };
export default function SellerInfoBadge({ sellerName, sellerUrl, sellerOnline, market }: Props) {
  const openSeller = useSetAtom(expandedSellerIdAtom);
  const pushOverlay = useSetAtom(pushOverlayAtom);
  const [sellerId, setSellerId] = useState<number | string | null>(null);
  const [onlineFlag, setOnlineFlag] = useState<SellerOnlineFlag>(null);

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
    // Load sellers index (environment infers market via middleware); cached per session
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

  const handleClick = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (sellerId != null) {
      pushOverlay('seller');
      (openSeller as any)(sellerId);
    }
  }, [sellerId, pushOverlay, openSeller]);

  const disabled = sellerId == null;
  // Prefer explicit prop if provided; otherwise, use cached sellers index flag
  const effectiveOnline: SellerOnlineFlag = (sellerOnline ?? onlineFlag ?? null) as SellerOnlineFlag;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all duration-200",
        disabled
          ? "border-gray-200/70 dark:border-gray-700/50 bg-white/40 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 cursor-default"
          : "border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 hover:bg-white hover:border-gray-300 hover:shadow-sm dark:hover:bg-gray-700 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      )}
    >
      <span className="truncate max-w-[140px]">{sellerName || "Unknown"}</span>
      <OnlineDot online={effectiveOnline} />
    </button>
  );
}
