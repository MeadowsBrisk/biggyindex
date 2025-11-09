// Market and locale helpers for host- and path-based routing and API calls

export type Market = 'GB' | 'DE' | 'FR' | 'PT' | 'IT';

// Host-based detection for production: subdomains on biggyindex.com (primary)
// Also recognize lbindex.vip (legacy) as GB apex; subdomains map if ever used.
export function getMarketFromHost(hostname: string | undefined | null): Market {
  try {
    const host = String(hostname || '').toLowerCase();
    if (!host) return 'GB';
    // Strip port
    const h = host.split(':')[0];
    // Handle apex and www
    if (h === 'biggyindex.com' || h === 'www.biggyindex.com') return 'GB';
    if (h === 'lbindex.vip' || h === 'www.lbindex.vip') return 'GB';
    if (h.endsWith('.biggyindex.com')) {
      if (h.startsWith('de.')) return 'DE';
      if (h.startsWith('fr.')) return 'FR';
      if (h.startsWith('pt.')) return 'PT';
      if (h.startsWith('it.')) return 'IT';
      return 'GB';
    }
    if (h.endsWith('.lbindex.vip')) {
      if (h.startsWith('de.')) return 'DE';
      if (h.startsWith('fr.')) return 'FR';
      if (h.startsWith('pt.')) return 'PT';
      if (h.startsWith('it.')) return 'IT';
      return 'GB';
    }
    // Netlify previews or other hosts: leave to path-based unless strong hint
    if (/\bde[.-]/.test(h)) return 'DE';
    if (/\bfr[.-]/.test(h)) return 'FR';
    if (/\bpt[.-]/.test(h)) return 'PT';
    if (/\bit[.-]/.test(h)) return 'IT';
    return 'GB';
  } catch {
    return 'GB';
  }
}

// Determine the market from the browser environment: prefer host, then path
export function getMarketFromPath(pathname: string = "/"): Market {
  try {
    if (typeof window !== 'undefined' && (window as any).location?.hostname) {
      const host = (window as any).location.hostname;
      if (isHostBasedEnv(host)) {
        const fromHost = getMarketFromHost(host);
        if (fromHost) return fromHost;
      }
    }
    // Path-based detection (default for localhost/dev)
    const urlPath = typeof pathname === "string" ? pathname : "/";
    const clean = urlPath.split("?")[0].split("#")[0];
    const partsPath = clean.startsWith("/") ? clean.slice(1).split("/") : clean.split("/");
    const seg = (partsPath && partsPath[0]) || "";
    if (seg.toLowerCase() === "de") return "DE";
    if (seg.toLowerCase() === "fr") return "FR";
    if (seg.toLowerCase() === "pt") return "PT";
    if (seg.toLowerCase() === "it") return "IT";
    return "GB";
  } catch {
    return "GB";
  }
}

// Map a market to a BCP 47 locale string for next-intl
export function getLocaleForMarket(market: Market): string {
  switch (market) {
    case "DE":
      return "de-DE";
    case "FR":
      return "fr-FR";
    case "PT":
      return "pt-PT";
    case "IT":
      return "it-IT";
    default:
      return "en-GB";
  }
}

// Server-side: derive market from request headers
// Note: Header-based detection removed. Middleware injects ?mkt from host, and
// client-side derives market from host or path as appropriate.

// Utility: whether current host implies host-based markets (biggyindex.com subdomains)
export function isHostBasedEnv(hostname?: string | null): boolean {
  try {
    const h = String(hostname || (typeof window !== 'undefined' ? (window as any).location?.hostname : '') || '').toLowerCase();
    if (!h) return false;
    if (h === 'localhost' || h.startsWith('localhost:')) return false;
    // We only consider biggyindex.com as host-based market env (subdomains).
    // lbindex.vip remains path-based to preserve compatibility (no subdomain rollout planned).
    return h === 'biggyindex.com' || h === 'www.biggyindex.com' || h.endsWith('.biggyindex.com');
  } catch {
    return false;
  }
}

// Append or replace the mkt query param on a path. Preserves existing query.
// Removed buildMarketApi: middleware normalizes API calls, and clients can pass explicit mkt when needed.
