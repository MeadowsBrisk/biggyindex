// Image-related utilities

// Cloudinary cloud name - set this to your Cloudinary cloud name
const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD || 'YOUR_CLOUD_NAME';

// Use Cloudinary for optimized images (auto format WebP/AVIF, compression)
// Falls back to Cloudflare Worker proxy if Cloudinary not configured
const USE_CLOUDINARY = CLOUDINARY_CLOUD !== 'YOUR_CLOUD_NAME';

// Cloudinary fetch URL builder with responsive sizing
// - f_avif: force AVIF format for best compression (all modern browsers support it)
// - q_auto: automatic quality optimization
// - w_X: resize to specified width (prevents sending oversized images)
// - c_limit: only downscale, never upscale
function cloudinaryFetch(url: string, width?: number): string {
  // Cloudinary fetch mode - fetches from any URL and transforms on the fly
  const transforms = width 
    ? `f_avif,q_auto,w_${width},c_limit`
    : 'f_avif,q_auto';
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${transforms}/${encodeURIComponent(url)}`;
}

// Proxy image URLs via Cloudinary (preferred) or Cloudflare Worker (fallback)
// - Skips non-strings
// - Skips already proxied URLs
// - Skips local same-origin paths (/ or same host) to avoid needless round trip
// - Cloudinary: auto WebP/AVIF, compression, CDN
// - Cloudflare Worker: CORS proxy with edge caching
// - width: optional target width for responsive images (default: 400 for cards, omit for full size)
export function proxyImage(url: string, width?: number): string {
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
  // Skip already proxied URLs (Cloudinary or Cloudflare)
  if (url.includes('res.cloudinary.com/')) return url;
  if (url.includes('/cf-image-proxy?url=')) {
    return url.replace(/^(https?:\/\/)([^\/]+\.biggyindex\.com)(\/cf-image-proxy\?url=.+)$/, '$1biggyindex.com$3');
  }
  
  try {
    // Use Cloudinary if configured (preferred - better compression, format negotiation)
    if (USE_CLOUDINARY) {
      return cloudinaryFetch(url, width);
    }

    // Fallback to Cloudflare Worker proxy
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
