import type { CatContext } from '../types';

// Parity port of 12-otherParaphernalia.js

export function otherParaphernaliaRule(ctx: CatContext) {
  const { name, scores, subsByCat } = ctx;
  const title = (name || '').toLowerCase();
  if (/\bbongs?\b/.test(title)) {
    ctx.add('Other', 12);
    if (scores.Flower) ctx.demote('Flower', 8);
    if (scores.Concentrates) ctx.demote('Concentrates', 8);
    if (scores.Vapes) ctx.demote('Vapes', 6);
    (subsByCat.Other ||= new Set()).add('Bongs');
  }
}

export default otherParaphernaliaRule;
