// Phase 2 Step 8: Medical & lineage overrides extracted.
// Original ordering in monolith:
//  - Medical flower suppression (Other vs Flower when antibiotic context & only generic strain) BEFORE crumble heuristic.
//  - Crumble heuristic (already extracted separately) THEN antibiotic/doxycycline block THEN lineage boost/demotion.
// To preserve semantics we export two staged rules invoked around concentrateEarlyOverridesRule.
// Exports:
//  medicalEarlyRule(ctx)
//  antibioticLineageRule(ctx)
// Inputs ctx: { text, scores }

function medicalEarlyRule(ctx) {
  const { text, scores } = ctx;
  if (scores.Other && scores.Flower) {
    const hasAntibiotic = /\bantibiotic|doxycycline\b/.test(text);
    if (hasAntibiotic) {
      const strongFlower = /(bud|buds|flower|kush|haze|diesel|nug|indica|sativa|hybrid|zkittlez| og |marijuana)/.test(text);
      const onlyStrainWord = /\bstrain(s)?\b/.test(text) && !strongFlower;
      if (onlyStrainWord) delete scores.Flower;
    }
  }
}

function antibioticLineageRule(ctx) {
  const { text, scores } = ctx;
  // Antibiotic / doxycycline (and related medical infection context) force into Other & demote Edibles
  // Added terms: urinary, infection(s), gastrointenstinal (common misspelling) & gastrointestinal to better catch medication contexts.
  if (/\bdoxycycline\b|\bantibiotic\b|\burinary\b|\binfections?\b|\bgastrointenstinal\b|\bcigarettes\b|\bgastrointestinal\b/.test(text)) {
    scores.Other = (scores.Other || 0) + 6;
    if (scores.Edibles) { scores.Edibles -= 8; if (scores.Edibles <= 0) delete scores.Edibles; }
  }
  // Lineage cross biasing Flower & suppressing Edibles if no ingestion forms
  const lineage = /(\(|\b)(?:[^)]{0,40})\bx\s+[^)]{2,40}\)|\bbx[0-9]\b|\bf[0-9]\b|\blineage\b|\bgenetics\b/;
  const trueIngestion = /(gummy|gummies|chocolate|brownie|cereal bar|nerd rope|capsule|capsules|wonky bar|infused|delight)/;
  if (lineage.test(text) && !trueIngestion.test(text)) {
    scores.Flower = (scores.Flower || 0) + 4;
    if (scores.Edibles) { scores.Edibles -= 5; if (scores.Edibles <= 0) delete scores.Edibles; }
  }
}

module.exports = { medicalEarlyRule, antibioticLineageRule };
