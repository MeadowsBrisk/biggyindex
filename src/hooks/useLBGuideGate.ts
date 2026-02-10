import { useAtomValue, useSetAtom } from "jotai";
import { lbGuideSeenAtom, lbGuideModalOpenAtom, lbGuidePendingUrlAtom } from "@/store/atoms";
import { useCallback } from "react";
import { trackOutboundClick } from "@/lib/tracking/outbound";
import { getMarketFromPath } from "@/lib/market/market";

/**
 * Returns an onClick handler for "View on LittleBiggy" links.
 * On first click (guide not yet seen), intercepts navigation and opens the guide modal.
 * After the guide has been seen, fires outbound click tracking (non-blocking) and
 * lets normal <a> behaviour proceed.
 *
 * Market is auto-detected from the current URL path if not provided.
 */
export function useLBGuideGate(url: string | null, meta?: { id?: string; type?: 'item' | 'seller'; market?: string; category?: string }) {
  const seen = useAtomValue(lbGuideSeenAtom);
  const setModalOpen = useSetAtom(lbGuideModalOpenAtom);
  const setPendingUrl = useSetAtom(lbGuidePendingUrlAtom);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (!url) return;

      if (!seen) {
        // First time: intercept and show guide
        e.preventDefault();
        setPendingUrl(url);
        setModalOpen(true);
        return;
      }

      // Auto-detect market from path if not provided
      const market = meta?.market || (typeof window !== 'undefined' ? getMarketFromPath(window.location.pathname) : 'GB');

      // Guide already seen: track outbound click (non-blocking), let <a> navigate
      trackOutboundClick({
        id: meta?.id || extractIdFromUrl(url),
        type: meta?.type || 'item',
        url,
        market,
        category: meta?.category,
      });
    },
    [seen, url, setModalOpen, setPendingUrl, meta?.id, meta?.type, meta?.market, meta?.category]
  );

  return onClick;
}

/** Extract item refNum, seller id, or short link code from a LittleBiggy URL */
function extractIdFromUrl(url: string): string {
  try {
    const m = url.match(/\/item\/([^/]+)/);
    if (m) return m[1];
    const s = url.match(/\/seller\/([^/]+)/);
    if (s) return s[1];
    // Short links: /link/mxF0iT → mxF0iT
    const l = url.match(/\/link\/([^/?#]+)/);
    if (l) return `link:${l[1]}`;
  } catch {}
  return 'unknown';
}
