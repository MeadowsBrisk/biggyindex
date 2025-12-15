// Image-related utilities

// Cloudinary cloud name
const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD || 'YOUR_CLOUD_NAME';

// Toggle Cloudinary on/off via env var (set to 'false' to disable)
// When disabled, images are served directly from origin (no AVIF conversion)
const USE_CLOUDINARY = process.env.NEXT_PUBLIC_USE_CLOUDINARY !== 'false';

// Cloudflare edge caching: wrap Cloudinary URLs through CF worker to reduce Cloudinary requests
// Set NEXT_PUBLIC_CF_IMAGE_PROXY_BASE to your CF worker domain (e.g., 'https://biggyindex.com')
// Leave empty to use relative path (same domain) or disable CF caching entirely
const CF_IMAGE_PROXY_BASE = process.env.NEXT_PUBLIC_CF_IMAGE_PROXY_BASE || '';
const USE_CF_CACHE = CF_IMAGE_PROXY_BASE !== '';

// Cloudinary fetch URL builder with responsive sizing
// - f_avif: force AVIF format for best compression
// - q_auto: automatic quality optimization
// - w_X: resize to specified width
// - c_limit: only downscale, never upscale
function cloudinaryFetch(url: string, width?: number): string {
  const transforms = width 
    ? `f_avif,q_auto,w_${width},c_limit`
    : 'f_avif,q_auto';
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${transforms}/${encodeURIComponent(url)}`;
}

/**
 * Wrap a URL through Cloudflare worker for edge caching.
 * This dramatically reduces origin requests (Cloudinary in our case).
 */
function wrapWithCloudflare(url: string): string {
  return `${CF_IMAGE_PROXY_BASE}/cf-image-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Proxy image URLs via Cloudinary for optimization, optionally cached via Cloudflare.
 * Flow: Browser → CF Worker (edge cache) → Cloudinary (AVIF/resize) → origin
 * - Skips local paths (/, ./)
 * - Skips already-proxied URLs
 */
export function proxyImage(url: string, width?: number): string {
  if (!url || typeof url !== 'string') return url as any;
  
  // Skip local paths
  if (url.startsWith('/') || url.startsWith('./')) return url;
  
  // Skip already proxied URLs
  if (url.includes('res.cloudinary.com/') || url.includes('/cf-image-proxy')) return url;
  
  // Use Cloudinary for AVIF conversion and resizing
  if (USE_CLOUDINARY) {
    const cloudinaryUrl = cloudinaryFetch(url, width);
    
    // Wrap through Cloudflare for edge caching (reduces Cloudinary requests)
    if (USE_CF_CACHE) {
      return wrapWithCloudflare(cloudinaryUrl);
    }
    
    return cloudinaryUrl;
  }
  
  // Not configured - return original
  return url;
}

