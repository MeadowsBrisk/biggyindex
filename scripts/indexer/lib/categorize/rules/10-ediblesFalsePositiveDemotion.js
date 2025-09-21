// Phase 2: Extracted Edibles false-positive demotion & Flower fallback
// Logic: If Edibles scored but only generic sweet/candy language without true ingestion
// forms AND strong flower context, demote Edibles and bump Flower.

function ediblesFalsePositiveDemotionRule(ctx) {
  const { text, scores } = ctx;
  if (!scores.Edibles) return;
  const trueEdibleForms = /(gummy|gummies|choco|chocolate|brownie|capsule|capsules|tablet|tablets|cannabutter|canna butter|coconut oil|cannabis oil|cereal bar|nerd rope|rope|ropes|bar\b|bars\b|wonky bar|infused|delight)/;
  const genericSweet = /(sweet|candy)/;
  const strongFlowerContext = /(\bstrain\b|\bstrains\b|\bhybrid\b|indica|sativa|\bcali\b|exotic|exotics|\bflower\b|bud|buds)/;
  if (!trueEdibleForms.test(text) && genericSweet.test(text) && strongFlowerContext.test(text)) {
    scores.Edibles -= 6;
    if (scores.Edibles <= 0) delete scores.Edibles;
    scores.Flower = (scores.Flower || 0) + 3;
  }
  // Reclassification: cannabis-infused spreads/oils explicitly (nutella/honey/coconut oil) should favour Edibles
  if (/cannabis\s+(nutella|honey|coconut oil)|canna\s+(nutella|honey)/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 5;
    if (scores.Flower) { scores.Flower -= 4; if (scores.Flower <= 0) delete scores.Flower; }
  }
  // Strong dominance for cannabis coconut oil specifically (rich strain lists previously caused Flower to win)
  if (/cannabis\s+coconut oil/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 8;
    if (scores.Flower) { scores.Flower -= 6; if (scores.Flower <= 0) delete scores.Flower; }
  }
}

module.exports = { ediblesFalsePositiveDemotionRule };
