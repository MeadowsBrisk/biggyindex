/**
 * Variant parsing for item variants.
 *
 * Splits variant descriptions like "3.5 g blue sherbert" into weight + strain,
 * and groups variants by weight (or other unit) for display as size pills.
 *
 * Scope rules:
 *  - Raw `variant.d` is NEVER mutated. The overlay renders it verbatim.
 *  - This module is pure: called from atoms (filtering / sort) and ItemCard (chip row).
 *  - For pricing aggregates the crawler has its own parser; intentionally duplicated.
 */

import type { ItemVariant } from "./types";

/* ─────────── Types ─────────── */

export interface ParsedVariant {
  /** Canonical quantity as a number (grams for weight-bearing, count for pk/cart/etc). */
  qty: number;
  /**
   * Canonical unit tag.
   *   - 'g'  — weight (variant is weight-bearing; `grams` also set)
   *   - 'ml' — volume
   *   - 'mg' — dose
   *   - 'pk' | 'pc' | 'cart' | 'pod' | 'pen' | 'tab' | 'cap' | 'gummy' |
   *     'bottle' | 'jar' | 'bag' | 'bar' | 'chew' | 'square' | 'star' |
   *     'joint' | 'box' | 'tub' | 'pot' | 'item'
   */
  unit: string;
  /** Weight in grams — only set when the variant is weight-bearing. */
  grams?: number;
  /** Canonical compact label used for sorting / keys, e.g. "3.5g", "1ml", "3 carts". */
  weightLabel: string;
  /**
   * Seller-facing label preserving their format where reasonable:
   *   - "28 g" / "28g"       → "28g"
   *   - "1 oz" / "1oz"       → "1oz"
   *   - Slang ("zip","quarter","half","eighth") canonicalized to grams.
   */
  originalLabel: string;
  /** Residual descriptor (strain / flavour / batch note), or null if only noise. */
  strain: string | null;
  /** Original variant. */
  variant: ItemVariant;
}

export interface QuantityGroup {
  /** Unique key: `${qty}:${unit}` — safe for React keys and compares. */
  key: string;
  /** Canonical quantity. */
  qty: number;
  /** Canonical unit. */
  unit: string;
  /** Weight in grams — only set when unit === 'g'. */
  grams?: number;
  /** Canonical label (from cheapest variant). */
  label: string;
  /** Seller-format label (from cheapest variant). */
  originalLabel: string;
  /** Cheapest price in group. */
  price: number;
  /** Highest price in group. */
  priceMax: number;
  /** Variant count in this group. */
  count: number;
  /** Strain descriptors in this group (deduped, noise filtered). */
  strains: string[];
  /** Representative variant (cheapest). */
  variant: ItemVariant;
}

/** Weight-bearing group (grams guaranteed). Returned by `groupByWeight`. */
export type WeightGroup = QuantityGroup & { grams: number };

/* ─────────── Unit tables ─────────── */

/** Map raw count-unit token → canonical tag. */
const COUNT_LABEL_CANONICAL: Record<string, string> = {
  pack: "pk", packs: "pk", pk: "pk", pks: "pk",
  pc: "pc", pcs: "pc", piece: "pc", pieces: "pc",
  cart: "cart", carts: "cart", cartridge: "cart", cartridges: "cart",
  pod: "pod", pods: "pod",
  pen: "pen", pens: "pen",
  tab: "tab", tabs: "tab", tablet: "tab", tablets: "tab",
  capsule: "cap", capsules: "cap", cap: "cap", caps: "cap",
  gummy: "gummy", gummies: "gummy",
  bottle: "bottle", bottles: "bottle",
  jar: "jar", jars: "jar",
  bag: "bag", bags: "bag",
  bar: "bar", bars: "bar",
  chew: "chew", chews: "chew",
  square: "square", squares: "square",
  star: "star", stars: "star",
  preroll: "joint", prerolls: "joint",
  "pre-roll": "joint", "pre-rolls": "joint",
  joint: "joint", joints: "joint",
  roll: "joint", rolls: "joint",
  box: "box", boxes: "box",
  tub: "tub", tubs: "tub",
  pot: "pot", pots: "pot",
  item: "item", items: "item",
};

