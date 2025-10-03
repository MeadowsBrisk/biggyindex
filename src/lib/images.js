// Image-related utilities

// Proxy image URLs via Cloudflare Worker, Netlify Edge, or Serveproxy CDN
// - Skips non-strings
// - Skips already proxied URLs
// - Skips local same-origin paths (/ or same host) to avoid needless round trip
// - Uses Cloudflare Worker for GIFs/PNGs (no size limit, global edge cache)
// - Uses Serveproxy for JPGs/WebP (3MB limit but fast enough)
export function proxyImage(url) {
  if (!url || typeof url !== 'string') return url;
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
      url.includes('/cf-image-proxy?url=')) return url;
  
  try {
    // Use Cloudflare Worker for GIFs and PNGs (no size limit, global edge cache)
    if (/\.(gif|png)(?:$|[?#])/i.test(url)) {
      if (typeof window !== 'undefined') {
        return `${window.location.origin}/cf-image-proxy?url=${encodeURIComponent(url)}`;
      }
      // SSR fallback - return original
      return url;
    }
    // Use Serveproxy for JPGs/WebP (3MB limit is fine for these)
    return `https://serveproxy.com/?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}
