// Phase 2 Step 5: Hash-related overrides & precedence extracted.
// To preserve original ordering (multiple distinct hash logic blocks), we expose three staged rules:
//  1) hashEarlyOverridesRule: 'hash concentrate' fix + decarb/candy edible demotions (ran early)
//  2) templeBallsRule: temple balls forcing Hash (originally after vape overrides)
//  3) hashPrecedenceRule: late precedence adjustment Hash vs Flower
// Each rule mutates scores in-place without altering semantics.

function hashEarlyOverridesRule(ctx) {
  const { text, scores } = ctx;
  // Heuristic: listings phrased as "landed some [sherb/sherbet/sherbert]" often correspond to hash products in this dataset
  if (/landed\s+some\s+(?:sunset\s+)?sherb(?:ert|et)?\b/.test(text)) {
    scores.Hash = (scores.Hash || 0) + 4;
    if (scores.Flower) { scores.Flower -= 3; if (scores.Flower <= 0) delete scores.Flower; }
  }
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
  // Drytek/drytech is a hash/dry sift style -> bias Hash and demote Concentrates
  if (/\bdry\s?tek\b|\bdry\s?tech\b/.test(text)) {
    scores.Hash = (scores.Hash || 0) + 6;
    if (scores.Concentrates) { scores.Concentrates -= 4; if (scores.Concentrates <= 0) delete scores.Concentrates; }
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
  const { text, scores, name, subsByCat } = ctx;
  // Diamond infused flower often refers to moonrocks; steer to Hash.Moonrocks
  if (/diamond\s+infused\s+flower|infused\s+flower.*diamond|diamond\s+flower/.test(text)) {
    scores.Hash = (scores.Hash || 0) + 6;
    if (scores.Flower) { scores.Flower -= 6; if (scores.Flower <= 0) delete scores.Flower; }
    (subsByCat.Hash ||= new Set()).add('Moonrocks');
  }
  if (scores.Hash && scores.Flower) {
    const hashSignals = /(\bhash\b|hashish|dry sift|dry-sift|dry filtered|dry-filtered|static sift|static hash|piatella|kief|pollen|moonrock|moon rock|temple ball|temple balls|mousse hash|simpson kush|\b120u\b|120\s*(?:micron|microns|µ|μ))/;
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
  // Minimal strain-only titles like 'SUNSET SHERBET' sometimes are hash drops; nudge Hash slightly to avoid 'Other'
  const nameLower = (name || '').toLowerCase();
  if (/^\s*[a-z][a-z\s]+$/.test(nameLower) && /sherb|sherbet|sherbert/.test(nameLower) && !/gummy|vape|cart|bar|chocolate|capsule|tablet/.test(text)) {
    scores.Hash = (scores.Hash || 0) + 2;
  }
}

module.exports = { hashEarlyOverridesRule, templeBallsRule, hashPrecedenceRule };
