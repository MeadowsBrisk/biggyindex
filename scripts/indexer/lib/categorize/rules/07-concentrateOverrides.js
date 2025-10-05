// Phase 2 Step 6: Concentrate-related overrides extracted with ordering preserved.
// Exports three staged rules mirroring original inline positions:
//  - concentrateEarlyOverridesRule: crumble heuristic demotion
//  - concentrateMidOverridesRule: distillate chocolate bar -> Edibles redirect
//  - concentrateLatePrecedenceRule: concentrates vs flower precedence adjustment

function concentrateEarlyOverridesRule(ctx) {
  const { text, scores } = ctx;
  if (!(scores.Concentrates && scores.Flower)) return;
  const hasCrumble = /\bcrumble\b/.test(text);
  if (hasCrumble) {
    const hasOtherConSignals = /(extract|dab|shatter|rosin|wax|sauce|distillate|live resin|bho)/.test(text);
    const hasFlowerSignals = /(flower|bud|buds|budds|nug|nuggs|strain)/.test(text);
    if (!hasOtherConSignals && hasFlowerSignals) {
      scores.Concentrates -= 5;
      if (scores.Concentrates <= 0) delete scores.Concentrates;
    }
  }
}

function concentrateMidOverridesRule(ctx) {
  const { text, scores } = ctx;
  if (/(chocolate|bar)/.test(text) && /distillate|distilate|delta 9|delta-9|delta9/.test(text) && /(edible|gummy|gummies|bar|chocolate|piece|pieces)/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 6;
    if (scores.Concentrates) { scores.Concentrates -= 5; if (scores.Concentrates <= 0) delete scores.Concentrates; }
    if (scores.Vapes) { scores.Vapes -= 2; if (scores.Vapes <= 0) delete scores.Vapes; }
    const mgPotency = /\b\d{2,4}\s?mg\b/.test(text);
    if (mgPotency) {
      scores.Edibles += 4;
      if (scores.Concentrates) { scores.Concentrates -= 3; if (scores.Concentrates <= 0) delete scores.Concentrates; }
    }
  }

  // Gummies with D9/Distillate/RSO should be Edibles, not Concentrates
  if (/(gummie|gummy|gummies)/.test(text) && (/(delta 9|delta-9|delta9|d9|distillate|distilate|rso)/.test(text) || /\b\d{2,4}\s?mg\b/.test(text))) {
    scores.Edibles = (scores.Edibles || 0) + 8;
    if (scores.Concentrates) { scores.Concentrates -= 7; if (scores.Concentrates <= 0) delete scores.Concentrates; }
  }

  // Edible cones without concentrate tokens but clear edible context (chocolate cones + mg or packs)
  if (/(baked\s+cones|chocolate\s+cone(s)?)/.test(text) && /(\b\d{2,4}\s?mg\b|\bpack(s)?\b|\b\d+\s?x\b)/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 7;
    if (scores.Flower) { scores.Flower -= 5; if (scores.Flower <= 0) delete scores.Flower; }
  }

  // NEW: Confection listings (candy/sweets/drops/pieces/cones) infused with concentrates (e.g., shatter)
  // Redirect to Edibles and demote Concentrates
  if (/(candy|sweet|sweets|drops|pieces|gummy|gummies|cone|cones)/.test(text) && /(shatter|wax|rosin|crumble|badder|batter|diamonds|distillate|distilate|live resin|rso|thca|thc-a|extract)/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 7;
    if (scores.Concentrates) { scores.Concentrates -= 6; if (scores.Concentrates <= 0) delete scores.Concentrates; }
    const mgPotency2 = /\b\d{2,4}\s?mg\b/.test(text);
    if (mgPotency2) scores.Edibles += 2;
  }

  // NEW: Tablets/Capsules formulated with concentrates should classify as Edibles
  if (/(tablet|tablets|capsule|capsules|rosintab)/.test(text) && /(rosin|shatter|distillate|distilate|live resin|rso)/.test(text)) {
    scores.Edibles = (scores.Edibles || 0) + 8;
    if (scores.Concentrates) { scores.Concentrates -= 7; if (scores.Concentrates <= 0) delete scores.Concentrates; }
  }
}