const COUNT_UNIT_ALT = Object.keys(COUNT_LABEL_CANONICAL)
  // Longer alternates first so "pre-roll" beats "roll"
  .sort((a, b) => b.length - a.length)
  .join("|");

/** Inline weight tokens we strip from residuals to kill "7g jelly breath" → "jelly breath". */
const INNER_WEIGHT_RE =
  /\b\d+(?:\.\d+)?\s*(?:g|gram|grams|mg|kg|ml|oz|ounce|ounces|z)\b/gi;

/** Single-token residuals that are weight-slang noise, not descriptors. */
const WEIGHT_SLANG_NOISE = new Set([
  "zip", "zips", "z", "zs",
  "half", "halfz", "halfzip", "halfoz",
  "quarter", "q", "qtr",
  "eighth", "e", "8th",
  "oz", "ounce", "ounces", "ozs",
  "g", "gram", "grams", "ml", "mg",
  "qp", "hp", "lb", "pound",
]);

/* ─────────── Patterns ─────────── */

/** Ounce-family patterns. Slang canonicalizes to grams; numeric oz preserves "Noz". */
const OZ_PATTERNS: {
  re: RegExp;
  /** Fixed grams for slang tokens ("eighth"=3.5); null when derived from N*28. */
  grams: number | null;
  mult?: number;
  /** Canonical display label when it's slang — else derived from `${num}oz`. */
  label?: string;
}[] = [
  { re: /\beighth\b|⅛|\b1\/8\s*(?:oz)?\b/i, grams: 3.5, label: "3.5g" },
  { re: /\bquarter\b|¼|\b1\/4\s*(?:oz)?\b/i, grams: 7, label: "7g" },
  {
    re: /\bhalf\s*(?:oz|ounce)?\b|½\s*(?:oz)?\b|\b1\/2\s*(?:oz)?\b/i,
    grams: 14,
    label: "14g",
  },
  { re: /\bzip\b/i, grams: 28, label: "28g" },
  { re: /(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces|z)\b/i, grams: null, mult: 28 },
];

/** "3.5 g", "3.5g", "3.5 gram", "14 grams" — at start of string. */
const WEIGHT_RE = /^(\d+(?:\.\d+)?)\s*(g|gram|grams)\b/i;

/** "5 1g nasha" → 5 × 1g = 5g. Also supports "5 x 1g". */
const MULTIPACK_RE =
  /^(\d+)\s+(?:x|×)?\s*(\d+(?:\.\d+)?)\s*(?:g|gram|grams)\b/i;

/** "8 x 50mg nerd bites" → 8 × 50mg = 400mg (kept as mg, not grams). */
const MULTIPACK_MG_RE =
  /^(\d+)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:mg|milligram|milligrams)\b/i;

/** "1 g rr - 5 pack mix" → check for "N pack" after a weight match. */
const PACK_MULT_RE = /\b(\d+)\s*x?\s*pack/i;

/** "1 ml", "10ml". */
const ML_RE = /^(\d+(?:\.\d+)?)\s*(?:ml|milliliter|milliliters)\b/i;

/** "500 mg" — dose units, typically edibles. */
const MG_RE = /^(\d+(?:\.\d+)?)\s*(?:mg|milligram|milligrams)\b/i;

/** "14 /grams z strain" → 14g (typo with slash). */
const SLASH_GRAMS_RE = /^(\d+(?:\.\d+)?)\s*\/\s*grams?\b/i;

/** "1 0z dragon" → 1oz (zero typo for letter o). */
const TYPO_0Z_RE = /^(\d+(?:\.\d+)?)\s*0z\b/i;

/** "1 qp mac stomper" — quarter pound (≈113g). */
const QP_RE = /^(\d+)\s*qp\b/i;

/** "1 kg albino" — kilogram. */
const KG_RE = /^(\d+(?:\.\d+)?)\s*kg\b/i;

