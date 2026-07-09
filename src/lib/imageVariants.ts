/**
 * Responsive card-image variant contract (frontend mirror).
 * ========================================================
 *
 * The crawler emits fixed-width AVIF renders — `{hash}/w320.avif`,
 * `{hash}/w640.avif`, `{hash}/w1024.avif` — alongside the legacy 600px
 * `thumb.avif`, and records which widths actually exist per hash in the shared
 * image-meta aggregate. This module mirrors the ladder + key scheme so the
 * frontend can build an honest `srcset` without importing across repos.
 *
 * CANONICAL SOURCE (read-only reference, do NOT import):
 *   dashboard/scripts/unified-crawler/stages/images/variants.ts
 * Keep `CARD_VARIANT_WIDTHS`, `IMAGE_VARIANT_VERSION` and `variantKey` in sync
 * with that file if the crawler contract ever changes.
 *
 * ~175 legacy hashes have no variants (image-meta lacks `variantV`); only
 * widths recorded under `variantV >= 1` are ever referenced, so those hashes
 * keep serving the plain `thumb.avif` with no srcset.
 */

/** Fixed AVIF width ladder for grid-card srcset. Longest-edge (width) pixels. */
export const CARD_VARIANT_WIDTHS = [320, 640, 1024] as const;

/**
 * Minimum `variantV` the frontend trusts. Widths recorded below this gate are
 * ignored (treated as "no variants") so a contract bump can't make us
 * reference files an older backfill never produced.
 */
export const IMAGE_VARIANT_VERSION = 1;

/** R2/CDN path for a card variant, e.g. `abc12345/w640.avif`. */
export function variantKey(hash: string, width: number): string {
  return `${hash}/w${width}.avif`;
}

/**
 * Pack a list of available ladder widths into a bitmask (bit i ⇔
 * CARD_VARIANT_WIDTHS[i]). Compact wire form for the /api/browse payload —
 * one small int per image hash instead of an array of widths.
 */
export function widthsToMask(widths: readonly number[]): number {
  let mask = 0;
  for (const w of widths) {
    const idx = CARD_VARIANT_WIDTHS.indexOf(
      w as (typeof CARD_VARIANT_WIDTHS)[number],
    );
    if (idx >= 0) mask |= 1 << idx;
  }
  return mask;
}

/** Unpack a bitmask back into its ascending list of ladder widths. */
export function maskToWidths(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < CARD_VARIANT_WIDTHS.length; i++) {
    if (mask & (1 << i)) out.push(CARD_VARIANT_WIDTHS[i]);
  }
  return out;
}
