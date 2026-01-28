import type { CatContext } from '../types';

// Parity port of 90-precedenceResolution.js

export const PRECEDENCE = [
  'Flower','Hash','PreRolls','Edibles','Concentrates','Vapes','Tincture','Psychedelics','Other'
];

export function precedenceResolutionRule(ctx: CatContext) {
  const { scores, subsByCat, text, TAXONOMY } = ctx;
  const cats = Object.keys(scores || {});
  const precIndex = (cat: string) => PRECEDENCE.indexOf(cat);
  let primary: string | null = null;
  let best = -Infinity;
  for (const cat of cats) {
    const sc = scores[cat];
    if (sc > best || (sc === best && precIndex(cat) < precIndex(primary || 'Other'))) {
      best = sc; primary = cat;
    }
  }
  const hasPositive = cats.some(c => (scores[c] || 0) > 0);
  const otherKeywords = (TAXONOMY.Other && TAXONOMY.Other.keywords) || [];
  const matchedOther = otherKeywords.some(kw => kw && text.includes(String(kw).toLowerCase())) || (subsByCat.Other && subsByCat.Other.size > 0);
  if (!hasPositive || !primary) {
    ctx.result = { primary: 'Other', subcategories: [] };
    return;
  }
  if (primary === 'Other' && !matchedOther) {
    let next: string | null = null; let nextBest = -Infinity;
    for (const cat of cats) {
      if (cat === 'Other') continue;
      const sc = scores[cat];
      if (sc > nextBest || (sc === nextBest && precIndex(cat) < precIndex(next || 'Other'))) {
        nextBest = sc; next = cat;
      }
    }
    if (next && nextBest > 0) {
      const subs = Array.from(subsByCat[next] || []);
      ctx.result = { primary: next, subcategories: subs };
      return;
    }
    ctx.result = { primary: 'Other', subcategories: [] };
    return;
  }
  const subs = Array.from(subsByCat[primary] || []);
  ctx.result = { primary, subcategories: subs };
}

export default precedenceResolutionRule;
