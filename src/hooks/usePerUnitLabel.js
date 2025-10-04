"use client";
import { useCallback } from "react";
import { formatMoney } from '@/lib/priceDisplay';

function normalizeCountLabel(label) {
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
    default:
      return label; // fallback original
  }
}

function detectImplicitUnit(d) {
  // Order of precedence for implicit unit detection after an 'x'
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
  ];
  for (const p of patterns) if (p.re.test(d)) return p.unit;
  return null;
}

function isChocolateBarLike(d) {
  return /(choc|chocolate|biscoff|oreo|lindor|hershey|crunch|terry|milk chocolate|white chocolate|dark chocolate)/.test(d);
}

// Parses a description like "1g", "2 grams", "500 mg", "10ml", "2 items" and returns { qty, unit }
function parseQuantity(description) {
  const d = (description || "").toLowerCase().trim();
  const edibleLikeRe = /(choc|chocolate|edible|gummy|gummies|brownie|bar|cookie|cookies|biscuit|biscoff|oreo|crunch|lindor|hershey|strawberry)/;

  // If description starts with a dosage like "3.5 grams": handle g/ml/kg or non-edible mg
  const leadingDosage = d.match(/^(\d+(?:\.\d+)?)\s*(mg|milligram|milligrams|g|gram|grams|kg|kilogram|kilograms|kilo|kilos|ml|milliliter|milliliters)\b/);
  if (leadingDosage) {
    const num = parseFloat(leadingDosage[1]);
    const lab = leadingDosage[2];
    if (/^(g|gram|grams|gs)$/.test(lab)) return { qty: num, unit: 'g' };
    if (/^(kg|kilogram|kilograms|kilo|kilos)$/.test(lab)) return { qty: num * 1000, unit: 'g' };
    if (/^(ml|milliliter|milliliters)$/.test(lab)) return { qty: num, unit: 'ml' };
    // mg: allow later edible logic to potentially convert to per-item
    if (/^(mg|milligram|milligrams)$/.test(lab) && !edibleLikeRe.test(d)) return { qty: num, unit: 'mg' };
  }

  // tokenise numeric values and optional unit/label that immediately follow
  // extended labels: pk/pks, tablets, prerolls, joints
  const tokenRe = /(\d+(?:\.\d+)?)(?:\s*(mg|milligram|milligrams|g|gram|grams|kg|kilogram|kilograms|kilo|kilos|ml|milliliter|milliliters|pc|pcs|pieces|x|×|item|items|gummy|gummies|bottle|bottles|pack|packs|pk|pks|capsule|capsules|tab|tabs|tablet|tablets|bar|bars|chew|chews|square|squares|star|stars|jar|jars|preroll|prerolls|pre-roll|pre-rolls|joint|joints|roll|rolls)\b)?/gi;
  const counts = []; // { num, labelOriginal, labelCanonical, pos }
  const dosages = []; // { num, unit, pos }
  let m;
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
    } else {
      const canonical = normalizeCountLabel(label);
      counts.push({ num, labelOriginal: label, labelCanonical: canonical, pos });
    }
  }

  const labeledCounts = counts.filter(c => !!c.labelOriginal);
  const unlabeledCounts = counts.filter(c => !c.labelOriginal);

  // 1. If we have labeled counts, they take precedence over dosage (e.g., '2 x 250mg packs').
  if (labeledCounts.length > 0) {
    // Prefer explicit pack/pc/x style labels first
    const prefer = labeledCounts.find(c => /^(pk|pc|x)$/.test(c.labelCanonical));
    if (prefer) {
      let unit = prefer.labelCanonical;
      if (unit === 'x') {
        unit = detectImplicitUnit(d) || 'item';
      } else if (unit === 'pk') {
        unit = 'pk';
      }
      return { qty: prefer.num, unit };
    }
    let unit = labeledCounts[0].labelCanonical || 'item';
    if (unit === 'x') unit = detectImplicitUnit(d) || 'item';
    if (unit === 'pk' && !/\bpack(s)?\b/.test(d)) {
      // keep pk if explicitly present in token, otherwise fallback
    }
    return { qty: labeledCounts[0].num, unit };
  }

  // 2. No labeled counts: decide between grams/ml/mg dosage and unlabeled counts.
  if (dosages.length > 0) {
    const firstGram = dosages.find(dz => dz.unit === 'g');
    const firstKg = dosages.find(dz => dz.unit === 'kg');
    const firstMl = dosages.find(dz => dz.unit === 'ml');
    const firstMg = dosages.find(dz => dz.unit === 'mg');

    if (firstGram) return { qty: firstGram.num, unit: 'g' };
    if (firstKg) return { qty: firstKg.num * 1000, unit: 'g' };
    if (firstMl) return { qty: firstMl.num, unit: 'ml' };
    if (firstMg) {
      if (labeledCounts.length === 0 && unlabeledCounts.length === 0 && !edibleLikeRe.test(d)) {
        return { qty: firstMg.num, unit: 'mg' };
      }
      if (edibleLikeRe.test(d) && labeledCounts.length === 0 && unlabeledCounts.length > 0) {
        const implicit = detectImplicitUnit(d) || (isChocolateBarLike(d) ? 'bar' : null);
        return { qty: unlabeledCounts[0].num, unit: implicit || 'item' };
      }
    }
  }

  // 3. Fallback: unlabeled counts -> treat as item(s) (try to infer standalone unit keyword)
  if (unlabeledCounts.length > 0) {
    const implicit = detectImplicitUnit(d) || (isChocolateBarLike(d) ? 'bar' : null);
    return { qty: unlabeledCounts[0].num, unit: implicit || 'item' };
  }

  // 4. If only dosage(s) existed and we haven't returned yet, use first dosage.
  if (dosages.length > 0) {
    const d0 = dosages[0];
    if (d0.unit === 'kg') {
      return { qty: d0.num * 1000, unit: 'g' };
    }
    if (d0.unit === 'mg' && edibleLikeRe.test(d)) {
      return { qty: 1, unit: detectImplicitUnit(d) || (isChocolateBarLike(d) ? 'bar' : 'item') };
    }
    return { qty: dosages[0].num, unit: dosages[0].unit };
  }

  // 5. Default 1 item when description mentions an item word without number
  if (/\b(item|items|pcs|pieces|tabs|capsules|tablet|tablets|gummy|gummies|bar|bars|chew|chews|square|squares|stars|jars|preroll|prerolls|pre-roll|pre-rolls|joint|joints)\b/.test(d)) {
    return { qty: 1, unit: 'item' };
  }

  return null;
}

export function usePerUnitLabel() {
  // Accepts description and a price in given currency, returns a suffix like " (£10/g)" or " ($10/g)"
  const perUnitSuffix = useCallback((description, priceAmount, currency = 'GBP') => {
    if (priceAmount == null || !isFinite(priceAmount)) return null;
    const parsed = parseQuantity(description);
    if (!parsed || !(parsed.qty > 0)) return null;
    const { unit, qty } = parsed;
    const per = priceAmount / qty;
    if (!isFinite(per)) return null;
    const money = formatMoney(per, currency, { decimals: 2 });
    return ` (${money}/${unit})`;
  }, []);

  return { perUnitSuffix };
}
