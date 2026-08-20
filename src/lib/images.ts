import { maskToWidths, widthsToMask } from "@/lib/imageVariants";
import type { Item } from "@/lib/types";

/**
 * URL normalization for the FNV-1a image hash — a two-sided contract with the
 * crawler's image optimizer, which derives R2 keys the same way. Both MUST
 * produce identical output for the same input, so any change has to ship to
 * both at once.
 *
 * Normalizing collapses the rotating LittleBiggy subdomains
 * (i2/i3/i4.littlebiggy.org or .net) and strips query/fragment; without it a
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

/** Public origin of the image CDN — used for <link rel="preconnect"> in the layout. */
export const IMAGE_CDN_ORIGIN = CDN_PREFIX;

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
 * Convert an optimised AVIF CDN URL into its WebP sibling for social-share
 * metadata (og:image / twitter:image).
 *
 * On-page images use AVIF, but social scrapers (Facebook, WhatsApp, X, Slack,
 * iMessage) cannot decode it — an AVIF og:image renders as a blank preview.
 *
 * Only rewrites optimised CDN AVIF URLs (…/full.avif, …/thumb.avif,
 * …/icon.avif). Already-WebP URLs, raw source URLs and any non-CDN URL pass
 * through untouched.
 *
 * IMPORTANT: the returned URL only resolves if the crawler's image pipeline
 * emits the matching WebP variant for that tier. Where it emits AVIF only,
 * the URL 404s on the CDN. WebP siblings exist only for animated hashes
 * (anim.webp / icon.webp); the static full/thumb/icon tiers are AVIF-only
 * unless the crawler backfills them, so their rewritten URLs 404 until it does.
 */
export function getOgImageUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (!url.startsWith(CDN_PREFIX)) return url;
  if (url.endsWith(".avif")) return `${url.slice(0, -".avif".length)}.webp`;
  return url;
}

/**
 * Map an image URL to its MIME type from the file extension, for
 * og:image:type / twitter image metadata. Returns undefined when unknown.
 */
export function imageMimeType(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.endsWith(".webp")) return "image/webp";
  if (url.endsWith(".avif")) return "image/avif";
  if (url.endsWith(".png")) return "image/png";
  if (url.endsWith(".jpg") || url.endsWith(".jpeg")) return "image/jpeg";
  if (url.endsWith(".gif")) return "image/gif";
  return undefined;
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

// ─── Responsive card srcset ────────────────────────────────────────
//
// The crawler emits fixed-width AVIF renders (`{hash}/w320.avif`, w640, w1024)
// beside the 600px `thumb.avif` and records which widths exist per hash in the
// shared image-meta aggregate. These helpers turn that into a card `srcSet`.
// NEVER emit a descriptor for a width that isn't recorded — an unrecorded
// candidate 404s. The fallback `src` stays `thumb.avif`, so legacy /
// no-variant / animated hashes are unaffected.

/** Resolved primary image hash for an item (stamped `ih`, else hashed `i`). */
export function getItemPrimaryHash(
  item: Pick<Item, "i" | "ih">,
): string | undefined {
  return hashForImage(item.ih, item.i);
}

/**
 * Per-slot image state used to build the compact `vw` variant field. Index 0 is
 * the primary image; the rest mirror `is`/`ish`/`isa` positionally. Animated
 * slots are surfaced so the caller can skip srcset (animated hashes serve
 * `anim.webp` and have no w-variants).
 */
interface ItemImageSlot {
  hash: string | undefined;
  animated: boolean;
}

function itemImageSlots(
  item: Pick<Item, "i" | "ih" | "ia" | "is" | "ish" | "isa">,
): ItemImageSlot[] {
  const slots: ItemImageSlot[] = [
    {
      hash: hashForImage(item.ih, item.i),
      animated: isAnimatedImage(item.ia, item.i),
    },
  ];
  const rawUrls = item.is ?? [];
  const hashes = item.ish ?? [];
  const animatedFlags = item.isa ?? [];
  const count = Math.max(rawUrls.length, hashes.length, animatedFlags.length);
  for (let i = 0; i < count; i++) {
    const rawUrl = rawUrls[i] ?? null;
    slots.push({
      hash: hashForImage(hashes[i], rawUrl),
      animated: isAnimatedImage(animatedFlags[i], rawUrl),
    });
  }
  return slots;
}

/**
 * Build the compact `vw` field for an item (server-side): a bitmask per image
 * slot (index-parallel to [primary, ...gallery]) over CARD_VARIANT_WIDTHS.
 * Animated and unknown slots are 0. Returns `undefined` when no slot has
 * variants, so the field can be omitted from the payload. Trailing zero slots
 * are trimmed to save bytes — the client tolerates a short array.
 */
export function itemVariantMasks(
  item: Pick<Item, "i" | "ih" | "ia" | "is" | "ish" | "isa">,
  lookup: (hash: string) => readonly number[] | undefined,
): number[] | undefined {
  const masks = itemImageSlots(item).map((slot) => {
    if (!slot.hash || slot.animated) return 0;
    const widths = lookup(slot.hash);
    return widths?.length ? widthsToMask(widths) : 0;
  });
  let end = masks.length;
  while (end > 0 && masks[end - 1] === 0) end--;
  if (end === 0) return undefined;
  return masks.slice(0, end);
}

/**
 * Client-side inverse of `itemVariantMasks`: reconstruct a hash → widths map
 * from an item's `vw` field. Keyed by hash (not position) so a srcset lookup is
 * robust to the gallery's URL de-duplication. Animated hashes were zeroed
 * server-side, so they never appear here.
 */
