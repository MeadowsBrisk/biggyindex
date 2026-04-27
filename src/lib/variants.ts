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

import type { Item, ItemVariant } from "./types";

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
   *     'joint' | 'stick' | 'cone' | 'paper' | 'cube' | 'vape' |
   *     'box' | 'tub' | 'pot' | 'strip' | 'item'
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
  pack: "pk",
  packs: "pk",
  pk: "pk",
  pks: "pk",
  pc: "pc",
  pcs: "pc",
  piece: "pc",
  pieces: "pc",
  cart: "cart",
  carts: "cart",
  cartridge: "cart",
  cartridges: "cart",
  pod: "pod",
  pods: "pod",
  pen: "pen",
  pens: "pen",
  tab: "tab",
  tabs: "tab",
  tablet: "tab",
  tablets: "tab",
  capsule: "cap",
  capsules: "cap",
  cap: "cap",
  caps: "cap",
  gummy: "gummy",
  gummie: "gummy",
  gummies: "gummy",
  bottle: "bottle",
  bottles: "bottle",
  jar: "jar",
  jars: "jar",
  bag: "bag",
  bags: "bag",
  bar: "bar",
  bars: "bar",
  chew: "chew",
  chews: "chew",
  square: "square",
  squares: "square",
  star: "star",
  stars: "star",
  preroll: "joint",
  prerolls: "joint",
  "pre roll": "joint",
  "pre rolls": "joint",
  "pre-roll": "joint",
  "pre-rolls": "joint",
  joint: "joint",
  joints: "joint",
  roll: "joint",
  rolls: "joint",
  stick: "stick",
  sticks: "stick",
  cone: "cone",
  cones: "cone",
  paper: "paper",
  papers: "paper",
  blotter: "paper",
  blotters: "paper",
  cube: "cube",
  cubes: "cube",
  vape: "vape",
  vapes: "vape",
  inhaler: "inhaler",
  inhalers: "inhaler",
  box: "box",
  boxes: "box",
  tub: "tub",
  tubs: "tub",
  pot: "pot",
  pots: "pot",
  // Pharmaceutical packaging. Explicit "strip of N" labels expand to tabs;
  // otherwise strip stays a count unit because blister sizes vary.
  strip: "strip",
  strips: "strip",
  blister: "strip",
  blisters: "strip",
  item: "item",
  items: "item",
};

const COUNT_UNIT_ALT = Object.keys(COUNT_LABEL_CANONICAL)
  // Longer alternates first so "pre-roll" beats "roll"
  .sort((a, b) => b.length - a.length)
  .join("|");

/** Inline weight tokens we strip from residuals to kill "7g jelly breath" → "jelly breath". */
const INNER_WEIGHT_RE =
  /\b\d+(?:\.\d+)?\s*(?:g|gram|grams|mg|ug|mcg|kg|ml|oz|ounce|ounces|z)\b/gi;

/** Single-token residuals that are weight-slang noise, not descriptors. */
const WEIGHT_SLANG_NOISE = new Set([
  "zip",
  "zips",
  "z",
  "zs",
  "half",
  "halfz",
  "halfzip",
  "halfoz",
  "quarter",
  "q",
  "qtr",
  "eighth",
  "e",
  "8th",
  "oz",
  "ounce",
  "ounces",
  "ozs",
  "g",
  "gram",
  "grams",
  "ml",
  "mg",
  "ug",
  "mcg",
  "qp",
  "hp",
  "lb",
  "pound",
]);

export function itemVariantContext(item: Pick<Item, "n" | "c" | "sc">): string {
  return [item.n, item.c, ...(item.sc ?? [])].filter(Boolean).join(" ");
}

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

/** "2x1ml cart" / "pick and mix (2x1ml cart)" → total ml. */
const MULTIPACK_ML_RE =
  /\b(\d+)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:ml|milliliter|milliliters)\b/i;

/** "10 1ml carts" → total ml, common vape cart shorthand. */
const COUNTED_ML_RE =
  /^(\d+)\s+(\d+(?:\.\d+)?)\s*(?:ml|milliliter|milliliters)\s*(?:carts?|cartridges?|vapes?)\b/i;

/** "1 g rr - 5 pack mix" → check for "N pack" after a weight match. */
const PACK_MULT_RE = /\b(\d+)\s*x?\s*pack/i;

/** "1 ml", "10ml", "og kush 1ml". */
const ML_RE = /\b(\d+(?:\.\d+)?)\s*(?:ml|milliliter|milliliters)\b/i;

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

