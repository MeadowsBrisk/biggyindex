/**
 * Strain-type chip — Indica / Sativa / Hybrid. DETAIL SURFACES ONLY (item
 * modal + static item page pill rows).
 *
 * Styled to be indistinguishable in metrics from its sibling subcategory
 * pills (`rounded-md bg-surface px-2 py-0.5 text-xs`) — sentence case, same
 * type size, same shape — with a coloured dot and a faint tint as the only
 * differences. Never give it a one-off style of its own; it has to read as
 * part of the surrounding pill row. On BROWSE CARDS the strain is NOT this
 * component: it renders inside the category pill (see CardPill in
 * ItemCard.tsx).
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
}: {
  group: string | string[] | null | undefined;
}) {
  const first = firstEffectValue(group);
  if (!isStrainGroup(first)) return null;
  const key = first.toLowerCase();
  // Sentence case, matching every other pill on the site — nothing else in
  // these views shouts in uppercase, so neither does this.
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  return (
    <span className={`strain-chip strain-chip--${key}`}>
      <span className="card-pill__group-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
