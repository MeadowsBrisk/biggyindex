// Other paraphernalia overrides (Bongs etc.)
// Intentionally use TITLE-ONLY matching to avoid false positives from descriptive text in other listings.

function otherParaphernaliaRule(ctx) {
  const { name, scores, subsByCat } = ctx;
  const title = (name || '').toLowerCase();
  // Title mentions bong(s) decisively indicate paraphernalia
  if (/\bbongs?\b/.test(title)) {
    scores.Other = (scores.Other || 0) + 12;
    // Demote competing cannabis product categories if present
    if (scores.Flower) { scores.Flower -= 8; if (scores.Flower <= 0) delete scores.Flower; }
    if (scores.Concentrates) { scores.Concentrates -= 8; if (scores.Concentrates <= 0) delete scores.Concentrates; }
    if (scores.Vapes) { scores.Vapes -= 6; if (scores.Vapes <= 0) delete scores.Vapes; }
  (subsByCat.Other ||= new Set()).add('Bongs');
  }
}

module.exports = { otherParaphernaliaRule };
