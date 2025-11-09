import type { CatContext } from '../types';

// Parity port of legacy 03-fallbackBoosts.js
// Generic boosts for hash/flower/edible/vape; mushroom & LSD psychedelic boosts;
// edible spread/oil special; mad honey override to Other.

export function fallbackBoostsRule(ctx: CatContext) {
  const { text, scores, subsByCat } = ctx;
  if (/\bhash\b/.test(text)) ctx.add('Hash', 3);
  if (/\bflower\b|\bbud\b/.test(text)) ctx.add('Flower', 2);
  if (/\bedible\b/.test(text)) ctx.add('Edibles', 2);
  if (/\bvape\b|\bcart\b|\bcartridge\b|\bdisposable\b/.test(text)) ctx.add('Vapes', 3);
  if (/\bmush|shroom|psilocy/.test(text)) {
    ctx.add('Psychedelics', 2);
    (subsByCat.Psychedelics ||= new Set()).add('Mushrooms');
  }
  if (/\blsd\b|\bacid\b|\bdmt\b/.test(text)) ctx.add('Psychedelics', 2);
  if (/(coconut oil|canna\s+nutella|cannabis nutella|nutella|canna honey|cannabis honey)/.test(text) && !/mad honey/.test(text)) {
    ctx.add('Edibles', 4);
  }
  if (/mad\s+honey/.test(text)) {
    ctx.add('Other', 10);
    if (scores.Edibles) ctx.demote('Edibles', 8);
  }
}

export default fallbackBoostsRule;
