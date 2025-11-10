import type { CatContext } from '../types';
import { TAXONOMY } from '../baseTaxonomy';

export function baseKeywordsRule(ctx: CatContext) {
  const t = ctx.base;
  // Parent keywords scoring
  for (const [parent, spec] of Object.entries(TAXONOMY)) {
    if (!spec.keywords || parent === 'Tips') continue; // ignore Tips as primary
    for (const kw of spec.keywords) {
      if (!kw) continue;
      const token = String(kw).trim().toLowerCase();
      if (!token) continue;
      const re = new RegExp(`\\b${ctx.escapeRegExp(token)}\\b`);
      if (re.test(t)) ctx.add(parent, 2);
    }
  }
  // Child keyword scoring + subcategories
  for (const [parent, spec] of Object.entries(TAXONOMY)) {
    const children = spec.children || {};
    for (const [sub, kws] of Object.entries(children)) {
      for (const kw of kws) {
        if (!kw) continue;
        const token = String(kw).trim().toLowerCase();
        if (!token) continue;
        const re = new RegExp(`\\b${ctx.escapeRegExp(token)}\\b`);
        if (re.test(t)) { ctx.add(parent, 3); ctx.sub(parent, sub); }
      }
    }
  }
  // Tips can never be primary
  delete ctx.scores.Tips;
}