export function buildItemVariantWidthMap(
  item: Pick<Item, "i" | "ih" | "is" | "ish" | "vw">,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const vw = item.vw;
  if (!vw || vw.length === 0) return map;
  const slots = itemImageSlots(item);
  for (let i = 0; i < slots.length && i < vw.length; i++) {
    const hash = slots[i].hash;
    const mask = vw[i];
    if (hash && mask) map.set(hash, maskToWidths(mask));
  }
  return map;
}

/**
 * Extract the hash from an optimised CDN thumb URL
 * (`{CDN}/{hash}/thumb.avif`). Returns undefined for anything else — a raw
 * fallback URL, a `full.avif` (high-res mode) or an `anim.webp` (animated) —
 * which is exactly the set of images that must NOT get a srcset.
 */
function parseCdnThumbHash(url: string | undefined): string | undefined {
  if (!url || !url.startsWith(`${CDN_PREFIX}/`)) return undefined;
  const rest = url.slice(CDN_PREFIX.length + 1);
  const slash = rest.indexOf("/");
  if (slash < 0) return undefined;
  if (rest.slice(slash + 1) !== "thumb.avif") return undefined;
  return rest.slice(0, slash);
}

function srcSetForHashWidths(
  hash: string,
  widths: readonly number[] | undefined,
): string | undefined {
  if (!widths || widths.length === 0) return undefined;
  return widths.map((w) => `${CDN_PREFIX}/${hash}/w${w}.avif ${w}w`).join(", ");
}

/**
 * Build a card `srcSet` for a rendered thumb URL from an explicit width list
 * (server cards, where the caller already resolved the primary hash's widths).
 * No-ops (returns undefined) unless `url` is an optimised `thumb.avif`, so
 * high-res `full.avif` / animated `anim.webp` URLs never get a srcset.
 */
export function variantSrcSetForUrl(
  url: string | undefined,
  widths: readonly number[] | undefined,
): string | undefined {
  const hash = parseCdnThumbHash(url);
  if (!hash) return undefined;
  return srcSetForHashWidths(hash, widths);
}

/**
 * Build a card `srcSet` for a rendered thumb URL using a hash → widths map
 * (client cards, from `buildItemVariantWidthMap`). Automatically yields no
 * srcset for high-res (`full.avif`), animated (`anim.webp`) and any hash the
 * map doesn't cover (legacy / no-variant / animated).
 */
export function cardImageSrcSet(
  url: string | undefined,
  widthMap: Map<string, number[]>,
): string | undefined {
  const hash = parseCdnThumbHash(url);
  if (!hash) return undefined;
  return srcSetForHashWidths(hash, widthMap.get(hash));
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
 * Get optimised CDN URL for a buyer review photo.
 *
 * Mirrored by the crawler under the same FNV-1a URL-hash contract as item
 * images and seller avatars: hash the STORED segment URL verbatim (see
 * `normalizeImageUrl`). The CDN URL is derived from the raw URL already
 * present in every review payload — no extra data is plumbed.
 *
 * A photo can legitimately be missing from the CDN (not yet mirrored, failed
 * optimisation, garbage-collected), so render through `ReviewPhotoImg`, which
 * falls back to the raw upstream URL on error — user photos have no
 * placeholder equivalent, unlike avatars falling back to initials.
 *
 * Exactly ONE mirrored variant exists, `{hash}/thumb.avif`, used by both tiles
 * and zoom: uploads are size-limited (~400w) and the 600px thumb tier never
 * upscales, so extra tiers would store byte-duplicate pixels.
 *
 * @param rawUrl - Raw stored photo URL (review segment `url`/`value`)
 */
export function getReviewPhotoUrl(
  rawUrl: string | null | undefined,
): string | undefined {
  if (!rawUrl) return undefined;
  const hash = hashUrl(rawUrl);
  return `${CDN_PREFIX}/${hash}/thumb.avif`;
}

/**
 * Get optimised seller avatar URL.
 * Hashes the source URL to derive the CDN path (same FNV-1a as crawler).
 * Defaults to the tiny avatar crop. GIF avatars use animated icon.webp.
 */
export function getSellerImageUrl(
  sourceUrl: string | null | undefined,
  size: ImageSize = "icon",
): string | undefined {
  if (!sourceUrl) return undefined;
  const hash = hashUrl(sourceUrl);
  if (isAnimatedUrl(sourceUrl)) {
    return `${CDN_PREFIX}/${hash}/${
      size === "icon" ? "icon.webp" : "anim.webp"
    }`;
  }
  return getImageUrl(hash, sourceUrl, size);
}

/**
 * Downgrade an ALREADY-optimised CDN image URL to its 96px `icon` tier.
 *
 * Some payloads (notably the home feed's review rows) carry pre-built CDN URLs
 * at the 600px `thumb.avif` / animated `anim.webp` tier. Rendering one in a
 * 24px slot ships ~15x more pixels than needed, so this maps it to the `icon`
 * sibling the crawler emits for every hash. Inverse of the upgrade
 * `SellerAvatarTooltip` applies for its hover preview.
 *
 * Non-CDN URLs (raw marketplace originals) and unrecognised tiers pass through
 * untouched — hash those with `getItemImageUrl`/`getSellerImageUrl` instead.
 */
export function toIconVariantUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith(`${CDN_PREFIX}/`)) return url;
  const slash = url.lastIndexOf("/");
  const file = url.slice(slash + 1);
  const dir = url.slice(0, slash + 1);
  if (file === "anim.webp") return `${dir}icon.webp`;
  if (file === "thumb.avif" || file === "full.avif") return `${dir}icon.avif`;
  return url;
}
