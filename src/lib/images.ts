import type { Item } from "@/lib/types";

/**
 * FNV-1a hash for stable URL-to-filename mapping.
 *
 * Used by:
 * - Crawler image optimizer (R2 keys during crawl)
 * - Frontend (CDN URL construction)
 *
 * Both MUST produce identical output for the same input. URLs are normalized
 * first so the same image served from rotating LittleBiggy subdomains
 * (i2/i3/i4.littlebiggy.org or .net) hashes to the same key. Otherwise a
 * subdomain rotation orphans every optimized image.
 */
export function normalizeImageUrl(url: string): string {
  if (!url) return url;
  let out = url.replace(
    /^(https?:\/\/)i\d*\.littlebiggy\.(?:org|net)/i,
    "$1i.littlebiggy.org",
  );
  const q = out.indexOf("?");
  if (q >= 0) out = out.slice(0, q);
  const h = out.indexOf("#");
  if (h >= 0) out = out.slice(0, h);
  return out;
}

export function hashUrl(url: string): string {
  const normalized = normalizeImageUrl(url);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ─── R2 CDN image helpers ──────────────────────────────────────────

const CDN_BASE = process.env.NEXT_PUBLIC_R2_IMAGES_URL ?? "img.biggyindex.com";
const CDN_PREFIX = CDN_BASE.startsWith("http")
  ? CDN_BASE
  : `https://${CDN_BASE}`;

type ImageSize = "thumb" | "full" | "icon";

interface ItemImageOptions {
  forceStatic?: boolean;
}

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

function imageFlag(
  value: 1 | 0 | boolean | null | undefined,
): boolean | undefined {
  if (value == null) return undefined;
  return value === true || value === 1;
}

function hashForImage(
  stampedHash: string | null | undefined,
  rawUrl: string | null | undefined,
): string | undefined {
  return stampedHash ?? (rawUrl ? hashUrl(rawUrl) : undefined);
}

function isAnimatedImage(
  stampedFlag: 1 | 0 | boolean | null | undefined,
  rawUrl: string | null | undefined,
): boolean {
  return imageFlag(stampedFlag) === true || isAnimatedUrl(rawUrl ?? "");
}

export function isItemPrimaryAnimated(item: Pick<Item, "i" | "ia">): boolean {
  return isAnimatedImage(item.ia, item.i);
}

export function getItemPrimaryImage(
  item: Pick<Item, "i" | "ih" | "ia">,
  size: ImageSize = "thumb",
  options: ItemImageOptions = {},
): string | undefined {
  const animated = !options.forceStatic && isAnimatedImage(item.ia, item.i);
  return getImageUrl(
    hashForImage(item.ih, item.i),
    item.i ?? undefined,
    size,
    animated,
  );
}

export function getItemGalleryImages(
  item: Pick<Item, "i" | "is" | "ih" | "ish" | "ia" | "isa">,
  size: ImageSize = "full",
  options: ItemImageOptions = {},
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (url: string | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  add(getItemPrimaryImage(item, size, options));

  const rawUrls = item.is ?? [];
  const hashes = item.ish ?? [];
  const animatedFlags = item.isa ?? [];
  const count = Math.max(rawUrls.length, hashes.length, animatedFlags.length);

  for (let index = 0; index < count; index++) {
    const rawUrl = rawUrls[index] ?? null;
    const animated =
      !options.forceStatic && isAnimatedImage(animatedFlags[index], rawUrl);
    add(
      getImageUrl(
        hashForImage(hashes[index], rawUrl),
        rawUrl ?? undefined,
        size,
        animated,
      ),
    );
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
