/**
 * Suggestible fields for BiggyIndex — drives the suggestion form UI.
 *
 * `getSuggestibleFields(category)` returns fields relevant to a given category:
 * - Category (always)
 * - Subcategories filtered to the active category
 * - Attribute fields that apply to that category (tier, micron, etc.)
 * - Wrong Product flag (always)
 *
 * The form recomputes this when the user stages a category change, so the
 * subcategory + attribute options stay in sync with the effective category.
 */

export interface SuggestibleField {
  key: string;
  label: string;
  /** 'single' = radio/pill picker, 'multi' = checkbox list, 'flag' = boolean flag */
  inputType: "single" | "multi" | "flag";
  options?: string[];
  /** Dot-path to read current value from Item (e.g. 'c', 'sc', 'at.tier') */
  itemField: string;
}

// ─── Static data ───────────────────────────────────────────────────

export const CATEGORIES = [
  "Flower",
  "Shake",
  "Hash",
  "Edibles",
  "Vapes",
  "Concentrates",
  "Distillate",
  "PreRolls",
  "Tincture",
  "Psychedelics",
  "Other",
];

const SUBCATEGORIES_BY_CATEGORY: Record<string, string[]> = {
  Flower: [
    "Gelato",
    "Cookies",
    "Runtz",
    "OGKush",
    "Haze",
    "Diesel",
    "Zkittlez",
    "Dawg",
    "Cheese",
    "Cake",
    "Mochi",
    "Sherbet",
    "Blueberry",
    "Landrace",
    "Fruity",
    "Mintz",
    "Exotic",
    "Imported",
    "Exotics",
    "Smalls",
  ],
  Shake: ["Shake", "Trim", "Popcorn", "Dust", "SugarLeaf"],
  Hash: [
    "Moroccan",
    "DrySift",
    "Static",
    "Bubble",
    "Mousse",
    "Frozen",
    "Piatella",
    "TempleBall",
    "Kief",
    "Moonrocks",
    "Blonde",
    "Black",
    "TripleFiltered",
    "120u",
    "90u",
    "Charras",
  ],
  Edibles: [
    "Gummies",
    "Chocolate",
    "Capsules",
    "Candy",
    "Treats",
    "ButterOil",
    "InfusedOil",
    "Spreads",
    "Bars",
  ],
  Vapes: ["Disposable", "Cartridge", "LiveResin", "Battery"],
  Concentrates: [
    "Wax",
    "Shatter",
    "Rosin",
    "RSO",
    "Oil",
    "Sugar",
    "Diamonds",
    "Pots",
    "Budder",
  ],
  Distillate: ["D9", "D8", "Raw", "Terped", "Syringe"],
  PreRolls: ["Infused", "Singles", "Packs"],
  Tincture: ["Spray", "Sublingual"],
  Psychedelics: ["Mushrooms", "Paper", "Microdose", "Grow"],
  Other: ["Pharmaceutical", "Genetics", "Bongs", "Seeds", "Accessories"],
};

/** Attribute fields that are suggestible per-category. */
const ATTR_FIELDS_BY_CATEGORY: Record<string, SuggestibleField[]> = {
  Flower: [
    {
      key: "tier",
      label: "Quality Tier",
      inputType: "single",
      options: ["Budget", "Mid", "Premium", "Exotic/Cali"],
      itemField: "at.tier",
    },
  ],
  Shake: [
    {
      key: "tier",
      label: "Quality Tier",
      inputType: "single",
      options: ["Budget", "Mid", "Premium", "Exotic/Cali"],
      itemField: "at.tier",
    },
  ],
  Hash: [
    {
      key: "micron",
      label: "Micron Size",
      inputType: "single",
      options: ["45u", "73u", "90u", "120u", "150u", "190u", "Full Spectrum"],
      itemField: "at.micron",
    },
    {
      key: "tier",
      label: "Quality Tier",
      inputType: "single",
      options: ["Budget", "Mid", "Premium", "Exotic/Cali"],
      itemField: "at.tier",
    },
  ],
  Concentrates: [
    {
      key: "tier",
      label: "Quality Tier",
      inputType: "single",
      options: ["Budget", "Mid", "Premium", "Exotic/Cali"],
      itemField: "at.tier",
    },
  ],
};

// ─── Public API ────────────────────────────────────────────────────

/**
 * Build the list of suggestible fields for a given category.
 * If no category is provided, returns only category + wrongProduct.
 */
export function getSuggestibleFields(
  category?: string | null,
): SuggestibleField[] {
  const fields: SuggestibleField[] = [
    {
      key: "category",
      label: "Category",
      inputType: "single",
      options: CATEGORIES,
      itemField: "c",
    },
  ];

  const subs = category ? SUBCATEGORIES_BY_CATEGORY[category] : undefined;
  if (subs && subs.length > 0) {
    fields.push({
      key: "subcategories",
      label: "Subcategories",
      inputType: "multi",
      options: subs,
      itemField: "sc",
    });
  }

  const attrFields = category ? ATTR_FIELDS_BY_CATEGORY[category] : undefined;
  if (attrFields) {
    fields.push(...attrFields);
  }

  fields.push({
    key: "wrongProduct",
    label: "Wrong Product",
    inputType: "flag",
    itemField: "_flag",
  });

  return fields;
}

/** Read a nested item field value. Supports 'at.tier' dot notation. */
export function readItemField(
  item: Record<string, unknown>,
  fieldPath: string,
): string[] | null {
  if (fieldPath === "_flag") return null;
  const parts = fieldPath.split(".");
  let current: unknown = item;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  if (Array.isArray(current)) return current as string[];
  if (typeof current === "string") return [current];
  return null;
}
