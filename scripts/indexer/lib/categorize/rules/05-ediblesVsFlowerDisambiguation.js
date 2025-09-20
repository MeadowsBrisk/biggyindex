// Phase 2 Step 4: Edibles vs Flower dessert strain disambiguation rule
// Mirrors inline logic previously in index-items.js without behaviour change.
// Purpose: prevent dessert-named flower strains (cookies, cake, runtz, etc.) from being misclassified as Edibles
// just because of sweet/candy style tokens, when strong flower context exists and no true ingestion forms.
// Inputs: { text, scores }

function ediblesVsFlowerDisambiguationRule(ctx) {
  const { text, scores } = ctx;
  if (!scores.Edibles) return; // only relevant if Edibles scored
  const ingestionTokens = /(gummy|gummies|choco|chocolate|brownie|capsule|capsules|cannabutter|canna butter|coconut oil|cannabis oil|cereal bar|bars?\b|nerd rope|nerd ropes|rope|ropes|candy drops|edible|edibles|butter|caps\b|brownies|cookies?\b|honey|nutella)/;
  const strongFlowerSignals = /(\bflower\b|\bbud|\bbuds|\bstrain\b|\bstrains\b|\bhybrid\b|indica|sativa|terp|terps|genetics|lineage|phenotype|pheno|frosty|trichome|trichomes|grams?\b|\d+\s*g\b)/;
  const dessertStrainTokens = /(cookies|cake|runtz|sherb|sherbert|sherbet|rainbow\s+sherbert|candy|blueberry|cheese|mochi|gumball|limoncello|gelato|zk?ittlez|gushers|sundae|sorbet|pancake|waffle|donut|doughnut|muffin|pie|tart)/;
  const hasIngestion = ingestionTokens.test(text);
  const hasFlowerContext = strongFlowerSignals.test(text);
  const onlyDessertTokens = dessertStrainTokens.test(text) && !hasIngestion;
  const gramMenuPattern = /(\b1\s*g\b|\b3\.5\s*g\b|\b7\s*g\b|\b14\s*g\b|\b28\s*g\b)/g;
  const gramMatches = (text.match(gramMenuPattern) || []).length;
  if (!hasIngestion && hasFlowerContext && (onlyDessertTokens || gramMatches >= 2)) {
    scores.Edibles -= 6;
    if (scores.Edibles <= 0) delete scores.Edibles;
    if (hasFlowerContext) scores.Flower = (scores.Flower || 0) + 3;
  }
}

module.exports = { ediblesVsFlowerDisambiguationRule };
