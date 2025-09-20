// Phase 2 Step 5: Hash-related overrides & precedence extracted.
// To preserve original ordering (multiple distinct hash logic blocks), we expose three staged rules:
//  1) hashEarlyOverridesRule: 'hash concentrate' fix + decarb/candy edible demotions (ran early)
//  2) templeBallsRule: temple balls forcing Hash (originally after vape overrides)
//  3) hashPrecedenceRule: late precedence adjustment Hash vs Flower
// Each rule mutates scores in-place without altering semantics.

function hashEarlyOverridesRule(ctx) {
  const { text, scores } = ctx;
  // Hash vs Edibles / Concentrates fix for 'hash concentrate'
  if (/hash concentrate/.test(text)) {
    scores.Hash = (scores.Hash || 0) + 5;
    if (scores.Edibles) { scores.Edibles -= 3; if (scores.Edibles <= 0) delete scores.Edibles; }
    scores.Concentrates = (scores.Concentrates || 0) + 2;
  }
  // Explicit Simpson Kush override (user directive: treat as hash product)
  if (/simpson\s+kush/.test(text)) {
    scores.Hash = (scores.Hash || 0) + 8; // strong boost
    if (scores.Flower) { scores.Flower -= 6; if (scores.Flower <= 0) delete scores.Flower; }
  }
  // Additional hash overrides: 'decarb hash' or plain 'hash' with candy/cubes words but no ingestion form -> force Hash
  if (/\bhash\b/.test(text)) {
    if (/decarb/.test(text)) {
      scores.Hash = (scores.Hash || 0) + 4;
    }
    const ingestionForms = /(gummy|gummies|chocolate|brownie|cereal bar|nerd rope|rope|capsule|capsules|wonky bar|delight|honey|nutella)/;
    const candyish = /(candy|cubes|cube|sweet|sweets)/;
    if (!ingestionForms.test(text) && candyish.test(text) && scores.Edibles) {
      scores.Edibles -= 6; if (scores.Edibles <= 0) delete scores.Edibles;
      scores.Hash = (scores.Hash || 0) + 2;
    }
  }
}

function templeBallsRule(ctx) {
  const { text, scores } = ctx;
  if (/temple\s+ball|temple\s+balls/.test(text)) {
    scores.Hash = (scores.Hash || 0) + 6;
    if (scores.Concentrates) { scores.Concentrates -= 5; if (scores.Concentrates <= 0) delete scores.Concentrates; }
  }
}

function hashPrecedenceRule(ctx) {
  const { text, scores, name } = ctx;
  if (scores.Hash && scores.Flower) {
    const hashSignals = /(\bhash\b|hashish|dry sift|dry-sift|dry filtered|dry-filtered|static sift|static hash|piatella|kief|pollen|moonrock|moon rock|temple ball|temple balls|mousse hash|simpson kush)/;
    if (hashSignals.test(text)) {
      scores.Hash += 5;
      scores.Flower -= 5;
      if (scores.Flower <= 0) delete scores.Flower;
    }
    // Additional safeguard: if the NAME itself contains 'hash' ensure Hash wins over Flower-heavy genetic descriptors
    if (/\bhash\b/.test((name || '').toLowerCase())) {
      scores.Hash += 4; // strong nudge
      if (scores.Flower) {
        scores.Flower -= 2;
        if (scores.Flower <= 0) delete scores.Flower;
      }
    }
  }
}

module.exports = { hashEarlyOverridesRule, templeBallsRule, hashPrecedenceRule };