/** "1 strip of 10 40mg" → 10 tabs, not 1 strip. */
const STRIP_OF_COUNT_RE =
  /^(\d+(?:\.\d+)?)\s*strips?\s+of\s+(\d+(?:\.\d+)?)(?:\s+\d+(?:\.\d+)?\s*(?:mg|ug|mcg))?\b/i;

/** "3 packs", "30 20mg tablets", "1 each 200ug papers". */
const COUNT_RE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s*(?:(?:each|total)\\s*)?(?:\\d+(?:\\.\\d+)?\\s*(?:mg|ug|mcg)\\s*)?(${COUNT_UNIT_ALT})\\b`,
  "i",
);

/** "magic paper x10" / "paper × 25". */
const UNIT_THEN_COUNT_RE = new RegExp(
  `\\b(${COUNT_UNIT_ALT})\\s*(?:x|×)\\s*(\\d+(?:\\.\\d+)?)\\b`,
  "i",
);

/** "7 mixed flavour" can only be trusted with item context. */
const BARE_COUNT_RE = /^(\d+(?:\.\d+)?)\b/i;

const OZ_TO_G = 28.3495;
const LB_TO_G = 453.592;
const QP_TO_G = LB_TO_G / 4;

/** Round to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function residualWithoutMatch(
  clean: string,
  match: RegExpMatchArray,
): string | null {
  const start = match.index ?? 0;
  const end = start + match[0].length;
  return cleanResidual(`${clean.slice(0, start)} ${clean.slice(end)}`.trim());
}

function contextUnit(context: string | null | undefined): string | null {
  if (!context) return null;
  const text = context.toLowerCase();

  if (/\bcubes?\b/.test(text)) return "cube";
  if (/\bgumm(?:y|ie|ies)\b|\bgummies\b/.test(text)) return "gummy";
  if (/\b(?:blotters?|papers?|lsd|acid)\b/.test(text)) return "paper";
  if (/\b(?:vapes?|disposables?)\b/.test(text)) return "vape";
  if (/\b(?:tablets?|tabs?)\b/.test(text)) return "tab";
  if (/\b(?:carts?|cartridges?)\b/.test(text)) return "cart";
  if (/\b(?:sticks?)\b/.test(text)) return "stick";
  if (/\b(?:cones?)\b/.test(text)) return "cone";
  if (/\b(?:pre\s*-?\s*rolls?|prerolls?|joints?)\b/.test(text)) return "joint";

  return null;
}

const POTENCY_CONTEXT_UNITS = new Set([
  "vape",
  "cart",
  "pod",
  "pen",
  "inhaler",
]);

function potencyProductUnit(
  residual: string | null,
  context: string | null | undefined,
): { unit: string; strain: string | null } | null {
  const residualUnit = contextUnit(residual);
  if (residualUnit === "tab") return { unit: "tab", strain: null };

  const inferred = contextUnit(context);
  if (!inferred || !POTENCY_CONTEXT_UNITS.has(inferred)) return null;
  return { unit: inferred, strain: residual };
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
  // Strip postage/free-shipping tails that sellers add to option labels.
  s = s.replace(/\+?\s*free\s*shipping\b/gi, "");
  s = s.replace(/\+?\s*freeshipping\b/gi, "");
  // Strip redundant "=400mg" / "=1g" totals.
  s = s.replace(
    /=\s*\d+(?:\.\d+)?\s*(?:g|mg|ml|oz|grams?|milligrams?)\b/gi,
    "",
  );
  // Strip redundant inline weight tokens ("q 7g" → "q", "7g jelly breath" → " jelly breath").
  s = s.replace(INNER_WEIGHT_RE, "");
  // Strip orphaned packaging labels left after embedded counts: "(2x1ml cart)" → "".
  s = s.replace(/\(\s*(?:carts?|cartridges?|vapes?|pods?|pens?)\s*\)/gi, "");
  // Strip stray sale/status emojis.
  s = s.replace(/[❌✅🚫]/gu, "");
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  // Strip leading connector words ("7g of shatter" → "shatter"; "3.5g and fire" → "fire").
  // Only strip a single leading connector to avoid gutting real names.
  s = s.replace(/^(?:of|and|&|with|the|a|an|plus|each|total|x)\s+/i, "").trim();
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
  if (/^(half|quarter|eighth)\s*(zip|oz|ounce|ounces)?$/.test(lower))
    return null;

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

export function parseVariant(
  v: ItemVariant,
  context?: string | null,
): ParsedVariant | null {
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
      `${clean.slice(0, start)} ${clean.slice(end)}`.trim(),
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

  /* Multi-pack ml: "pick and mix (2x1ml cart)" → total 2ml. */
  const mpMl = clean.match(MULTIPACK_ML_RE);
  if (mpMl) {
    const count = parseInt(mpMl[1], 10);
    const ml = parseFloat(mpMl[2]);
    const total = count * ml;
    const residual = residualWithoutMatch(clean, mpMl);
    const lab = `${count}×${ml}ml`;
    return {
      qty: total,
      unit: "ml",
      weightLabel: `${total}ml`,
      originalLabel: lab,
      strain: residual,
      variant: v,
    };
  }

  /* Counted ml carts: "10 1ml carts" → total 10ml. */
  const countedMl = clean.match(COUNTED_ML_RE);
  if (countedMl) {
    const count = parseInt(countedMl[1], 10);
    const ml = parseFloat(countedMl[2]);
    const total = count * ml;
    const residual = cleanResidual(clean.slice(countedMl[0].length));
    const lab = `${count}×${ml}ml`;
    return {
      qty: total,
      unit: "ml",
      weightLabel: `${total}ml`,
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

  /* Volume: "1 ml zskittles" / "og kush 1ml". */
  const ml = clean.match(ML_RE);
  if (ml) {
    const qty = parseFloat(ml[1]);
    const residual = residualWithoutMatch(clean, ml);
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

  /* Pharmaceutical strips with explicit inner count: "10 strips of 10 40mg". */
  const stripOf = clean.match(STRIP_OF_COUNT_RE);
  if (stripOf) {
    const strips = parseFloat(stripOf[1]);
    const tabsPerStrip = parseFloat(stripOf[2]);
    const qty = strips * tabsPerStrip;
    const residual = cleanResidual(clean.slice(stripOf[0].length));
    const lab = formatCountLabel(qty, "tab");
    return {
      qty,
      unit: "tab",
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
    const potencyUnit = potencyProductUnit(residual, context);
    if (potencyUnit) {
      const lab = formatCountLabel(1, potencyUnit.unit);
      return {
        qty: 1,
        unit: potencyUnit.unit,
        weightLabel: lab,
        originalLabel: lab,
        strain: potencyUnit.strain,
        variant: v,
      };
    }
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

  /* Suffix count: "magic paper x10" / "magic paper x25". */
  const unitThenCount = clean.match(UNIT_THEN_COUNT_RE);
  if (unitThenCount) {
    const rawUnit = unitThenCount[1].toLowerCase();
    const unit = COUNT_LABEL_CANONICAL[rawUnit] ?? rawUnit;
    const qty = parseFloat(unitThenCount[2]);
    const residual = residualWithoutMatch(clean, unitThenCount);
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

  /* Bare count with item context: "7 mixed flavour" on a gummies item. */
  const bareCount = clean.match(BARE_COUNT_RE);
  const inferredUnit = contextUnit(context);
  if (bareCount && inferredUnit) {
    const qty = parseFloat(bareCount[1]);
    const rest = clean.slice(bareCount[0].length);
    if (/^\s*(?:each\s+)?custom\b/i.test(rest)) return null;
    const residual = cleanResidual(rest);
    const lab = formatCountLabel(qty, inferredUnit);
    return {
      qty,
      unit: inferredUnit,
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
    stick: "stick",
    cone: "cone",
    paper: "paper",
    cube: "cube",
    vape: "vape",
    inhaler: "inhaler",
    box: "box",
    tub: "tub",
    pot: "pot",
    strip: "strip",
    item: "item",
  };
  const word = base[unit] ?? unit;
  if (qty === 1) return `${qty} ${word}`;
  if (word === "gummy") return `${qty} gummies`;
  if (word === "box") return `${qty} boxes`;
  if (word === "inhaler") return `${qty} inhalers`;
  return `${qty} ${word}s`;
}

/* ─────────── Grouping ─────────── */

/**
 * Group variants by (qty, unit).
 * Returns null when fewer than 2 variants parse, matching `groupByWeight`'s
 * "nothing worth chip-rendering" semantics.
 */
export function groupByQuantity(
  variants: ItemVariant[],
  context?: string | null,
): QuantityGroup[] | null {
  const parsed = variants
    .map((v) => parseVariant(v, context))
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
export function groupByWeight(
  variants: ItemVariant[],
  context?: string | null,
): WeightGroup[] | null {
  const all = groupByQuantity(variants, context);
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

/* ─────────── Per-unit price (PPU) ─────────── */

/**
 * Continuous units have meaningful per-unit pricing at any quantity including
 * fractional (0.5g, 0.25ml). Some explicit single-count units also deserve a
 * PPU because "1 vape" / "1 paper" is the product unit, not packaging.
 */
const CONTINUOUS_UNITS = new Set(["g", "ml", "mg"]);

const PRICEABLE_SINGLE_UNITS = new Set([
  "cart",
  "pod",
  "pen",
  "tab",
  "cap",
  "gummy",
  "bar",
  "chew",
  "square",
  "star",
  "joint",
  "stick",
  "cone",
  "paper",
  "cube",
  "vape",
  "inhaler",
]);

/**
 * Short display label for each canonical unit. Used after the slash in
 * "£7.41/roll", "£10/g", "$1.20/gummy", etc. Keep concise — these render
 * inline in tight table/card layouts.
 */
export const UNIT_DISPLAY_LABEL: Record<string, string> = {
  g: "g",
  ml: "ml",
  mg: "mg",
  pc: "ea",
  pk: "pack",
  cart: "cart",
  pod: "pod",
  pen: "pen",
  tab: "tab",
  cap: "cap",
  gummy: "gummy",
  bar: "bar",
  chew: "chew",
  square: "sq",
  star: "star",
  joint: "roll",
  stick: "stick",
  cone: "cone",
  paper: "paper",
  cube: "cube",
  vape: "vape",
  inhaler: "inhaler",
  box: "box",
  bottle: "bottle",
  jar: "jar",
  bag: "bag",
  tub: "tub",
  pot: "pot",
  strip: "strip",
  item: "item",
};

/**
 * Per-unit price for any parsed quantity. Mirrors old-biggyindex
 * `perUnitSuffix`: returns `price / qty` for any unit, or null when PPU
 * would be meaningless (qty missing, qty <= 0, or qty === 1 on ambiguous
 * packaging count units like pack/bag/jar).
 */
export function pricePerUnit(
  price: number,
  parsed: { unit: string; qty: number } | null,
): number | null {
  if (!parsed) return null;
  if (!(parsed.qty > 0)) return null;
  if (!(price > 0)) return null;
  if (
    !CONTINUOUS_UNITS.has(parsed.unit) &&
    parsed.qty <= 1 &&
    !PRICEABLE_SINGLE_UNITS.has(parsed.unit)
  ) {
    return null;
  }
  return price / parsed.qty;
}

/**
 * Variant-level PPU. Parses the variant then applies `pricePerUnit`. An
 * optional shipping surcharge is added to the price before dividing.
 * Returns `{ ppu, unit, qty }` or null when not computable.
 */
export function variantPpu(
  v: ItemVariant,
  shipSurcharge = 0,
  context?: string | null,
): { ppu: number; unit: string; qty: number } | null {
  const parsed = parseVariant(v, context);
  if (!parsed) return null;
  const ppu = pricePerUnit(v.usd + shipSurcharge, parsed);
  if (ppu == null) return null;
  return { ppu, unit: parsed.unit, qty: parsed.qty };
}

/**
 * Cheapest PPU across an item's variants. Groups variants by unit so we
 * never compare "£7/roll" against "£10/g". Returns the lowest PPU in the
 * largest unit-group (ties broken by lowest value). Used for card-level
 * "from £X/unit" displays and the ppg sort.
 */
export function cheapestPpu(
  variants: ItemVariant[] | null | undefined,
  shipSurcharge = 0,
  context?: string | null,
): { ppu: number; unit: string } | null {
  if (!variants || variants.length === 0) return null;
  const byUnit = new Map<string, number[]>();
  for (const v of variants) {
    const res = variantPpu(v, shipSurcharge, context);
    if (!res) continue;
    const arr = byUnit.get(res.unit) ?? [];
    arr.push(res.ppu);
    byUnit.set(res.unit, arr);
  }
  if (byUnit.size === 0) return null;
  // Prefer the largest group (most variants share that unit), tiebreak by min ppu.
  let best: { unit: string; ppu: number; size: number } | null = null;
  for (const [unit, arr] of byUnit) {
    const minPpu = Math.min(...arr);
    if (
      !best ||
      arr.length > best.size ||
      (arr.length === best.size && minPpu < best.ppu)
    ) {
      best = { unit, ppu: minPpu, size: arr.length };
    }
  }
  return best ? { ppu: best.ppu, unit: best.unit } : null;
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
