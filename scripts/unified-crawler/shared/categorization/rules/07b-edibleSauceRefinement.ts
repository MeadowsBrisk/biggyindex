import type { CatContext } from '../types';

// Parity port of 07b-edibleSauceRefinement.js

export function edibleSauceRefinementRule(ctx: CatContext) {
  const { name, text, scores } = ctx;
  const lowerName = (name || '').toLowerCase();
  const strongConcentrateSignals = /(terp|terpene|live resin|rosin|shatter|wax|crumble|badder|batter|diamonds|thca|thc-a|distillate|distilate|rso)/;
  if (/\bedibles\b/.test(lowerName)) {
    ctx.add('Edibles', 8);
    if (scores.Concentrates && !strongConcentrateSignals.test(text)) ctx.demote('Concentrates', 5);
  }
  if (!/\bsauce\b/.test(text)) return;
  const hasTerpSauceContext = /(terp|terpene|live resin)/.test(text);
  if (hasTerpSauceContext) return;
  const confectionTokens = /(choc|chocolate|bar|cookie|cookies|honeycomb|caramel|smarties|pieces|piece|oompa|loompa|wonky|wonka|candy|sweet|gourmet)/;
  const wonkyContext = /(wonky|oompa|loompa|oompa\s+loompa|wonka)/.test(text);
  const mgPotency = /\b\d{2,4}\s?mg\b/.test(text);
  const looksConfectionSauce = confectionTokens.test(text) && (wonkyContext || mgPotency);
  if (looksConfectionSauce) {
    ctx.add('Edibles', 7);
    if (scores.Concentrates && !strongConcentrateSignals.test(text)) ctx.demote('Concentrates', 6);
  }
}

export default edibleSauceRefinementRule;
