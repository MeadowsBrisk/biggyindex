// Phase 2 Step 2: Fallback boosts rule (hash/flower/edible/vape/mushroom/lsd)
// Mirrors legacy inline heuristics without behaviour change.
// Context object expects: { text, scores, subsByCat }

function fallbackBoostsRule(ctx) {
  const { text, scores, subsByCat } = ctx;
  if (/\bhash\b/.test(text)) scores.Hash = (scores.Hash || 0) + 3;
  if (/\bflower\b|\bbud\b/.test(text)) scores.Flower = (scores.Flower || 0) + 2;
  if (/\bedible\b/.test(text)) scores.Edibles = (scores.Edibles || 0) + 2;
  if (/\bvape\b|\bcart\b|\bcartridge\b|\bdisposable\b/.test(text)) scores.Vapes = (scores.Vapes || 0) + 3;
  if (/\bmush|shroom|psilocy/.test(text)) {
    scores.Psychedelics = (scores.Psychedelics || 0) + 2;
    (subsByCat.Psychedelics ||= new Set()).add('Mushrooms');
  }
  if (/\blsd\b|\bacid\b|\bdmt\b/.test(text)) scores.Psychedelics = (scores.Psychedelics || 0) + 2;
  // Edible oil/spread special boost (avoid misclassification as Flower)
  if (/(coconut oil|canna\s+nutella|cannabis nutella|nutella|canna honey|cannabis honey)/.test(text) && !/mad honey/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 4;
  }
  // Mad honey should classify as Other (prevent Edibles misfire via 'infused' or future honey tokens)
  if (/mad\s+honey/.test(text)) {
    scores.Other = (scores.Other || 0) + 10;
    if (scores.Edibles) { scores.Edibles -= 8; if (scores.Edibles <= 0) delete scores.Edibles; }
  }
}

module.exports = { fallbackBoostsRule };
