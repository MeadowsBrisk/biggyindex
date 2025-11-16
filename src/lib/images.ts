// Image-related utilities

// Proxy image URLs via Cloudflare Worker
// - Skips non-strings
// - Skips already proxied URLs
// - Skips local same-origin paths (/ or same host) to avoid needless round trip
// - Uses Cloudflare Worker for all images (no size limit, global edge cache)
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
  // Skip already proxied URLs (normalize subdomains to apex for cf-image-proxy)
  if (url.includes('/cf-image-proxy?url=')) {
    return url.replace(/^(https?:\/\/)([^\/]+\.biggyindex\.com)(\/cf-image-proxy\?url=.+)$/, '$1biggyindex.com$3');
  }
  
  try {
    // Decide Cloudflare base (dev uses production domain since worker isn't running locally)
    // IMPORTANT: Always use apex domain (biggyindex.com) for image proxy to ensure Cloudflare Worker route works
    // Subdomains (fr.biggyindex.com, it.biggyindex.com, etc.) may not have Worker routes configured
    const getCfBase = (): string | null => {
      if (typeof window === 'undefined') return null;
      const host = window.location.hostname;
      const isDev = host === 'localhost' || host === '127.0.0.1';
      if (isDev) return 'https://lbindex.vip';
      // Use apex domain for all biggyindex.com subdomains
      if (host.endsWith('.biggyindex.com') || host === 'biggyindex.com') {
        return 'https://biggyindex.com';
      }
      // Default to origin for other cases (lbindex.vip, etc.)
      return window.location.origin;
    };

    // Use Cloudflare Worker for all images (no size limit, global edge cache)
    const base = getCfBase();
    if (base) return `${base}/cf-image-proxy?url=${encodeURIComponent(url)}`;
    // SSR fallback - return original
    return url;
  } catch {
    return url;
  }
}
