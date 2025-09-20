// Phase 2 Step 7: Vape overrides extracted.
// Encapsulates vape delivery hardware detection, category boosting, demotions, subcategory tagging,
// and the special cryo cured diamonds override.
// Inputs: { text, scores, subsByCat }

function vapeOverridesRule(ctx) {
  const { text, scores, subsByCat } = ctx;
  // Ignore prohibition / disclaimer phrases ("do not vape", "not for vaping") so they don't trigger vape hardware boosts
  // We remove these phrases before hardware token detection; if other hardware tokens remain, classification proceeds.
  const disclaimerPattern = /(do not (?:smoke|vape)(?: or (?:smoke|vape))?|not for (?:vaping|smoking)(?: or (?:vaping|smoking))?)/g;
  const sanitized = text.replace(disclaimerPattern, ' ');

  const vapeDeliveryRegex = /(\b(vape|vapes|cart|carts|cartridge|cartridges|disposable|disposables|ccell|kera|vision box|510\s*thread|510\b|preheat|voltage|extract vape cart|vape cart|pen|pens|pod|pods|device)\b)/;
  if (vapeDeliveryRegex.test(sanitized)) {
    scores.Vapes = (scores.Vapes || 0) + 6;
    const hasCartToken = /(cart|carts|cartridge|cartridges|510)/.test(sanitized);
    const hasResinOrDist = /(live resin|distillate|distilate|delta 9|delta-9|delta9|d9)/.test(sanitized);
    if (hasCartToken && hasResinOrDist) {
      scores.Vapes += 4;
      if (scores.Flower) { scores.Flower -= 2; if (scores.Flower <= 0) delete scores.Flower; }
      if (scores.Concentrates) { scores.Concentrates -= 2; if (scores.Concentrates <= 0) delete scores.Concentrates; }
    }
    const strongDabTokens = /(dab|dabbing|shatter|rosin|bho|slab)/.test(sanitized);
    if (scores.Concentrates && !strongDabTokens) {
      scores.Concentrates -= 4; if (scores.Concentrates <= 0) delete scores.Concentrates;
    }
    const cartLike = /(cart|carts|cartridge|cartridges|510)/.test(sanitized);
    const disposableLike = /disposable|disposables/.test(sanitized);
    if (cartLike) (subsByCat.Vapes ||= new Set()).add('Cartridge');
    if (disposableLike) (subsByCat.Vapes ||= new Set()).add('Disposable');
    if (/live resin/.test(sanitized)) (subsByCat.Vapes ||= new Set()).add('LiveResin');
    if (/distillate|distilate|delta 9|delta-9|delta9|d9/.test(sanitized)) (subsByCat.Vapes ||= new Set()).add('Distillate');

    // Potency mg pattern & multiple vape tokens -> stronger vape dominance
    const mgPotency = /\b\d{3,4}\s?mg\b/.test(sanitized);
    const vapeTokenMatches = (sanitized.match(/vape|cart|carts|cartridge|cartridges|disposable|disposables|ccell|pen|pens|pod|pods|device/gi) || []).length;
    if (mgPotency && vapeTokenMatches >= 2) {
      scores.Vapes += 6; // assert dominance
      if (scores.Flower) { scores.Flower -= 4; if (scores.Flower <= 0) delete scores.Flower; }
      if (scores.Concentrates) { scores.Concentrates -= 2; if (scores.Concentrates <= 0) delete scores.Concentrates; }
      // Additional dominance: many strain tokens inside a vape context
      const strainNameMatches = (sanitized.match(/haze|kush|zkittlez|sherb|sherbet|sherbert|runtz|cookies|gelato|glue|punch|sherb/gi) || []).length;
      if (strainNameMatches >= 2) {
        scores.Vapes += 4;
        if (scores.Flower) { scores.Flower -= 4; if (scores.Flower <= 0) delete scores.Flower; }
      }
    }
  }
  // Special cryo cured diamonds -> treat as Vapes (legacy user directive)
  if (/cryo\s+cured\s+diamonds/.test(text)) {
    scores.Vapes = (scores.Vapes || 0) + 4;
    if (scores.Concentrates) { scores.Concentrates -= 3; if (scores.Concentrates <= 0) delete scores.Concentrates; }
  }
}

module.exports = { vapeOverridesRule };
