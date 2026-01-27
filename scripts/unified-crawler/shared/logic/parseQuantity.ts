/**
 * Parse quantity from variant descriptions.
 * 
 * Ported from src/hooks/usePerUnitLabel.ts for crawler use.
 * This is the authoritative copy - frontend should eventually import from shared.
 */

export interface ParsedQuantity {
  qty: number;
  unit: string;
}

interface CountToken {
  num: number;
  labelOriginal: string | null;
  labelCanonical: string | null;
  pos: number;
}

interface DosageToken {
  num: number;
  unit: string;
  pos: number;
}

/** Normalize count labels to canonical form (e.g., 'tablets' → 'tab') */
export function normalizeCountLabel(label: string | null): string | null {
  if (!label) return null;
  switch (label) {
    case 'pack':
    case 'packs':
    case 'pk':
    case 'pks':
      return 'pk';
    case 'pc':
    case 'pcs':
    case 'pieces':
      return 'pc';
    case 'tab':
    case 'tabs':
    case 'tablet':
    case 'tablets':
      return 'tab';
    case 'capsule':
    case 'capsules':
      return 'cap';
    case 'gummy':
    case 'gummies':
      return 'gummy';
    case 'bottle':
    case 'bottles':
      return 'bottle';
    case 'jar':
    case 'jars':
      return 'jar';
    case 'bar':
    case 'bars':
      return 'bar';
    case 'chew':
    case 'chews':
      return 'chew';
    case 'square':
    case 'squares':
      return 'square';
    case 'star':
    case 'stars':
      return 'star';
    case 'preroll':
    case 'prerolls':
    case 'pre-roll':
    case 'pre-rolls':
    case 'joint':
    case 'joints':
    case 'roll':
    case 'rolls':
      return 'joint';
    case 'item':
    case 'items':
      return 'item';
    case 'x':
    case '×':
      return 'x';
    // Ounce patterns
    case 'oz':
    case 'ounce':
    case 'ounces':
    case 'z':
      return 'oz';
    default:
      return label;
  }
}

/** Detect implicit unit from description text */
export function detectImplicitUnit(d: string): string | null {
  const patterns = [
    { re: /\bpack(s)?\b/, unit: 'pk' },
    { re: /\bbottle(s)?\b/, unit: 'bottle' },
    { re: /\bjar(s)?\b/, unit: 'jar' },
    { re: /\bgumm(y|ies)\b/, unit: 'gummy' },
    { re: /\btablet(s)?\b|\btab(s)?\b/, unit: 'tab' },
    { re: /\bcapsule(s)?\b/, unit: 'cap' },
    { re: /\bpreroll(s)?\b|\bpre-roll(s)?\b|\bjoint(s)?\b|\broll(s)?\b/, unit: 'joint' },
    { re: /\bbar(s)?\b/, unit: 'bar' },
    { re: /\bchew(s)?\b/, unit: 'chew' },
    { re: /\bsquare(s)?\b/, unit: 'square' },
    { re: /\bstar(s)?\b/, unit: 'star' },
    { re: /\bcart(s|ridge|ridges)?\b/, unit: 'cart' },
    { re: /\bpod(s)?\b/, unit: 'pod' },
    { re: /\bpen(s)?\b/, unit: 'pen' },
  ];
  for (const p of patterns) if (p.re.test(d)) return p.unit;
  return null;
}

function isChocolateBarLike(d: string): boolean {
  return /(choc|chocolate|biscoff|oreo|lindor|hershey|crunch|terry|milk chocolate|white chocolate|dark chocolate)/.test(d);
}

