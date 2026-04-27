/**
 * Client-side outbound click tracker.
 *
 * Uses sendBeacon for fire-and-forget reliability — the request
 * completes even if the user navigates away immediately.
 *
 * Endpoint is named /api/nav/resolve to avoid ad-blocker rules
 * that target /api/track/* patterns.
 */

export interface OutboundEvent {
  /** Item refNum */
  id: string;
  /** Destination URL */
  url: string;
  /** Item name */
  n?: string;
  /** Seller ID */
  sid?: string;
  /** Seller name */
  sn?: string;
  /** Category */
  c?: string;
  /** Market code (GB, DE, etc.) */
  mkt: string;
  /** Unix timestamp ms (added automatically) */
  ts?: number;
}

/**
 * Track an outbound click to a seller product page.
 * Non-blocking — uses sendBeacon so it never delays navigation.
 */
export function trackOutboundClick(data: Omit<OutboundEvent, "ts">): void {
  try {
    const payload: OutboundEvent = {
      ...data,
      ts: Date.now(),
    };

    const blob = new Blob([JSON.stringify(payload)], {
      type: "application/json",
    });

    // Prefer sendBeacon — survives page navigation
    if (typeof navigator?.sendBeacon === "function") {
      navigator.sendBeacon("/api/nav/resolve", blob);
      return;
    }

    // Fallback to fetch for environments without sendBeacon
    if (typeof fetch === "function") {
      fetch("/api/nav/resolve", {
        method: "POST",
        body: blob,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never throw — tracking should never break the UX
  }
}
