import type { CatContext } from '../types';

// Parity port of 06-hashOverrides.js

export function hashEarlyOverridesRule(ctx: CatContext) {
  const { text, scores } = ctx;
  if (/landed\s+some\s+(?:sunset\s+)?sherb(?:ert|et)?\b/.test(text)) {
    ctx.add('Hash', 4);
    if (scores.Flower) ctx.demote('Flower', 3);
  }
  if (/hash concentrate/.test(text)) {
    ctx.add('Hash', 5);
    if (scores.Edibles) ctx.demote('Edibles', 3);
    ctx.add('Concentrates', 2);
  }
  if (/simpson\s+kush/.test(text)) {
    ctx.add('Hash', 8);
    if (scores.Flower) ctx.demote('Flower', 6);
  }
  if (/\bhash\b/.test(text)) {
    if (/decarb/.test(text)) ctx.add('Hash', 4);
    const ingestionForms = /(gummy|gummies|chocolate|brownie|cereal bar|nerd rope|rope|capsule|capsules|wonky bar|delight|honey|nutella)/;
    const candyish = /(candy|cubes|cube|sweet|sweets)/;
    if (!ingestionForms.test(text) && candyish.test(text) && scores.Edibles) {
      ctx.demote('Edibles', 6);
      ctx.add('Hash', 2);
    }
  }
  if (/\bdry\s?tek\b|\bdry\s?tech\b/.test(text)) {
    ctx.add('Hash', 6);
    if (scores.Concentrates) ctx.demote('Concentrates', 4);
  }
}

export function templeBallsRule(ctx: CatContext) {
  const { text, scores } = ctx;
  if (/temple\s+ball|temple\s+balls/.test(text)) {
    ctx.add('Hash', 6);
    if (scores.Concentrates) ctx.demote('Concentrates', 5);
  }
}

export function hashPrecedenceRule(ctx: CatContext) {
  const { text, scores, name, subsByCat } = ctx;
  const nameLower = (name || '').toLowerCase();
  const textHasFullMelt = /\bfull\s*-?\s*melt\b/.test(text);
  if (textHasFullMelt) {
    ctx.add('Hash', 7);
    if (scores.Flower) ctx.demote('Flower', 6);
  }
  const gooInName = /\bgoo\b/.test(nameLower);
  const gooInText = /\bgoo\b/.test(text);
  const edibleContext = /(gummy|gummies|chocolate|candy|edible|cake|cookie|brownie|chew|chews|sweet|sweets|drink|syrup|capsule|capsules|tablet|tablets)/;
  if ((gooInName || gooInText) && !edibleContext.test(text)) {
    ctx.add('Hash', 6);
    if (scores.Flower) ctx.demote('Flower', 4);
  }
  if (/diamond\s+infused\s+flower|infused\s+flower.*diamond|diamond\s+flower/.test(text)) {
    ctx.add('Hash', 6);
    if (scores.Flower) ctx.demote('Flower', 6);
    (subsByCat.Hash ||= new Set()).add('Moonrocks');
  }
  if (scores.Hash && scores.Flower) {
    const hashSignals = /(\bhash\b|hashish|dry sift|dry-sift|drysift|dry filtered|dry-filtered|static sift|static hash|piatella|kief|pollen|moonrock|moon rock|temple ball|temple balls|mousse hash|simpson kush|\b120u\b|120\s*(?:micron|microns|µ|μ)|\bfull\s*-?\s*melt\b|\bgoo\b)/;
    if (hashSignals.test(text)) {
      ctx.add('Hash', 5);
      ctx.demote('Flower', 5);
    }
    if (/\bhash\b/.test(nameLower)) {
      ctx.add('Hash', 4);
      if (scores.Flower) ctx.demote('Flower', 2);
    }
  }
  if (/^\s*[a-z][a-z\s]+$/.test(nameLower) && /sherb|sherbet|sherbert/.test(nameLower) && !/gummy|vape|cart|bar|chocolate|capsule|tablet/.test(text)) {
    ctx.add('Hash', 2);
  }
  if (/\btruffle(s)?\b/.test(text) && scores.Hash) {
    const strongHashContext = /(\bhash\b|hashish|dry sift|dry-sift|dry filtered|dry-filtered|static sift|static hash|piatella|kief|pollen|moonrock|moon rock|temple ball|temple balls|mousse hash|simpson kush|\b120u\b|120\s*(?:micron|microns|µ|μ)|\bfull\s*-?\s*melt\b|\bgoo\b)/;
    const flowerSignals = /(\bflower\b|\bbud\b|\bbuds\b|\bstrain\b|\bstrains\b|indica|sativa|hybrid|terp|terps|flavour|flavor|smoke|nug|nugs)/;
    if (!strongHashContext.test(text) && flowerSignals.test(text)) {
      ctx.demote('Hash', 6);
      ctx.add('Flower', 5);
    }
  }
}

export default { hashEarlyOverridesRule, templeBallsRule, hashPrecedenceRule };
