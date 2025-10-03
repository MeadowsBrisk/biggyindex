// Image-related utilities

// Proxy image URLs via Netlify Edge Function or Serveproxy CDN for faster loads.
// - Skips non-strings
// - Skips already proxied URLs
// - Skips local same-origin paths (/ or same host) to avoid needless round trip
// - Uses Netlify Edge for GIFs/PNGs (no size limit)
// - Uses Serveproxy for JPGs/WebP (3MB limit but faster)
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
  if (url.startsWith('https://serveproxy.com/?url=') || url.includes('/api/image-proxy?url=')) return url;
  
  try {
    // Use Netlify Edge for GIFs and PNGs (no size limit)
    if (/\.(gif|png)(?:$|[?#])/i.test(url)) {
      if (typeof window !== 'undefined') {
        return `${window.location.origin}/api/image-proxy?url=${encodeURIComponent(url)}`;
      }
      // SSR fallback - return original
      return url;
    }
    // Use Serveproxy for JPGs/WebP (faster, 3MB limit is fine for these)
    return `https://serveproxy.com/?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}
