/**
 * Lightweight outbound click tracking for "View on Little Biggy" links.
 *
 * Fires a `navigator.sendBeacon` event to our own endpoint so we can track
 * outbound referral clicks without depending on a third-party analytics SDK.
 *
 * Optional GA4 is commented out (future-proof).
 */

interface OutboundClickEvent {
  /** Item refNum or seller ID */
  id: string;
  /** 'item' or 'seller' */
  type: 'item' | 'seller';
  /** Destination URL (Little Biggy) */
  url: string;
  /** Market code (GB, DE, FR, etc.) */
  market?: string;
  /** Category if known */
  category?: string;
}

/**
 * Track an outbound click to Little Biggy.
 * Non-blocking — uses sendBeacon so it doesn't delay navigation.
 */
export function trackOutboundClick(event: OutboundClickEvent) {
  try {
    const payload = {
      ...event,
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

    // 2. GA4 event (if loaded in the future)
    // if (typeof window !== 'undefined' && (window as any).gtag) {
    //   (window as any).gtag('event', 'outbound_click', {
    //     event_category: 'referral',
    //     event_label: event.id,
    //     transport_type: 'beacon',
    //     outbound_url: event.url,
    //     item_type: event.type,
    //   });
    // }
  } catch {
    // Never block navigation
  }
}
