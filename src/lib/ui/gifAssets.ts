/**
 * GIF Asset Utilities (R2-based)
 * 
 * No gif-map.json needed! Uses unified R2 folder structure:
 *   {hash}/thumb.avif - Poster/thumbnail (all images)
 *   {hash}/anim.webp  - Animated version (GIFs only)
 * 
 * GIF detection: URL extension (.gif) - if it ends in .gif, anim.webp exists.
 */

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_IMAGE_URL || '';

/**
 * FNV-1a hash - must match crawler's hashUrl
 */
function hashUrl(url: string): string {
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
export function isGifUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.gif(?:$|[?#])/i.test(url);
}

/**
 * Get R2 URLs for a source image
 */
export function getR2Urls(sourceUrl: string): {
  thumb: string;
  full: string;
  anim: string;
} {
  if (!R2_PUBLIC_URL || !sourceUrl) {
    return { thumb: sourceUrl, full: sourceUrl, anim: '' };
  }
  const hash = hashUrl(sourceUrl);
  return {
    thumb: `${R2_PUBLIC_URL}/${hash}/thumb.avif`,
    full: `${R2_PUBLIC_URL}/${hash}/full.avif`,
    anim: `${R2_PUBLIC_URL}/${hash}/anim.webp`,
  };
}

/**
 * React hook for GIF assets
 * Returns poster and animation URLs.
 * No HEAD check needed - if URL ends in .gif, we assume anim.webp exists.
 */
export function useGifAsset(originalUrl: string | null | undefined) {
  const isGif = isGifUrl(originalUrl);
  const urls = originalUrl ? getR2Urls(originalUrl) : null;
  
  return {
    loading: false,
    isGif,
    hasAnim: isGif, // If it's a GIF URL, anim.webp exists (crawler creates it)
    hasEntry: isGif, // Backwards compat
    // Poster is always thumb.avif
    poster: urls?.thumb || originalUrl || '',
    posterProxied: urls?.thumb || originalUrl || '',
    // Animation is anim.webp (for GIFs)
    anim: isGif ? urls?.anim : null,
    video: isGif ? urls?.anim : null, // Backwards compat alias
    // Full size for static images
    full: urls?.full || originalUrl || '',
  };
}

/**
 * Legacy exports for backwards compatibility
 */
export function loadGifMap(): Promise<Record<string, any>> {
  // No-op - no gif-map needed
  return Promise.resolve({});
}

export function getGifEntry(url: string | null | undefined) {
  if (!url || !isGifUrl(url)) return null;
  const urls = getR2Urls(url);
  // Return a compatible entry shape for ThemeSync
  return {
    poster: urls.thumb,
    video: null, // No video/MP4 anymore, using anim.webp
    anim: urls.anim,
  };
}

export function refreshGifMap() {
  // No-op - no cache needed
  return Promise.resolve({});
}
