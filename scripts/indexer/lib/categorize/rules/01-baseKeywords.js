// Phase 2 Step 1: Extracted base + child keyword scoring rule (no behaviour change)
// Mirrors original scoring logic in index-items.js (parent + child keyword loops)

function baseKeywordsRule(ctx) {
  const { TAXONOMY, base, scores, subsByCat, escapeRegExp } = ctx;
  for (const [cat, def] of Object.entries(TAXONOMY)) {
    if (cat === 'Tips') continue; // never choose Tips as primary
    let score = 0;
    // parent keyword matches (word-boundary aware)
    for (const kw of def.keywords || []) {
      if (!kw) continue;
      const token = String(kw).trim().toLowerCase();
      if (!token) continue;
      const re = new RegExp(`\\b${escapeRegExp(token)}\\b`);
      if (re.test(base)) score += 2; // identical weight
    }
    subsByCat[cat] = subsByCat[cat] || new Set();
    for (const [child, kws] of Object.entries(def.children || {})) {
      for (const kw of kws || []) {
        if (!kw) continue;
        const token = String(kw).trim().toLowerCase();
        if (!token) continue;
        const re = new RegExp(`\\b${escapeRegExp(token)}\\b`);
        if (re.test(base)) {
          score += 3; // identical child weight
          subsByCat[cat].add(child);
        }
      }
    }
    if (score > 0) scores[cat] = score;
  }
}

module.exports = { baseKeywordsRule };