function concentrateLatePrecedenceRule(ctx) {
  const { text, scores, name } = ctx;
  // High-alcohol infused beverage (e.g., Lemonchillo / Limoncello style 40% alcohol + mg) should classify as Other per user directive
  if (/\b(lem(?:on)?c?h?ill?o|limon?c?h?ell?o)\b/.test(text) && /(40%\s*alcohol|\b\d{2,4}\s?mg\b)/.test(text)) {
    // Strongly bias toward Other; treat as infused beverage
    scores.Other = (scores.Other || 0) + 12;
    if (scores.Concentrates) { scores.Concentrates -= 10; if (scores.Concentrates <= 0) delete scores.Concentrates; }
    if (scores.Edibles) { scores.Edibles -= 6; if (scores.Edibles <= 0) delete scores.Edibles; }
  }
  if (/\bnug\s*run\b/.test(text)) {
    scores.Concentrates = (scores.Concentrates || 0) + 6;
    if (scores.Flower) {
      scores.Flower -= 5;
      if (scores.Flower <= 0) delete scores.Flower;
    }
  }
  // Live resin tincture context handling: avoid misclassifying as Concentrates when it's clearly a tincture
  const hasTinctureWord = /\btincture(s)?\b/.test(text);
  if (hasTinctureWord && /live resin/.test(text)) {
    const otherStrongConc = /(wax|shatter|crumble|badder|batter|rosin|rso|diamonds|distillate|distilate|thca|thc-a|piatella|cold cure|slab|extract)/.test(text);
    if (!otherStrongConc) {
      // Boost Tincture decisively; demote incidental Concentrates score from 'live resin'
      scores.Tincture = (scores.Tincture || 0) + 6;
      if (scores.Concentrates) {
        scores.Concentrates -= 6;
        if (scores.Concentrates <= 0) delete scores.Concentrates;
      }
    }
  }
  // Strong name-based concentrate booster: listings explicitly named Concentrate should rarely be classified as Flower
  const nameLower = (name || '').toLowerCase();
  if (/concentrate/.test(nameLower)) {
    const signalMatches = (text.match(/concentrate|wax|rosin|sauce|sugar|diamonds|crumble|badder|batter|thca|thc-a|distillate|live resin|shatter|rso|piatella|cold cure|extract/gi) || []).length;
    const baseBoost = 6; // strong baseline
    const extra = Math.min(8, signalMatches * 2);
    scores.Concentrates = (scores.Concentrates || 0) + baseBoost + extra;
    // If Flower present and Concentrates now equals or exceeds Flower, gently demote Flower
    if (scores.Flower && scores.Concentrates >= scores.Flower) {
      scores.Flower -= 4;
      if (scores.Flower <= 0) delete scores.Flower;
    }
  }
  // Name-based sugar form indicates concentrate even if description is strain-like
  if (/\bsugar\b/.test(nameLower) && !/sugar-?coated/.test(nameLower)) {
    scores.Concentrates = (scores.Concentrates || 0) + 6;
    if (scores.Flower) { scores.Flower -= 4; if (scores.Flower <= 0) delete scores.Flower; }
  }
    // Boost Concentrates for crystalline ONLY when clear concentrate co-signals present (avoid prose adjectives)
    if (/\bcrystalline\b|\bcrystal\b/.test(text)) {
      const coSignals = /(thca|thc-a|diamonds?|extract|concentrate|shatter|rosin|live resin|distillate|rso|sauce|terp sauce|terpene sauce)/;
      if (coSignals.test(text)) {
        scores.Concentrates = (scores.Concentrates || 0) + 5;
        if (scores.Flower) { scores.Flower -= 3; if (scores.Flower <= 0) delete scores.Flower; }
      }
    }
  // Name-only crystalline should still give a nudge to Concentrates to overcome strain prose when paired with concentrate lexicon elsewhere
  if (/(\bcrystalline\b|\bcrystal\b)/.test(nameLower)) {
    scores.Concentrates = (scores.Concentrates || 0) + 8;
    if (scores.Flower) { scores.Flower -= 6; if (scores.Flower <= 0) delete scores.Flower; }
  }
  // Name-based concentrate forms (shatter/wax/rosin/badder/batter/crumble/sauce) strongly indicate Concentrates
  if (/(shatter|wax|rosin|badder|batter|crumble|sauce|terp\s*sauce)/.test(nameLower)) {
    scores.Concentrates = (scores.Concentrates || 0) + 7;
    if (scores.Flower) { scores.Flower -= 6; if (scores.Flower <= 0) delete scores.Flower; }
  }
  if (/\bsugar\b/.test(text) && /(wax|shatter|rosin|sauce|live resin|rso|diamonds|distillate|distilate|thca|thc-a|extract)/.test(text)) {
    scores.Concentrates = (scores.Concentrates || 0) + 4;
    if (scores.Flower) { scores.Flower -= 2; if (scores.Flower <= 0) delete scores.Flower; }
  }

  // THC Syrup: treat as Concentrates unless clear vape hardware context
  if (/thc\s*syrup/.test(text)) {
    const hardwareTokens = /(cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510\b|device)/;
    if (!hardwareTokens.test(text)) {
      scores.Concentrates = (scores.Concentrates || 0) + 7;
      if (scores.Flower) { scores.Flower -= 5; if (scores.Flower <= 0) delete scores.Flower; }
      if (scores.Vapes) { scores.Vapes -= 3; if (scores.Vapes <= 0) delete scores.Vapes; }
    }
  }

  // Syringe/applicator for concentrates (1g applicator etc.) -> Concentrates over Flower
  if (/(syringe|applicator)\b/.test(text) && /\b1\s?g\b|\b1\.0\s?g\b/.test(text)) {
    scores.Concentrates = (scores.Concentrates || 0) + 6;
    if (scores.Flower) { scores.Flower -= 4; if (scores.Flower <= 0) delete scores.Flower; }
  }
  // Flower-context sugar/crystal false positive demotion
  if (scores.Concentrates) {
    const sugarLike = /(\bsugar\b|\bcrystal(?:line)?\b)/;
    const hasOnlySugarLike = sugarLike.test(text) && !/(wax|shatter|crumble|badder|batter|rosin|live resin|rso|thca|thc-a|diamonds|distillate|distilate|sauce|terp sauce|terpene sauce|piatella|cold cure|slab|extract)/.test(text);
    const strongFlowerCtx = /(\bflower\b|\bbud|\bbuds|\bstrain\b|\bstrains\b|hybrid|indica|sativa|runtz|sherb|sherbet|zkittlez|diesel|tops|blueberry|cake|frost|frosty|indoor|outdoor|greenhouse|seeds?)/.test(text);
    if (hasOnlySugarLike && strongFlowerCtx) {
      scores.Concentrates -= 6;
      if (scores.Concentrates <= 0) delete scores.Concentrates;
      scores.Flower = (scores.Flower || 0) + 4;
    }
  }
  if (scores.Concentrates && scores.Flower) {
    const concSignals = /(rosin|wax|shatter|crumble|badder|batter|sauce|terp sauce|terpene sauce|live resin|rso|diamond|diamonds|crystalline|crystal|thca|thc-a|distillate|distilate|piatella|cold cure|cold-cure|6\*|6 star|6star|six star|wpff|slab|extract|concentrate|concentrates|resale pots|static sift|sugar)/;
    // NEW: guards for tincture & edible ingestion contexts
    const hasTincture = /\btincture(s)?\b/.test(text);
    const ingestionEdible = /(gummy|gummies|chocolate|brownie|cereal bar|nerd rope|capsule|capsules|tablet|tablets|wonky bar|nutella|honey|cannabutter|canna butter|coconut oil)/.test(text);
    const strongConcDistinct = /(wax|shatter|crumble|badder|batter|rosin|live resin|rso|thca|thc-a|diamonds|distillate|distilate|sauce|terp sauce|terpene sauce|piatella|cold cure|slab|extract)/.test(text);
    // If only generic 'concentrate(s)' or 'live resin' along with tincture mention -> avoid boost (let Tincture win)
    const allowConcBoost = !(hasTincture && !strongConcDistinct);
    // If edible ingestion present and no distinct strong concentrate tokens (other than generic words) -> avoid boost for gummies brand 'concentrates'
    const edibleSkip = ingestionEdible && !strongConcDistinct;
    // Tablets/capsules ingestion should remain Edibles even if strong concentrate tokens are present
    const tabletCapsIngestion = /(tablet|tablets|capsule|capsules)/.test(text);
    if (tabletCapsIngestion) {
      // Demote Concentrates further to avoid winning over Edibles
      if (scores.Concentrates) { scores.Concentrates -= strongConcDistinct ? 7 : 5; if (scores.Concentrates <= 0) delete scores.Concentrates; }
    }
    if (concSignals.test(text) && allowConcBoost && !edibleSkip && !tabletCapsIngestion) {
      scores.Concentrates += 5;
      scores.Flower -= 5;
      if (scores.Flower <= 0) delete scores.Flower;
    } else if (edibleSkip && scores.Concentrates) {
      // Slight demotion to let Edibles precedence hold
      scores.Concentrates -= 3;
      if (scores.Concentrates <= 0) delete scores.Concentrates;
    } else if (hasTincture && scores.Concentrates && !strongConcDistinct) {
      // Demote generic concentrate presence in tincture context
      scores.Concentrates -= 4;
      if (scores.Concentrates <= 0) delete scores.Concentrates;
    }
    // Additional dominance logic: multiple strong concentrate tokens -> further boost
    if (scores.Concentrates && scores.Flower) {
      const strongTokens = [
        'concentrate','concentrates','wax','shatter','rosin','crumble','badder','batter','sugar','diamonds','rso','distillate','distilate','live resin','thca','thc-a'
      ];
      let present = 0;
      for (const tok of strongTokens) {
        if (text.includes(tok)) present++;
      }
      if (present >= 2 && scores.Flower > scores.Concentrates) {
        scores.Concentrates += present * 2; // scale boost
        scores.Flower -= 2; if (scores.Flower <= 0) delete scores.Flower;
      }
    }
  }
}

module.exports = { concentrateEarlyOverridesRule, concentrateMidOverridesRule, concentrateLatePrecedenceRule };
