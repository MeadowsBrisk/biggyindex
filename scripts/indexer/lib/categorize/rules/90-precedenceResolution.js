// Phase 2 Step 9: Final precedence resolution & 'Other' guard extracted.
// Replicates original tie-breaking: choose highest score; on tie, use precedence ordering.
// If no category scored, returns null primary. If 'Other' chosen but no explicit keyword matched, null primary.

const PRECEDENCE = [
  'Flower', 'Hash', 'Edibles', 'Concentrates', 'Vapes', 'Tincture', 'Psychedelics', 'Other'
];

function precedenceResolutionRule(ctx) {
  const { scores, subsByCat, text, TAXONOMY } = ctx;
  const cats = Object.keys(scores || {});
  const precIndex = (cat) => PRECEDENCE.indexOf(cat);
  let primary = null;
  let best = -Infinity;
  for (const cat of cats) {
    const sc = scores[cat];
    if (sc > best || (sc === best && precIndex(cat) < precIndex(primary || 'Other'))) {
      best = sc; primary = cat;
    }
  }
  const hasPositive = cats.some((c) => (scores[c] || 0) > 0);
  const otherKeywords = (TAXONOMY.Other && TAXONOMY.Other.keywords) || [];
  const matchedOther = otherKeywords.some(kw => kw && text.includes(String(kw).toLowerCase()));

  // Catch-all fallback: if nothing scored positively, classify as Other
  if (!hasPositive || !primary) {
    ctx.result = { primary: 'Other', subcategories: [] };
    return;
  }

  // If Other would win but no explicit Other keyword matched, choose next-best non-Other when available
  if (primary === 'Other' && !matchedOther) {
    let next = null;
    let nextBest = -Infinity;
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
    // Otherwise, fallback to Other
    ctx.result = { primary: 'Other', subcategories: [] };
    return;
  }

  // Normal path: return chosen primary with its subcategories
  const subs = Array.from(subsByCat[primary] || []);
  ctx.result = { primary, subcategories: subs };
}

module.exports = { precedenceResolutionRule, PRECEDENCE };
