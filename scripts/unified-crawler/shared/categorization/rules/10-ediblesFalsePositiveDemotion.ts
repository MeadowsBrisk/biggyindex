import type { CatContext } from '../types';

// Parity port of 10-ediblesFalsePositiveDemotion.js

export function ediblesFalsePositiveDemotionRule(ctx: CatContext) {
  const { text, scores, subsByCat } = ctx;
  const trueEdibleForms = /(gummy|gummies|gummie|gummies? bears?|mints?|mint|chew|chews|choco|chocolate|brownie|capsule|capsules|tablet|tablets|cannabutter|canna butter|coconut oil|cannabis oil|cereal bar|nerd rope|rope|ropes|bar\b|bars\b|wonky bar|infused|delight|cone|cones|chocolate cone|chocolate cones|candy drops|drops)/;
  const genericSweet = /(sweet|candy)/;
  const strongFlowerContext = /(\bstrain\b|\bstrains\b|\bhybrid\b|indica|sativa|\bcali\b|exotic|exotics|\bflower\b|bud|buds)/;
  const addonOnly = /(add-?on|add on)\s+\d{2,4}\s?mg\s+edibles?/.test(text);
  if (scores.Edibles && !trueEdibleForms.test(text) && genericSweet.test(text) && strongFlowerContext.test(text) && !addonOnly) {
    ctx.demote('Edibles', 6);
    ctx.add('Flower', 3);
  }
  if (addonOnly && scores.Edibles) {
    ctx.demote('Edibles', 8);
    ctx.add('Flower', 4);
  }
  const edibleFormPresent = /(gumm?y|gumm?ies|gummy bears?|mints?|mint|chocolate|brownie|candy|cones?)/.test(text);
  const potencyOrServing = /(\b\d{2,4}\s?mg\b|\bservings?\b|\bpack of\b|\b\d+\s?x\b)/.test(text);
  if (edibleFormPresent && potencyOrServing && !addonOnly) {
    ctx.add('Edibles', 6);
    if (scores.Flower) ctx.demote('Flower', 4);
  }
  if (/(chocolate\s+cone(s)?|cone\s+edibles|baked\s+cones)/.test(text)) {
    ctx.add('Edibles', 8);
    if (scores.Flower) ctx.demote('Flower', 6);
    // PreRolls is now a primary category - demote it for edible cones
    if (scores.PreRolls) ctx.demote('PreRolls', 8);
  }
  const hasMints = /\bmints?\b/.test(text);
  const isKushMints = /\bkush\s+mints?\b/.test(text);
  const petraOrInfused = /(petra|cannabis[- ]?infused)/.test(text);
  const thcWithMg = /\bthc\b/.test(text) && /\b\d{2,4}\s?mg\b/.test(text);
  const mintsEdible = hasMints && !isKushMints && (petraOrInfused || thcWithMg);
  if (mintsEdible) {
    ctx.add('Edibles', 12);
    if (scores.Flower) ctx.demote('Flower', 8);
    if (scores.Other) ctx.demote('Other', 10);
    if (scores.Hash) ctx.demote('Hash', 8);
  }
  if (/cannabis\s+(nutella|honey|coconut oil)|canna\s+(nutella|honey)/.test(text)) {
    ctx.add('Edibles', 9);
    if (scores.Flower) ctx.demote('Flower', 7);
  }
  if (/cannabis\s+coconut oil/.test(text)) {
    ctx.add('Edibles', 14);
    if (scores.Flower) ctx.demote('Flower', 11);
  }
}

export default ediblesFalsePositiveDemotionRule;
