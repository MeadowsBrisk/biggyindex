import type { CatContext } from '../types';

// Parity port of 05b-prerollRefinement.js
// Removes false-positive Flower.PreRolls subcategory in shake/trim/dust/popcorn usage contexts etc.

export function prerollRefinementRule(ctx: CatContext) {
  const { text, subsByCat, scores } = ctx;
  const flowerSubs = subsByCat.Flower;
  if (!flowerSubs || !flowerSubs.has('PreRolls')) return;
  const hasShakeLike = /(shake|trim|dust|popcorn)/.test(text);
  const usagePhrase = /(perfect|great|ideal)\s+for\s+(blunts?|joints?|pre[- ]?rolls?|cones?)/.test(text);
  const prerollQuality = /preroll\s+quality/.test(text);
  const thaiStickStrain = /\bthai(?:[-\s]+)stick(s)?\b/.test(text);
  const shakeQuality = /(ultimate|super|premium)\s+preroll\s+quality/.test(text) && /shake/.test(text);
  const packIndicators = /(pack|box|tube|doob|doobie|multi|bundle)/;
  const explicitCountPre = /\b\d+\s?(x\s?)?(pre[- ]?rolls?|joints?|blunts?|cones?)\b/;
  const preRolledTerm = /pre[- ]?rolled/;
  const isPack = packIndicators.test(text) || explicitCountPre.test(text) || preRolledTerm.test(text);
  const shouldRemove = (
    (hasShakeLike && !isPack) ||
    (prerollQuality && hasShakeLike) ||
    (usagePhrase && hasShakeLike) ||
    thaiStickStrain ||
    shakeQuality
  );
  if (shouldRemove) {
    flowerSubs.delete('PreRolls');
    if (flowerSubs.size === 0) delete subsByCat.Flower;
  }
  const hashOnlyMoonrock = flowerSubs?.has('PreRolls') && /moonrock|moonrocks/.test(text) && !/(\bhash\b|kief|pollen|dry sift|dry-filtered|static sift|piatella|temple ball|temple balls)/.test(text);
  if (hashOnlyMoonrock && scores.Hash) {
    ctx.demote('Hash', 6);
  }
}

export default prerollRefinementRule;
