// Edible sauce / confection refinement rule
// Goal: prevent misclassification of confectionery "sauce" (e.g. wonky/oompa/oompa loompa themed, chocolate mg dosed) as Concentrates
// while preserving true concentrate 'terp sauce' / 'live resin sauce' classifications.
// Heuristics:
//  - If name contains 'edibles' -> strong Edibles boost (unless strong concentrate tokens present)
//  - 'wonky sauce' OR ('sauce' AND (wonky|oompa|oompa loompa|gourmet) AND edible candy/chocolate indicators AND mg potency) => Edibles dominance
//  - 'sauce' with confection tokens and WITHOUT terp/live resin/rosin/wax/shatter etc => shift to Edibles
//  - Avoid firing when 'terp sauce' / 'live resin sauce' / 'rosin sauce' present (those stay concentrates)
//  - If we boost Edibles and Concentrates present only via generic 'sauce' token, demote Concentrates

function edibleSauceRefinementRule(ctx) {
  const { name, text, scores } = ctx;
  const lowerName = (name || '').toLowerCase();
  const strongConcentrateSignals = /(terp|terpene|live resin|rosin|shatter|wax|crumble|badder|batter|diamonds|thca|thc-a|distillate|distilate|rso)/;
  // 1. Name explicit 'edibles'
  if (/\bedibles\b/.test(lowerName)) {
    scores.Edibles = (scores.Edibles || 0) + 8;
    if (scores.Concentrates && !strongConcentrateSignals.test(text)) {
      scores.Concentrates -= 5; if (scores.Concentrates <= 0) delete scores.Concentrates;
    }
  }
  // Early exit if no 'sauce' keyword
  if (!/\bsauce\b/.test(text)) return;
  const hasTerpSauceContext = /(terp|terpene|live resin)/.test(text);
  if (hasTerpSauceContext) return; // leave concentrate classification alone

  const confectionTokens = /(choc|chocolate|bar|cookie|cookies|honeycomb|caramel|smarties|pieces|piece|oompa|loompa|wonky|wonka|candy|sweet|gourmet)/;
  const wonkyContext = /(wonky|oompa|loompa|oompa\s+loompa|wonka)/.test(text);
  const mgPotency = /\b\d{2,4}\s?mg\b/.test(text);
  const looksConfectionSauce = confectionTokens.test(text) && (wonkyContext || mgPotency);

  if (looksConfectionSauce) {
    scores.Edibles = (scores.Edibles || 0) + 7;
    // If concentrate score exists but only due to generic 'sauce' (no other concentrate tokens), demote
    if (scores.Concentrates && !strongConcentrateSignals.test(text)) {
      scores.Concentrates -= 6; if (scores.Concentrates <= 0) delete scores.Concentrates;
    }
  }
}

module.exports = { edibleSauceRefinementRule };

