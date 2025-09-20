// Image-related utilities

// Proxy image URLs via Serveproxy CDN for faster loads.
// - Skips non-strings and animated GIFs
// - Skips large PNGs (original rule)
// - Skips already proxied URLs
// - NEW: Skips local same-origin paths (/ or same host) to avoid needless round trip
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
  if (/\.(gif|png)(?:$|[?#])/i.test(url)) return url; // skip GIFs and large PNGs
  if (url.startsWith('https://serveproxy.com/?url=')) return url;
  try {
    return `https://serveproxy.com/?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}
