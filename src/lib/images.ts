// Image-related utilities

// Toggle: when true, also send JPEG/WebP/others via Cloudflare Worker (disables Serveproxy)
// Flip to false to restore Serveproxy for JPEG/WebP quickly.
export const USE_CLOUDFLARE_FOR_JPEG: boolean = true;

// Proxy image URLs via Cloudflare Worker or Serveproxy CDN
// - Skips non-strings
// - Skips already proxied URLs
// - Skips local same-origin paths (/ or same host) to avoid needless round trip
// - Uses Cloudflare Worker for GIFs/PNGs (no size limit, global edge cache)
// - Uses Cloudflare Worker for JPGs/WebP when USE_CLOUDFLARE_FOR_JPEG=true; otherwise Serveproxy
export function proxyImage(url: string): string {
  if (!url || typeof url !== 'string') return url as any;
  // Skip root-relative or explicit same-origin URLs (poster assets, etc.)
  if (url.startsWith('/') || url.startsWith('./')) return url;
  if (/^https?:\/\//i.test(url)) {
    try {
      if (typeof window !== 'undefined') {
        const locOrigin = window.location.origin;
        if (url.startsWith(locOrigin + '/')) return url; // same-origin absolute
      }
    } catch {}
  }
  // Skip already proxied URLs
  if (url.startsWith('https://serveproxy.com/?url=') || 
    url.includes('/api/image-proxy?url=') ||
    url.includes('/cf-image-proxy?url=')) return url;
  
  try {
    // Decide Cloudflare base (dev uses production domain since worker isn't running locally)
    const getCfBase = (): string | null => {
      if (typeof window === 'undefined') return null;
      const host = window.location.hostname;
      const isDev = host === 'localhost' || host === '127.0.0.1';
  return isDev ? 'https://biggyindex.com' : window.location.origin;
    };

    // Use Cloudflare Worker for GIFs and PNGs (no size limit, global edge cache)
    if (/\.(gif|png)(?:$|[?#])/i.test(url)) {
      const base = getCfBase();
      if (base) return `${base}/cf-image-proxy?url=${encodeURIComponent(url)}`;
      // SSR fallback - return original
      return url;
    }

    // For JPG/JPEG/WEBP/others: route via Cloudflare when flag enabled; otherwise Serveproxy
    if (USE_CLOUDFLARE_FOR_JPEG) {
      const base = getCfBase();
      if (base) return `${base}/cf-image-proxy?url=${encodeURIComponent(url)}`;
      return url;
    }
    // Legacy path: Serveproxy for JPGs/WebP (3MB limit)
    return `https://serveproxy.com/?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}