// Ounce conversion patterns - check these first
const OUNCE_PATTERNS = [
  { re: /\b(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/i, multiplier: 28 },
  { re: /\b(\d+(?:\.\d+)?)\s*z\b/i, multiplier: 28 }, // "1z" = 1 ounce
  { re: /\beighth\b|⅛|\b1\/8\s*(?:oz)?\b/i, grams: 3.5 },
  { re: /\bquarter\b|¼|\b1\/4\s*(?:oz)?\b/i, grams: 7 },
  { re: /\bhalf\s*(?:oz|ounce)?\b|½\s*(?:oz)?\b|\b1\/2\s*(?:oz)?\b/i, grams: 14 },
  { re: /\bzip\b/i, grams: 28 }, // slang for ounce
];

/**
 * Parse a description like "1g", "2 grams", "500 mg", "10ml", "2 items"
 * Returns { qty, unit } or null if no quantity found.
 * 
 * Special handling for flower/hash patterns:
 * - "5 1g nasha" → 5 x 1g = 5g
 * - "1 jar 3.5g blue cookies" → 3.5g (the gram amount is what matters)
 * - "3 oz gorilla cookies" → 84g
 */
export function parseQuantity(description: string | null | undefined): ParsedQuantity | null {
  const d = (description || '').toLowerCase().trim();
  if (!d) return null;
  
  const edibleLikeRe = /(choc|chocolate|edible|gummy|gummies|brownie|bar|cookie|cookies|biscuit|biscoff|oreo|crunch|lindor|hershey|strawberry)/;

  // Check ounce patterns first
  for (const pattern of OUNCE_PATTERNS) {
    const match = d.match(pattern.re);
    if (match) {
      if ('grams' in pattern && pattern.grams !== undefined) {
        return { qty: pattern.grams, unit: 'g' };
      }
      if ('multiplier' in pattern && match[1]) {
        return { qty: parseFloat(match[1]) * pattern.multiplier, unit: 'g' };
      }
    }
  }

  // Special pattern: "<count> <count>g" like "5 1g" → 5 x 1g = 5g
  // Or "<count> x <count>g" like "5 x 1g" → 5g
  const multiPackGramPattern = /^(\d+)\s*(?:x\s*)?(\d+(?:\.\d+)?)\s*g\b/i;
  const multiPackMatch = d.match(multiPackGramPattern);
  if (multiPackMatch) {
    const count = parseFloat(multiPackMatch[1]);
    const grams = parseFloat(multiPackMatch[2]);
    return { qty: count * grams, unit: 'g' };
  }

  // Pattern: "<count> <unit> <weight>g" like "1 jar 3.5g" → use the gram weight
  // This handles flower sold as "1 jar 3.5g blue cookies"
  const unitThenGramPattern = /^(\d+)\s*(?:jar|jars|pack|packs|pk|pks|bag|bags|pot|pots|tub|tubs|box|boxes)\s+(\d+(?:\.\d+)?)\s*g\b/i;
  const unitGramMatch = d.match(unitThenGramPattern);
  if (unitGramMatch) {
    const grams = parseFloat(unitGramMatch[2]);
    return { qty: grams, unit: 'g' };
  }

  // If description starts with a dosage like "3.5 grams"
  const leadingDosage = d.match(/^(\d+(?:\.\d+)?)\s*(mg|milligram|milligrams|g|gram|grams|kg|kilogram|kilograms|kilo|kilos|ml|milliliter|milliliters)\b/);
  if (leadingDosage) {
    const num = parseFloat(leadingDosage[1]);
    const lab = leadingDosage[2];
    if (/^(g|gram|grams|gs)$/.test(lab)) return { qty: num, unit: 'g' };
    if (/^(kg|kilogram|kilograms|kilo|kilos)$/.test(lab)) return { qty: num * 1000, unit: 'g' };
    if (/^(ml|milliliter|milliliters)$/.test(lab)) return { qty: num, unit: 'ml' };
    if (/^(mg|milligram|milligrams)$/.test(lab) && !edibleLikeRe.test(d)) return { qty: num, unit: 'mg' };
  }

  // Tokenise numeric values and optional unit/label
  const tokenRe = /(\d+(?:\.\d+)?)(?:\s*(mg|milligram|milligrams|g|gram|grams|kg|kilogram|kilograms|kilo|kilos|ml|milliliter|milliliters|oz|ounce|ounces|z|pc|pcs|pieces|x|×|item|items|gummy|gummies|bottle|bottles|pack|packs|pk|pks|capsule|capsules|tab|tabs|tablet|tablets|bar|bars|chew|chews|square|squares|star|stars|jar|jars|preroll|prerolls|pre-roll|pre-rolls|joint|joints|roll|rolls|cart|carts|cartridge|cartridges|pod|pods|pen|pens)\b)?/gi;
  
  const counts: CountToken[] = [];
  const dosages: DosageToken[] = [];
  let m: RegExpExecArray | null;
  
  while ((m = tokenRe.exec(d)) !== null) {
    const num = parseFloat(m[1]);
    const label = (m[2] || '').toLowerCase() || null;
    const pos = m.index;
    
    if (!label) {
      counts.push({ num, labelOriginal: null, labelCanonical: null, pos });
    } else if (/^(mg|milligram|milligrams|mil)$/.test(label)) {
      dosages.push({ num, unit: 'mg', pos });
    } else if (/^(g|gram|grams|gs)$/.test(label)) {
      dosages.push({ num, unit: 'g', pos });
    } else if (/^(kg|kilogram|kilograms|kilo|kilos)$/.test(label)) {
      dosages.push({ num, unit: 'kg', pos });
    } else if (/^(ml|milliliter|milliliters)$/.test(label)) {
      dosages.push({ num, unit: 'ml', pos });
    } else if (/^(oz|ounce|ounces|z)$/.test(label)) {
      dosages.push({ num: num * 28, unit: 'g', pos }); // Convert to grams
    } else {
      const canonical = normalizeCountLabel(label);
      counts.push({ num, labelOriginal: label, labelCanonical: canonical, pos });
    }
  }

  const labeledCounts = counts.filter(c => !!c.labelOriginal);
  const unlabeledCounts = counts.filter(c => !c.labelOriginal);

  // 1. Labeled counts take precedence
  if (labeledCounts.length > 0) {
    const prefer = labeledCounts.find(c => /^(pk|pc|x)$/.test(c.labelCanonical || ''));
    if (prefer) {
      let unit = prefer.labelCanonical || 'item';
      if (unit === 'x') unit = detectImplicitUnit(d) || 'item';
      return { qty: prefer.num, unit };
    }
    let unit = labeledCounts[0].labelCanonical || 'item';
    if (unit === 'x') unit = detectImplicitUnit(d) || 'item';
    return { qty: labeledCounts[0].num, unit };
  }

  // 2. Dosages
  if (dosages.length > 0) {
    const firstGram = dosages.find(dz => dz.unit === 'g');
    const firstKg = dosages.find(dz => dz.unit === 'kg');
    const firstMl = dosages.find(dz => dz.unit === 'ml');
    const firstMg = dosages.find(dz => dz.unit === 'mg');

    if (firstGram) return { qty: firstGram.num, unit: 'g' };
    if (firstKg) return { qty: firstKg.num * 1000, unit: 'g' };
    if (firstMl) return { qty: firstMl.num, unit: 'ml' };
    if (firstMg) {
      if (unlabeledCounts.length === 0 && !edibleLikeRe.test(d)) {
        return { qty: firstMg.num, unit: 'mg' };
      }
      if (edibleLikeRe.test(d) && unlabeledCounts.length > 0) {
        const implicit = detectImplicitUnit(d) || (isChocolateBarLike(d) ? 'bar' : null);
        return { qty: unlabeledCounts[0].num, unit: implicit || 'item' };
      }
    }
  }

  // 3. Unlabeled counts -> items
  if (unlabeledCounts.length > 0) {
    const implicit = detectImplicitUnit(d) || (isChocolateBarLike(d) ? 'bar' : null);
    return { qty: unlabeledCounts[0].num, unit: implicit || 'item' };
  }

  // 4. Fallback dosage
  if (dosages.length > 0) {
    const d0 = dosages[0];
    if (d0.unit === 'kg') return { qty: d0.num * 1000, unit: 'g' };
    if (d0.unit === 'mg' && edibleLikeRe.test(d)) {
      return { qty: 1, unit: detectImplicitUnit(d) || (isChocolateBarLike(d) ? 'bar' : 'item') };
    }
    return { qty: dosages[0].num, unit: dosages[0].unit };
  }

  // 5. Default 1 item when description mentions item word
  if (/\b(item|items|pcs|pieces|tabs|capsules|tablet|tablets|gummy|gummies|bar|bars|chew|chews|square|squares|stars|jars|preroll|prerolls|pre-roll|pre-rolls|joint|joints|cart|carts|cartridge|cartridges|pod|pods)\b/.test(d)) {
    return { qty: 1, unit: 'item' };
  }

  return null;
}

/**
 * Weight breakpoints for aggregation.
 * Concentrates may use smaller weights (0.5g, 1g, 2g).
 */
export const WEIGHT_BREAKPOINTS = [
  { grams: 1, tolerance: 0.2, label: '1g' },
  { grams: 3.5, tolerance: 0.3, label: '3.5g' },
  { grams: 7, tolerance: 0.5, label: '7g' },
  { grams: 14, tolerance: 1.0, label: '14g' },
  { grams: 28, tolerance: 2.0, label: '28g (1oz)' },
  { grams: 50, tolerance: 3.0, label: '50g' },
  { grams: 100, tolerance: 5.0, label: '100g' },
] as const;

/**
 * Match a parsed quantity to a standard weight breakpoint.
 * Returns the breakpoint grams if within tolerance, or null if no match.
 */
export function matchWeightBreakpoint(parsedQty: number): number | null {
  for (const bp of WEIGHT_BREAKPOINTS) {
    if (Math.abs(parsedQty - bp.grams) <= bp.tolerance) {
      return bp.grams;
    }
  }
  return null;
}

/**
 * Categories that use gram-based pricing
 */
export const GRAM_BASED_CATEGORIES = ['Flower', 'Hash', 'Concentrates'];

/**
 * Check if a category uses gram-based pricing
 */
export function isGramBasedCategory(category: string): boolean {
  return GRAM_BASED_CATEGORIES.includes(category);
}
