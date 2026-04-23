/**
 * FNV-1a hash for stable URL-to-filename mapping.
 *
 * Used by:
 * - Crawler image optimizer (R2 keys during crawl)
 * - Frontend (CDN URL construction)
 *
 * Both MUST produce identical output for the same input.
 */
export function hashUrl(url: string): string {
  let hash = 2166136261;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ─── R2 CDN image helpers ──────────────────────────────────────────

const CDN_BASE =
  process.env.NEXT_PUBLIC_R2_IMAGES_URL ?? "img.biggyindex.com";
const CDN_PREFIX = CDN_BASE.startsWith("http")
  ? CDN_BASE
  : `https://${CDN_BASE}`;

type ImageSize = "thumb" | "full" | "icon";

/**
 * Returns an optimised R2 CDN URL for an image hash.
 * Falls back to the original source URL if no hash.
 */
export function getImageUrl(
  hash: string | undefined,
  fallbackUrl?: string,
  size: ImageSize = "thumb",
  animated?: boolean,
): string | undefined {
  if (hash) {
    if (animated) return `${CDN_PREFIX}/${hash}/anim.webp`;
    return `${CDN_PREFIX}/${hash}/${size}.avif`;
  }
  return fallbackUrl;
}

/**
 * Build an array of optimised image URLs for a gallery.
 */
export function getGalleryUrls(
  primaryUrl: string | undefined,
  primaryHash: string | undefined,
  extraUrls: string[] | undefined,
  extraHashes: string[] | undefined,
  size: ImageSize = "full",
): string[] {
  const urls: string[] = [];
  const primary = getImageUrl(primaryHash, primaryUrl, size);
  if (primary) urls.push(primary);
  const count = Math.max(extraUrls?.length ?? 0, extraHashes?.length ?? 0);
  for (let i = 0; i < count; i++) {
    const url = getImageUrl(
      extraHashes?.[i] || undefined,
      extraUrls?.[i] || undefined,
      size,
    );
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Detect animated source URLs (GIFs) by extension.
 */
function isAnimatedUrl(url: string): boolean {
  return /\.gif(\?|$)/i.test(url);
}

/**
 * Get optimised CDN URL for an item image.
 * Hashes the raw source URL to derive the R2 CDN path.
 *
 * @param rawUrl - Raw source URL (item.i or item.is[n])
 * @param size - 'thumb' for cards, 'full' for zoom/detail
 * @param forceStatic - If true, return thumb.avif even for animated sources (pause GIFs)
 */
export function getItemImageUrl(
  rawUrl: string | null | undefined,
  size: ImageSize = "thumb",
  forceStatic?: boolean,
): string | undefined {
  if (!rawUrl) return undefined;
  const hash = hashUrl(rawUrl);
  const animated = !forceStatic && isAnimatedUrl(rawUrl);
  return getImageUrl(hash, rawUrl, size, animated);
}

/**
 * Check if a raw URL points to an animated image (GIF).
 */
export function isAnimated(url: string | null | undefined): boolean {
  return !!url && isAnimatedUrl(url);
}

/**
 * Get optimised seller avatar URL.
 * Hashes the source URL to derive the CDN path (same FNV-1a as crawler).
 */
export function getSellerImageUrl(
  sourceUrl: string | null | undefined,
  size: ImageSize = "thumb",
): string | undefined {
  if (!sourceUrl) return undefined;
  const hash = hashUrl(sourceUrl);
  return getImageUrl(hash, sourceUrl, size);
}
