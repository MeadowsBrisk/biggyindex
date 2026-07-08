/**
 * Category landing-page slug map (/category/{slug}).
 *
 * Reclaims v1's ranked /category/* URLs — the nine v1 slugs plus "shake"
 * (new v2 category). Distillate deliberately has NO landing page: it's a
 * tiny category with no v1 URL equity; its items still appear under
 * /browse filters.
 *
 * Shared contract for anything that links to category pages
 * (hero tiles, footer, sitemap, breadcrumbs):
 * - `CATEGORY_SLUGS`   — every landing-page slug, display order
 * - `slugToCategory()` — URL slug → canonical category name (null = 404)
 * - `categoryToSlug()` — category name → slug (null = no landing page)
 */

import type { Category } from "@/lib/constants";

export const CATEGORY_SLUGS = [
  "flower",
  "shake",
  "hash",
  "concentrates",
  "vapes",
  "prerolls",
  "edibles",
  "tincture",
  "psychedelics",
  "other",
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

const SLUG_TO_CATEGORY: Record<CategorySlug, Category> = {
  flower: "Flower",
  shake: "Shake",
  hash: "Hash",
  concentrates: "Concentrates",
  vapes: "Vapes",
  prerolls: "PreRolls",
  edibles: "Edibles",
  tincture: "Tincture",
  psychedelics: "Psychedelics",
  other: "Other",
};

const CATEGORY_TO_SLUG = new Map<string, CategorySlug>(
  (Object.entries(SLUG_TO_CATEGORY) as Array<[CategorySlug, Category]>).map(
    ([slug, category]) => [category, slug],
  ),
);

/** URL slug → canonical category name. Null for unknown slugs (→ 404). */
export function slugToCategory(slug: string): Category | null {
  const normalized = slug.toLowerCase();
  return (
    (SLUG_TO_CATEGORY as Record<string, Category | undefined>)[normalized] ??
    null
  );
}

/** Category name → landing-page slug. Null when no landing page exists. */
export function categoryToSlug(
  category: string | null | undefined,
): CategorySlug | null {
  if (!category) return null;
  return CATEGORY_TO_SLUG.get(category) ?? null;
}
