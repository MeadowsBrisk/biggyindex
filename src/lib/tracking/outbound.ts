/**
 * Lightweight outbound click tracking for "View on Little Biggy" links.
 *
 * Fires a `navigator.sendBeacon` event to our own endpoint so we can track
 * outbound referral clicks without depending on a third-party analytics SDK.
 *
 * Optional GA4 is commented out (future-proof).
 */

import { getMarketFromPath } from '@/lib/market/market';

export interface OutboundClickEvent {
  /** Item refNum or seller ID */
  id: string;
  /** 'item' or 'seller' */
  type: 'item' | 'seller';
  /** Destination URL (Little Biggy) */
  url: string;
  /** Item or seller name */
  name?: string;
  /** Market code (GB, DE, FR, etc.) — auto-detected if omitted */
  market?: string;
  /** Category if known */
  category?: string;
}

/**
 * Track an outbound click to Little Biggy.
 * Non-blocking — uses sendBeacon so it doesn't delay navigation.
 * Market is auto-detected from the current URL if not provided.
 */
export function trackOutboundClick(event: OutboundClickEvent) {
  try {
    // Auto-detect market from current path if not provided
    const market = event.market || (typeof window !== 'undefined' ? getMarketFromPath(window.location.pathname) : 'GB');

    const payload = {
      ...event,
      market,
      ts: Date.now(),
      page: typeof window !== 'undefined' ? window.location.pathname : '',
    };

    // 1. Beacon to our own lightweight endpoint (countable in Netlify observability)
    if (typeof navigator?.sendBeacon === 'function') {
      navigator.sendBeacon(
        '/api/track/outbound',
        new Blob([JSON.stringify(payload)], { type: 'application/json' })
      );
    }
  } catch {
    // Never block navigation
  }
}
