// Phase 2: Extracted Edibles false-positive demotion & Flower fallback
// Logic: If Edibles scored but only generic sweet/candy language without true ingestion
// forms AND strong flower context, demote Edibles and bump Flower.

function ediblesFalsePositiveDemotionRule(ctx) {
  const { text, scores, subsByCat } = ctx;
  const trueEdibleForms = /(gummy|gummies|gummie|gummies? bears?|mints?|mint|chew|chews|choco|chocolate|brownie|capsule|capsules|tablet|tablets|cannabutter|canna butter|coconut oil|cannabis oil|cereal bar|nerd rope|rope|ropes|bar\b|bars\b|wonky bar|infused|delight|cone|cones|chocolate cone|chocolate cones|candy drops|drops)/;
  const genericSweet = /(sweet|candy)/;
  const strongFlowerContext = /(\bstrain\b|\bstrains\b|\bhybrid\b|indica|sativa|\bcali\b|exotic|exotics|\bflower\b|bud|buds)/;
  const addonOnly = /(add-?on|add on)\s+\d{2,4}\s?mg\s+edibles?/.test(text);
  // Classic demotion: only when Edibles had any base score
  if (scores.Edibles && !trueEdibleForms.test(text) && genericSweet.test(text) && strongFlowerContext.test(text) && !addonOnly) {
    scores.Edibles -= 6;
    if (scores.Edibles <= 0) delete scores.Edibles;
    scores.Flower = (scores.Flower || 0) + 3;
  }
  // Add-on edibles mention inside a Flower deal: demote Edibles so Flower remains primary
  if (addonOnly && scores.Edibles) {
    scores.Edibles -= 8;
    if (scores.Edibles <= 0) delete scores.Edibles;
    scores.Flower = (scores.Flower || 0) + 4;
  }
  // Generic edible potency/serving boost: if edible forms + mg or servings, prefer Edibles (skip add-on mentions)
  const edibleFormPresent = /(gumm?y|gumm?ies|gummy bears?|mints?|mint|chocolate|brownie|candy|cones?)/.test(text);
  const potencyOrServing = /(\b\d{2,4}\s?mg\b|\bservings?\b|\bpack of\b|\b\d+\s?x\b)/.test(text);
  if (edibleFormPresent && potencyOrServing && !addonOnly) {
    scores.Edibles = (scores.Edibles || 0) + 6;
    if (scores.Flower) { scores.Flower -= 4; if (scores.Flower <= 0) delete scores.Flower; }
  }
  // Explicit edible cones context (chocolate cones / baked cones) -> Edibles and drop PreRolls
  if (/(chocolate\s+cone(s)?|cone\s+edibles|baked\s+cones)/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 8;
    if (scores.Flower) { scores.Flower -= 6; if (scores.Flower <= 0) delete scores.Flower; }
    if (subsByCat && subsByCat.Flower && subsByCat.Flower.has('PreRolls')) {
      subsByCat.Flower.delete('PreRolls');
      if (subsByCat.Flower.size === 0) delete subsByCat.Flower;
    }
  }
  // Cannabis-infused mints -> Edibles, not Other/Hash (avoid strain 'Kush Mints' false positives)
  const hasMints = /\bmints?\b/.test(text);
  const isKushMints = /\bkush\s+mints?\b/.test(text);
  const petraOrInfused = /(petra|cannabis[- ]?infused)/.test(text);
  const thcWithMg = /\bthc\b/.test(text) && /\b\d{2,4}\s?mg\b/.test(text);
  const mintsEdible = hasMints && !isKushMints && (petraOrInfused || thcWithMg);
  if (mintsEdible) {
    scores.Edibles = (scores.Edibles || 0) + 12;
    if (scores.Flower) { scores.Flower -= 8; if (scores.Flower <= 0) delete scores.Flower; }
    if (scores.Other) { scores.Other -= 10; if (scores.Other <= 0) delete scores.Other; }
    if (scores.Hash) { scores.Hash -= 8; if (scores.Hash <= 0) delete scores.Hash; }
  }
  // Reclassification: cannabis-infused spreads/oils explicitly (nutella/honey/coconut oil) should favour Edibles
  if (/cannabis\s+(nutella|honey|coconut oil)|canna\s+(nutella|honey)/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 9;
    if (scores.Flower) { scores.Flower -= 7; if (scores.Flower <= 0) delete scores.Flower; }
  }
  // Strong dominance for cannabis coconut oil specifically (rich strain lists previously caused Flower to win)
  if (/cannabis\s+coconut oil/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 14;
    if (scores.Flower) { scores.Flower -= 11; if (scores.Flower <= 0) delete scores.Flower; }
  }
}

module.exports = { ediblesFalsePositiveDemotionRule };
