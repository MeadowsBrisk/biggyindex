// Image-related utilities

// Cloudinary cloud name (legacy - kept for reference)
const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD || 'YOUR_CLOUD_NAME';

// Toggle Cloudinary on/off via env var (set to 'false' to disable)
// When disabled, images are served directly from origin (no AVIF conversion)
const USE_CLOUDINARY = process.env.NEXT_PUBLIC_USE_CLOUDINARY !== 'false' && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD;

// Cloudflare R2 image optimization (free alternative to Cloudinary)
// Images are pre-optimized by the crawler and stored in R2
// New unified structure: {hash}/thumb.avif, {hash}/full.avif, {hash}/anim.webp
// Item images (/images/i/) and seller avatars (/images/u/) are processed to R2
// Review images (/images/r/) use CF proxy (small, not worth crawling)
const R2_IMAGE_URL = process.env.NEXT_PUBLIC_R2_IMAGE_URL || '';
const USE_R2 = !!R2_IMAGE_URL;

// Pattern to identify images that are pre-processed in R2
// LittleBiggy URL structure: /images/i/ = items, /images/u/ = user avatars, /images/r/ = reviews
// We crawl items + avatars; reviews are small and use CF proxy fallback
const R2_IMAGE_PATTERN = /littlebiggy\.net\/images\/[iu]\//i;

// Cloudflare edge caching: wrap Cloudinary URLs through CF worker to reduce Cloudinary requests
// Set NEXT_PUBLIC_CF_IMAGE_PROXY_BASE to your CF worker domain (e.g., 'https://biggyindex.com')
// Leave empty to use relative path (same domain) or disable CF caching entirely
const CF_IMAGE_PROXY_BASE = process.env.NEXT_PUBLIC_CF_IMAGE_PROXY_BASE || '';
const USE_CF_CACHE = CF_IMAGE_PROXY_BASE !== '';

/**
 * Generate a stable hash for an image URL.
 * Uses FNV-1a hash which produces consistent results and is fast.
 * Note: The image-optimizer uses the same hash function for server-side processing.
 */
function hashUrl(url: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  // Convert to hex, ensure positive, pad to 8 chars
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Get optimized image URL from R2 bucket
 * New unified structure: {hash}/thumb.avif (600px) or {hash}/full.avif (original)
 * For GIFs: {hash}/anim.webp (animated) - always used for GIFs regardless of size
 * 
 * Width logic:
 * - GIFs always get anim.webp (600px animated, good for any display size)
 * - Static: undefined = full, any number = thumb
 */
function r2ImageUrl(url: string, width?: number): string {
  const hash = hashUrl(url);
  const isGif = /\.gif(?:$|[?#])/i.test(url);
  
  // GIFs always get animated webp (it's already 600px max, works for any size)
  if (isGif) {
    return `${R2_IMAGE_URL}/${hash}/anim.webp`;
  }
  
  // Static images: undefined = full-res mode; any width specified = use thumb
  const variant = width === undefined ? 'full' : 'thumb';
  return `${R2_IMAGE_URL}/${hash}/${variant}.avif`;
}

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
 * Proxy image URLs via optimized source (R2, Cloudinary, or direct).
 * Priority: R2 (free, pre-optimized) > CF cache > Cloudinary (paid) > direct
 * 
 * R2 only contains item images (/images/i/) - other images use CF proxy fallback.
 * - Skips local paths (/, ./)
 * - Skips already-proxied URLs
 */
export function proxyImage(url: string, width?: number): string {
  if (!url || typeof url !== 'string') return url as any;
  
  // Skip local paths
  if (url.startsWith('/') || url.startsWith('./')) return url;
  
  // Skip already proxied URLs
  if (url.includes('res.cloudinary.com/') || url.includes('/cf-image-proxy') || (R2_IMAGE_URL && url.includes(R2_IMAGE_URL))) return url;
  
  // Priority 1: Use R2 for ITEM and SELLER images (pre-optimized, free, fastest)
  // Items (/images/i/) and avatars (/images/a/) are crawled and stored in R2
  const isR2Image = R2_IMAGE_PATTERN.test(url);
  if (USE_R2 && isR2Image) {
    return r2ImageUrl(url, width);
  }
  
  // Priority 2: Use CF worker for edge caching (seller avatars, review images, etc.)
  if (USE_CF_CACHE) {
    return wrapWithCloudflare(url);
  }
  
  // Priority 3: Use Cloudinary for on-the-fly AVIF conversion (paid, disabled)
  if (USE_CLOUDINARY) {
    return cloudinaryFetch(url, width);
  }
  
  // No proxying configured - return original
  return url;
}

