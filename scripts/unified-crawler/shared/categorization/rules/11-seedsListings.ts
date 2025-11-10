import type { CatContext } from '../types';

// Parity port of 11-seedsListings.js

export function seedsListingsRule(ctx: CatContext) {
  const { name, text, scores } = ctx;
  const title = (name || '').toLowerCase();
  const t = text;
  const hasSeedsWordInTitle = /\bseeds?\b/.test(title);
  const seedVocab = /(seed\s*bank|seedbank|seedbay|feminized|autoflower(?:ing)?|germination)/;
  const packHint = /(\d+\s*pack|\bpack\b|ten\s*pack|5\s*pack|five\s*pack|ten\s*pack)/;
  const hasSeedContext = (hasSeedsWordInTitle || /\bseeds?\b/.test(t)) && (seedVocab.test(t) || packHint.test(t));
  if (hasSeedContext) {
    ctx.add('Other', 12);
    if (scores.Flower) ctx.demote('Flower', 10);
  }
}

export default seedsListingsRule;
