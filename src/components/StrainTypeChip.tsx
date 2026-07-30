/**
 * Strain-type chip — Indica / Sativa / Hybrid.
 *
 * Replaces the old 6px colour dot (2026-07-28). The dot was hover-gated with
 * the rest of the card overlay AND encoded meaning in colour alone, so it was
 * both invisible at rest and unreadable over busy product photos. The word is
 * now the cue; the tint only reinforces it.
 *
 * Shared across the browse card (over-photo variant, dark scrim + white text)
 * and the item detail surfaces (modal + static page), where `surface` swaps in
 * theme-token colours via `.strain-chip--surface` — the base chip's fixed
 * white text is illegible on the light card background.
 *
 * No hooks — safe in Server Components (the static item page imports it).
 */

const STRAIN_GROUPS = new Set(["indica", "sativa", "hybrid"]);

/** True when the value is one of the three renderable strain groups. */
export function isStrainGroup(value: unknown): value is string {
  return typeof value === "string" && STRAIN_GROUPS.has(value.toLowerCase());
}

/**
 * First effect value regardless of shape. `at.effect` is a plain string in
 * the R2 blobs (static page, merged-detail modal path) but an array after
 * the browse store's normalizeAttributes — `?.[0]` on the raw string would
 * grab its first CHARACTER, so both shapes go through here.
 */
export function firstEffectValue(
  effect: string | string[] | null | undefined,
): string | null {
  if (effect == null) return null;
  return (Array.isArray(effect) ? (effect[0] ?? null) : effect) || null;
}

export function StrainTypeChip({
  group,
  surface = false,
}: {
  group: string | string[] | null | undefined;
  /** On-surface variant for detail views (theme tokens, 10px, no scrim). */
  surface?: boolean;
}) {
  const first = firstEffectValue(group);
  if (!isStrainGroup(first)) return null;
  const key = first.toLowerCase();
  return (
    <span
      className={`strain-chip strain-chip--${key}${surface ? " strain-chip--surface" : ""}`}
    >
      {key}
    </span>
  );
}
