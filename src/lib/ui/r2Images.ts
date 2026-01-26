/**
 * R2 Image Utilities
 * 
 * Unified approach for both static images and GIFs:
 * - All images: {hash}/thumb.avif (600px thumbnail)
 * - Static: {hash}/full.avif (original size)
 * - GIF: {hash}/anim.webp (animated version)
 * 
 * No gif-map needed! Frontend detects GIFs by:
 * 1. URL extension (.gif)
 * 2. HEAD request to anim.webp (200 = GIF, 404 = static)
 */

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_IMAGE_URL || '';

/**
 * FNV-1a hash - must match crawler's hashUrl
 */
export function hashUrl(url: string): string {
  let hash = 2166136261;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Check if URL is a GIF by extension
 */
export function isGifUrl(url: string): boolean {
  return /\.gif(?:$|[?#])/i.test(url);
}

/**
 * Get R2 thumbnail URL (works for all images)
 */
export function getThumbUrl(sourceUrl: string): string {
  if (!R2_PUBLIC_URL || !sourceUrl) return sourceUrl;
  const hash = hashUrl(sourceUrl);
  return `${R2_PUBLIC_URL}/${hash}/thumb.avif`;
}

/**
 * Get R2 full-size URL (static images only)
 */
export function getFullUrl(sourceUrl: string): string {
  if (!R2_PUBLIC_URL || !sourceUrl) return sourceUrl;
  const hash = hashUrl(sourceUrl);
  return `${R2_PUBLIC_URL}/${hash}/full.avif`;
}

/**
 * Get R2 animated URL (GIFs only)
 */
export function getAnimUrl(sourceUrl: string): string {
  if (!R2_PUBLIC_URL || !sourceUrl) return sourceUrl;
  const hash = hashUrl(sourceUrl);
  return `${R2_PUBLIC_URL}/${hash}/anim.webp`;
}

// Cache for anim.webp existence checks (avoids repeated HEAD requests)
const animExistsCache = new Map<string, boolean>();

/**
 * Check if anim.webp exists for this image (i.e., is it a processed GIF?)
 * Uses HEAD request with caching.
 */
export async function checkAnimExists(sourceUrl: string): Promise<boolean> {
  if (!R2_PUBLIC_URL || !sourceUrl) return false;
  
  const hash = hashUrl(sourceUrl);
  if (animExistsCache.has(hash)) {
    return animExistsCache.get(hash)!;
  }
  
  try {
    const animUrl = `${R2_PUBLIC_URL}/${hash}/anim.webp`;
    const res = await fetch(animUrl, { method: 'HEAD' });
    const exists = res.ok;
    animExistsCache.set(hash, exists);
    return exists;
  } catch {
    animExistsCache.set(hash, false);
    return false;
  }
}

/**
 * Preload anim check for known GIF URLs (call early to warm cache)
 */
export function preloadAnimCheck(urls: string[]): void {
  const gifUrls = urls.filter(isGifUrl);
  // Fire and forget - just warm the cache
  gifUrls.forEach(url => checkAnimExists(url));
}

/**
 * Get the best image URL for display
 * @param sourceUrl Original image URL
 * @param variant 'thumb' | 'full' | 'anim'
 */
export function getR2Url(sourceUrl: string, variant: 'thumb' | 'full' | 'anim' = 'thumb'): string {
  if (!R2_PUBLIC_URL || !sourceUrl) return sourceUrl;
  
  switch (variant) {
    case 'thumb': return getThumbUrl(sourceUrl);
    case 'full': return getFullUrl(sourceUrl);
    case 'anim': return getAnimUrl(sourceUrl);
    default: return getThumbUrl(sourceUrl);
  }
}

export const R2_ENABLED = !!R2_PUBLIC_URL;
