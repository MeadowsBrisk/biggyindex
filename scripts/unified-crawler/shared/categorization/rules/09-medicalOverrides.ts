import type { CatContext } from '../types';

// Parity port of 09-medicalOverrides.js

export function medicalEarlyRule(ctx: CatContext) {
  const { text, scores } = ctx;
  if (scores.Other && scores.Flower) {
    const hasAntibiotic = /\bantibiotic|doxycycline\b/.test(text);
    if (hasAntibiotic) {
      const strongFlower = /(bud|buds|flower|kush|haze|diesel|nug|indica|sativa|hybrid|zkittlez| og |marijuana)/.test(text);
      const onlyStrainWord = /\bstrain(s)?\b/.test(text) && !strongFlower;
      if (onlyStrainWord) delete scores.Flower;
    }
  }
}

export function antibioticLineageRule(ctx: CatContext) {
  const { text, scores, subsByCat } = ctx;
  if (/\bdoxycycline\b|\bantibiotic\b|\burinary\b|\binfections?\b|\bgastrointenstinal\b|\bcigarettes\b|\bgastrointestinal\b/.test(text)) {
    ctx.add('Other', 6);
    if (scores.Edibles) ctx.demote('Edibles', 8);
  }
  if (/(tadalafil|sildenafil|vardenafil|avanafil|dapoxetine|levitra|cialis|viagra|erectile\s+dysfunction)/.test(text)) {
    ctx.add('Other', 14);
    if (scores.Edibles) ctx.demote('Edibles', 12);
    if (scores.Flower) ctx.demote('Flower', 6);
    if (scores.Hash) ctx.demote('Hash', 12);
    if (scores.Concentrates) ctx.demote('Concentrates', 6);
    if (scores.Vapes) ctx.demote('Vapes', 6);
    (subsByCat.Other ||= new Set()).add('Pharmaceutical');
  }
  if (/(modafinil|modvigil)\b/.test(text)) {
    ctx.add('Other', 10);
    if (scores.Edibles) ctx.demote('Edibles', 8);
    if (scores.Flower) ctx.demote('Flower', 2);
  }
  // Pharmaceutical / prescription drugs (SSRIs, GLP-1 agonists, weight-loss injectables)
  if (/(citalopram|sertraline|fluoxetine|paroxetine|escitalopram|tirzepatide|mounjaro|zepbound|semaglutide|ozempic|wegovy|saxenda|liraglutide)/.test(text)) {
    ctx.add('Other', 14);
    if (scores.Edibles) ctx.demote('Edibles', 12);
    if (scores.Vapes) ctx.demote('Vapes', 12);
    if (scores.Flower) ctx.demote('Flower', 6);
    if (scores.Concentrates) ctx.demote('Concentrates', 6);
    (subsByCat.Other ||= new Set()).add('Pharmaceutical');
  }
  const lineage = /(\(|\b)(?:[^)]{0,40})\bx\s+[^)]{2,40}\)|\bbx[0-9]\b|\bf[0-9]\b|\blineage\b|\bgenetics\b/;
  const trueIngestion = /(gummy|gummies|chocolate|brownie|cereal bar|nerd rope|capsule|capsules|tablet|tablets|wonky bar|infused|delight)/;
  if (lineage.test(text) && !trueIngestion.test(text)) {
    ctx.add('Flower', 4);
    if (scores.Edibles) ctx.demote('Edibles', 5);
  }
}

export default { medicalEarlyRule, antibioticLineageRule };
