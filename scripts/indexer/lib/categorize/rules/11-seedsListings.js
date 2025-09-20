// Seeds listings guard: steer seed packs/breeder seeds into Other
// Avoids misclassifying as Flower when listings are for seeds (packs, breeder/seedbank terms)

function seedsListingsRule(ctx) {
  const { name, text, scores } = ctx;
  const title = (name || '').toLowerCase();
  const t = text; // already lowercased and padded
  const hasSeedsWordInTitle = /\bseeds?\b/.test(title);
  const seedVocab = /(seed\s*bank|seedbank|seedbay|feminized|autoflower(?:ing)?|germination)/;
  const packHint = /(\d+\s*pack|\bpack\b|ten\s*pack|5\s*pack|five\s*pack|ten\s*pack)/;
  const hasSeedContext = (hasSeedsWordInTitle || /\bseeds?\b/.test(t)) && (seedVocab.test(t) || packHint.test(t));
  if (hasSeedContext) {
    // Strongly prefer Other; demote Flower to avoid accidental win
    scores.Other = (scores.Other || 0) + 12;
    if (scores.Flower) { scores.Flower -= 10; if (scores.Flower <= 0) delete scores.Flower; }
  }
}

module.exports = { seedsListingsRule };


