import type { CatContext } from '../types';

// Parity port of 05-ediblesVsFlowerDisambiguation.js
// Prevent dessert-strain words (cookies, cake, runtz, etc.) from forcing Edibles when strong flower context and no ingestion tokens.

export function ediblesVsFlowerDisambiguationRule(ctx: CatContext) {
  const { text, scores } = ctx;
  if (!scores.Edibles) return;
  const ingestionTokens = /(gummy|gummies|choco|chocolate|brownie|capsule|capsules|cannabutter|canna butter|coconut oil|cannabis oil|cereal bar|bars?\b|nerd rope|nerd ropes|rope|ropes|candy drops|edible|edibles|butter|caps\b|brownies|cookies?\b|honey|nutella)/;
  const strongFlowerSignals = /(\bflower\b|\bbud|\bbuds|\bstrain\b|\bstrains\b|\bhybrid\b|indica|sativa|terp|terps|genetics|lineage|phenotype|pheno|frosty|trichome|trichomes|grams?\b|\d+\s*g\b|thc\s*%|thc\s*\d{1,2}%|effects?:|genetics?:|cross(ed)?\s+with|made\s+by\s+crossing)/;
  const edibleCone = /(baked\s+cones|chocolate\s+cone(s)?)/.test(text) && /(\b\d{2,4}\s?mg\b|\bpack(s)?\b|\b\d+\s?x\b)/.test(text);
  if (edibleCone) {
    ctx.add('Edibles', 6);
    if (scores.Flower) ctx.demote('Flower', 4);
  }
  const dessertStrainTokens = /(cookies|cake|runtz|sherb|sherbert|sherbet|rainbow\s+sherbert|candy\b|blueberry\b|cheese\b|mochi|gumball|limoncello|gelato|zk?ittlez|gushers|sundae|sorbet|pancake|waffle|donut|doughnut|muffin|pie|tart)/;
  const hasIngestion = ingestionTokens.test(text);
  const hasFlowerContext = strongFlowerSignals.test(text);
  const onlyDessertTokens = dessertStrainTokens.test(text) && !hasIngestion;
  const gramMenuPattern = /(\b1\s*g\b|\b3\.5\s*g\b|\b7\s*g\b|\b14\s*g\b|\b28\s*g\b)/g;
  const gramMatches = (text.match(gramMenuPattern) || []).length;
  if (!hasIngestion && hasFlowerContext && (onlyDessertTokens || gramMatches >= 2)) {
    ctx.demote('Edibles', 6);
    if (hasFlowerContext) ctx.add('Flower', 3);
  }
}

export default ediblesVsFlowerDisambiguationRule;
