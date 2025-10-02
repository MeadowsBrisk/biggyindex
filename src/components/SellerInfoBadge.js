import React, { useEffect, useState, useCallback } from "react";
import cn from "@/app/cn";
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom, pushOverlayAtom } from '@/store/atoms';
import { loadSellersIndex, getCachedSellerByName } from '@/lib/sellersIndex';

function OnlineDot({ online }) {
  if (online !== 'today') return null;
  return (
    <span className="ml-0.5 relative inline-flex" title="online today" aria-label="online today">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-600 ring-2 ring-white dark:ring-gray-900 shadow-sm" />
    </span>
  );
}

export default function SellerInfoBadge({ sellerName, sellerUrl, sellerOnline }) {
  const openSeller = useSetAtom(expandedSellerIdAtom);
  const pushOverlay = useSetAtom(pushOverlayAtom);
  const [sellerId, setSellerId] = useState(null);

  useEffect(() => {
    setSellerId(null);
    if (!sellerName) return;
    const lower = sellerName.toLowerCase();
    const cached = getCachedSellerByName(lower);
    if (cached && cached.id != null) {
      setSellerId(cached.id);
      return;
    }
    let cancelled = false;
    loadSellersIndex()
      .then(() => {
        if (cancelled) return;
        const fetched = getCachedSellerByName(lower);
        if (fetched && fetched.id != null) setSellerId(fetched.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sellerName]);

  const handleClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (sellerId != null) {
      pushOverlay('seller');
      openSeller(sellerId);
    }
  }, [sellerId, pushOverlay, openSeller]);

  const disabled = sellerId == null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
        disabled
          ? "border-gray-200/70 dark:border-gray-700/50 bg-white/40 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 cursor-default"
          : "border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      )}
    >
      <span className="truncate max-w-[140px]">{sellerName || "Unknown"}</span>
      <OnlineDot online={sellerOnline} />
    </button>
  );
}