/** "1 lb" — pound. */
const LB_RE = /^(\d+(?:\.\d+)?)\s*lb\b/i;

/** "3 packs", "2 carts", "10 pieces". */
const COUNT_RE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s*(${COUNT_UNIT_ALT})\\b`,
  "i",
);

const OZ_TO_G = 28.3495;
const LB_TO_G = 453.592;
const QP_TO_G = LB_TO_G / 4;

/** Round to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ─────────── Residual cleanup ─────────── */

/**
 * Clean the residual text after stripping the quantity token.
 * Returns null if nothing meaningful remains.
 */
function cleanResidual(raw: string): string | null {
  let s = raw;

  // Strip crossed-out sale markup: "❌$18✅" / "❌$̶18✅".
  s = s.replace(/❌[^✅]*✅/g, "");
  // Strip combining-strikethrough char (U+0336) anywhere.
  s = s.replace(/[\u0336]/g, "");
  // Strip leftover money / BTC tails ("$15.00", "BTC0.0001977").
  s = s.replace(/\$\d+(?:\.\d{1,2})?/g, "");
  s = s.replace(/btc\s*\d+(?:\.\d+)?/gi, "");
  // Strip redundant "=400mg" / "=1g" totals.
  s = s.replace(/=\s*\d+(?:\.\d+)?\s*(?:g|mg|ml|oz|grams?|milligrams?)\b/gi, "");
  // Strip redundant inline weight tokens ("q 7g" → "q", "7g jelly breath" → " jelly breath").
  s = s.replace(INNER_WEIGHT_RE, "");
  // Strip stray sale/status emojis.
  s = s.replace(/[❌✅🚫]/g, "");
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  // Strip leading connector words ("7g of shatter" → "shatter"; "3.5g and fire" → "fire").
  // Only strip a single leading connector to avoid gutting real names.
  s = s.replace(/^(?:of|and|&|with|the|a|an|plus|x)\s+/i, "").trim();
  // Strip trailing punctuation residue (",", "-", "&").
  s = s.replace(/[\s,\-&|]+$/g, "").trim();

  if (!s) return null;

  // Pure numeric → weight repeat ("3.5", "14").
  if (/^\d+(?:\.\d+)?$/.test(s)) return null;

  const lower = s.toLowerCase();

  // Single-token weight slang.
  if (WEIGHT_SLANG_NOISE.has(lower)) return null;
  // "q", "q 1", "q2" — tail from quantity shorthand.
  if (/^q\s*\d*$/.test(lower)) return null;
  // "half zip", "half oz", "quarter oz", "eighth" etc.
  if (/^(half|quarter|eighth)\s*(zip|oz|ounce|ounces)?$/.test(lower)) return null;

  return s;
}

/* ─────────── parseVariant ─────────── */

/**
 * Preprocess the raw variant string to strip platform-added prefix junk:
 *   - "1 1 baja blast"         → "baja blast"  (identical leading dup)
 *   - "10 10 10 of your choice"→ "of your choice" (triple dup)
 *   - "1 500 ml lemonchillo"   → "500 ml lemonchillo" (platform prefixed "1 ")
 *   - "1 2000 mg gelato"       → "2000 mg gelato"
 * Only strips the leading "1 " when followed by another number+unit so we
 * never gut a legitimate "1 g" / "1 oz" / "1 pack" token.
 */
function preprocessRaw(s: string): string {
  // 1) Collapse 2 or 3 identical leading numbers.
  s = s.replace(/^(\d+)\s+\1(?:\s+\1)?\s+/, "");
  // 2) Strip leading "1 " when the next token is a number (platform prefix quirk).
  //    Only strip "1 " specifically — "1" is the always-added prefix.
  s = s.replace(/^1\s+(?=\d)/, "");
  return s;
}

export function parseVariant(v: ItemVariant): ParsedVariant | null {
  const raw = (v.dEn || v.d || "").trim();
  if (!raw) return null;

  // Strip pictographic emojis (but not the ❌✅ markers — cleanResidual handles those).
  let clean = raw.replace(/[\u{1F300}-\u{1FFFF}]/gu, "").trim();
  // Normalize "0z" typo → "oz" BEFORE preprocessRaw so its leading-"1 " strip
  // doesn't mistake the "0" for a real digit and eat the real quantity.
  clean = clean.replace(/(\d+(?:\.\d+)?)\s*0z\b/gi, "$1 oz");
  clean = preprocessRaw(clean);

  /* Oz-family (check first so "quarter"/"half"/"zip" don't fall through). */
  for (const pat of OZ_PATTERNS) {
    const m = clean.match(pat.re);
    if (!m) continue;

    const matchedText = m[0];
    const start = m.index ?? 0;
    const end = start + matchedText.length;
    const residual = cleanResidual(
      (clean.slice(0, start) + " " + clean.slice(end)).trim(),
    );

    if (pat.grams != null && pat.label) {
      // Slang → canonical grams.
      return {
        qty: pat.grams,
        unit: "g",
        grams: pat.grams,
        weightLabel: `${pat.grams}g`,
        originalLabel: pat.label,
        strain: residual,
        variant: v,
      };
    }

    // Numeric oz — preserve seller's "oz" unit in display.
    const num = parseFloat(m[1]);
    const grams = num * (pat.mult ?? 28);
    const ozLabel = `${num}oz`;
    return {
      qty: grams,
      unit: "g",
      grams,
      weightLabel: `${grams}g`,
      originalLabel: ozLabel,
      strain: residual,
      variant: v,
    };
  }

  /* Multi-pack mg: "8 x 50mg nerd bites" → total 400mg, unit=mg. */
  const mpMg = clean.match(MULTIPACK_MG_RE);
  if (mpMg) {
    const count = parseInt(mpMg[1], 10);
    const dose = parseFloat(mpMg[2]);
    const total = count * dose;
    const residual = cleanResidual(clean.slice(mpMg[0].length));
    const lab = `${count}×${dose}mg`;
    return {
      qty: total,
      unit: "mg",
      weightLabel: `${total}mg`,
      originalLabel: lab,
      strain: residual,
      variant: v,
    };
  }

  /* Multi-pack: "5 1g nasha" → 5 × 1g = 5g. */
  const mp = clean.match(MULTIPACK_RE);
  if (mp) {
    const count = parseInt(mp[1], 10);
    const g = parseFloat(mp[2]);
    const grams = count * g;
    const residual = cleanResidual(clean.slice(mp[0].length));
    return {
      qty: grams,
      unit: "g",
      grams,
      weightLabel: `${grams}g`,
      originalLabel: `${grams}g`,
      strain: residual,
      variant: v,
    };
  }

  /* Slash-grams typo: "14 /grams z strain" → 14g. */
  const sg = clean.match(SLASH_GRAMS_RE);
  if (sg) {
    const grams = parseFloat(sg[1]);
    const residual = cleanResidual(clean.slice(sg[0].length));
    return {
      qty: grams,
      unit: "g",
      grams,
      weightLabel: `${grams}g`,
      originalLabel: `${grams}g`,
      strain: residual,
      variant: v,
    };
  }

  /* Zero-typo oz: "1 0z dragon" → 1oz. */
  const t0z = clean.match(TYPO_0Z_RE);
  if (t0z) {
    const num = parseFloat(t0z[1]);
    const grams = round2(num * OZ_TO_G);
    const residual = cleanResidual(clean.slice(t0z[0].length));
    return {
      qty: grams,
      unit: "g",
      grams,
      weightLabel: `${grams}g`,
      originalLabel: `${num}oz`,
      strain: residual,
      variant: v,
    };
  }

  /* Quarter pound: "1 qp mac stomper" → 113.4g. */
  const qp = clean.match(QP_RE);
  if (qp) {
    const qps = parseInt(qp[1], 10);
    const grams = round2(qps * QP_TO_G);
    const residual = cleanResidual(clean.slice(qp[0].length));
    return {
      qty: grams,
      unit: "g",
      grams,
      weightLabel: `${grams}g`,
      originalLabel: qps === 1 ? "¼lb" : `${qps}qp`,
      strain: residual,
      variant: v,
    };
  }

  /* Kilogram: "1 kg albino". */
  const kg = clean.match(KG_RE);
  if (kg) {
    const num = parseFloat(kg[1]);
    const grams = num * 1000;
    const residual = cleanResidual(clean.slice(kg[0].length));
    return {
      qty: grams,
      unit: "g",
      grams,
      weightLabel: `${grams}g`,
      originalLabel: `${num}kg`,
      strain: residual,
      variant: v,
    };
  }

  /* Pound: "1 lb". */
  const lb = clean.match(LB_RE);
  if (lb) {
    const num = parseFloat(lb[1]);
    const grams = round2(num * LB_TO_G);
    const residual = cleanResidual(clean.slice(lb[0].length));
    return {
      qty: grams,
      unit: "g",
      grams,
      weightLabel: `${grams}g`,
      originalLabel: `${num}lb`,
      strain: residual,
      variant: v,
    };
  }

  /* Standard weight: "3.5 g blue sherbert".
     Also checks for a trailing "N pack" multiplier: "1 g rr - 5 pack mix" → 5×1g. */
  const wm = clean.match(WEIGHT_RE);
  if (wm) {
    const perUnit = parseFloat(wm[1]);
    const afterWeight = clean.slice(wm[0].length);

    // Weight × pack multiplier — creates separate tier per pack count.
    const packM = afterWeight.match(PACK_MULT_RE);
    if (packM) {
      const count = parseInt(packM[1], 10);
      if (count > 1) {
        const totalGrams = round2(perUnit * count);
        const residual = cleanResidual(afterWeight);
        return {
          qty: totalGrams,
          unit: "g",
          grams: totalGrams,
          weightLabel: `${totalGrams}g`,
          originalLabel: `${count}×${perUnit}g`,
          strain: residual,
          variant: v,
        };
      }
    }

    const residual = cleanResidual(afterWeight);
    return {
      qty: perUnit,
      unit: "g",
      grams: perUnit,
      weightLabel: `${perUnit}g`,
      originalLabel: `${perUnit}g`,
      strain: residual,
      variant: v,
    };
  }

  /* Volume: "1 ml zskittles". */
  const ml = clean.match(ML_RE);
  if (ml) {
    const qty = parseFloat(ml[1]);
    const residual = cleanResidual(clean.slice(ml[0].length));
    const lab = `${qty}ml`;
    return {
      qty,
      unit: "ml",
      weightLabel: lab,
      originalLabel: lab,
      strain: residual,
      variant: v,
    };
  }

  /* Dose: "500 mg". */
  const mg = clean.match(MG_RE);
  if (mg) {
    const qty = parseFloat(mg[1]);
    const residual = cleanResidual(clean.slice(mg[0].length));
    const lab = `${qty}mg`;
    return {
      qty,
      unit: "mg",
      weightLabel: lab,
      originalLabel: lab,
      strain: residual,
      variant: v,
    };
  }

  /* Count units: "2 carts mix & match", "3 packs". */
  const cm = clean.match(COUNT_RE);
  if (cm) {
    const qty = parseFloat(cm[1]);
    const rawUnit = cm[2].toLowerCase();
    const unit = COUNT_LABEL_CANONICAL[rawUnit] ?? rawUnit;
    const residual = cleanResidual(clean.slice(cm[0].length));
    const lab = formatCountLabel(qty, unit);
    return {
      qty,
      unit,
      weightLabel: lab,
      originalLabel: lab,
      strain: residual,
      variant: v,
    };
  }

  return null;
}

/** Humanise "3 cart" → "3 carts", "1 pack" → "1 pack". */
function formatCountLabel(qty: number, unit: string): string {
  const base: Record<string, string> = {
    pk: "pack",
    pc: "piece",
    cart: "cart",
    pod: "pod",
    pen: "pen",
    tab: "tab",
    cap: "cap",
    gummy: "gummy",
    bottle: "bottle",
    jar: "jar",
    bag: "bag",
    bar: "bar",
    chew: "chew",
    square: "square",
    star: "star",
    joint: "joint",
    box: "box",
    tub: "tub",
    pot: "pot",
    item: "item",
  };
  const word = base[unit] ?? unit;
  if (qty === 1) return `${qty} ${word}`;
  if (word === "gummy") return `${qty} gummies`;
  if (word === "box") return `${qty} boxes`;
  return `${qty} ${word}s`;
}

/* ─────────── Grouping ─────────── */

/**
 * Group variants by (qty, unit).
 * Returns null when fewer than 2 variants parse, matching `groupByWeight`'s
 * "nothing worth chip-rendering" semantics.
 */
export function groupByQuantity(variants: ItemVariant[]): QuantityGroup[] | null {
  const parsed = variants
    .map(parseVariant)
    .filter((p): p is ParsedVariant => p !== null);
  if (parsed.length < 2) return null;

  const map = new Map<string, ParsedVariant[]>();
  for (const p of parsed) {
    const key = `${p.qty}:${p.unit}`;
    const bucket = map.get(key);
    if (bucket) bucket.push(p);
    else map.set(key, [p]);
  }

  const groups: QuantityGroup[] = [];
  for (const [key, items] of map) {
    const prices = items.map((p) => p.variant.usd).filter((p) => p > 0);
    if (prices.length === 0) continue;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const cheapest = items.find((p) => p.variant.usd === minPrice) ?? items[0];
    const strains = items
      .map((p) => p.strain)
      .filter((s): s is string => s !== null)
      .filter((s, i, a) => a.indexOf(s) === i);

    groups.push({
      key,
      qty: cheapest.qty,
      unit: cheapest.unit,
      grams: cheapest.grams,
      label: cheapest.weightLabel,
      originalLabel: cheapest.originalLabel,
      price: minPrice,
      priceMax: maxPrice,
      count: items.length,
      strains,
      variant: cheapest.variant,
    });
  }

  // Sort: weight-bearing ascending by grams, then other units grouped by unit, asc qty.
  groups.sort((a, b) => {
    if (a.grams != null && b.grams != null) return a.grams - b.grams;
    if (a.grams != null) return -1;
    if (b.grams != null) return 1;
    if (a.unit !== b.unit) return a.unit.localeCompare(b.unit);
    return a.qty - b.qty;
  });

  return groups.length > 0 ? groups : null;
}

/**
 * Group variants by weight only.
 * Returns groups if there are 2+ weight tiers, OR a single tier with multiple strains.
 * Used by weight filter / price-per-gram sort / ItemCard's weight chip path.
 */
export function groupByWeight(variants: ItemVariant[]): WeightGroup[] | null {
  const all = groupByQuantity(variants);
  if (!all) return null;
  const weight = all.filter(
    (g): g is WeightGroup => typeof g.grams === "number",
  );
  if (weight.length >= 2) return weight;
  if (weight.length === 1 && weight[0].strains.length >= 2) return weight;
  return null;
}

/* ─────────── Misc helpers ─────────── */

/**
 * Compute price per gram for a variant.
 */
export function pricePerGram(price: number, grams: number): number | null {
  if (grams <= 0 || price <= 0) return null;
  return price / grams;
}

/**
 * Format a weight for compact display (canonical, grams-first).
 * Prefer `group.originalLabel` for row-2 chips where seller format matters.
 * Kept for legacy callers (atoms.ts price-per-gram / weight filter labels).
 */
export function formatWeight(grams: number): string {
  if (grams === 56) return "2oz";
  if (grams === 112) return "¼lb";
  if (grams === 224) return "½lb";
  if (grams === 448) return "1lb";
  if (grams >= 1000) return `${(grams / 1000).toFixed(1)}kg`;
  const s = grams % 1 === 0 ? String(grams) : grams.toFixed(1);
  return `${s}g`;
}
