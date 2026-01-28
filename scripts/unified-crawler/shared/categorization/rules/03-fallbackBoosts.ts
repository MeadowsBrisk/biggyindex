import type { CatContext } from '../types';

// Parity port of legacy 03-fallbackBoosts.js
// Generic boosts for hash/flower/edible/vape; mushroom & LSD psychedelic boosts;
// edible spread/oil special; mad honey override to Other.
// Also handles "usage context" patterns where category keywords appear describing 
// what the product can be used for (e.g., "perfect for edibles, concentrates")

export function fallbackBoostsRule(ctx: CatContext) {
  const { text, name, scores, subsByCat } = ctx;
  
  // Check for "usage context" pattern: "perfect for X, Y, Z" where X/Y/Z are categories
  // If the NAME has strong Flower signals (shake/trim/bud) but description mentions
  // other categories in a usage context, demote those categories
  const nameLower = (name || '').toLowerCase();
  const nameHasFlowerProduct = /(shake|trim|bud|buds|dust|popcorn|small\s+bud)/i.test(nameLower);
  const usageContextPattern = /(perfect|great|ideal|good)\s+for\s+[^.]{0,80}(blunts?|edibles?|concentrates?|vapes?|joints?|rolling|smoking)/i;
  const hasUsageContext = usageContextPattern.test(text);
  
  if (nameHasFlowerProduct && hasUsageContext) {
    // This is loose flower described by what it can be used for - boost Flower, demote others
    ctx.add('Flower', 5);
    if (scores.Concentrates) ctx.demote('Concentrates', 6);
    if (scores.Edibles) ctx.demote('Edibles', 4);
    if (scores.Vapes) ctx.demote('Vapes', 4);
  }
  
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
