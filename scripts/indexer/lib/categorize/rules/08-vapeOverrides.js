// Phase 2 Step 7: Vape overrides extracted.
// Encapsulates vape delivery hardware detection, category boosting, demotions, subcategory tagging,
// and the special cryo cured diamonds override.
// Inputs: { text, scores, subsByCat }

function vapeOverridesRule(ctx) {
  const { text, scores, subsByCat, name } = ctx;
  // Ignore prohibition / disclaimer phrases ("do not vape", "not for vaping") so they don't trigger vape hardware boosts
  // We remove these phrases before hardware token detection; if other hardware tokens remain, classification proceeds.
  const disclaimerPattern = /(do not (?:smoke|vape)(?: or (?:smoke|vape))?|not for (?:vaping|smoking)(?: or (?:vaping|smoking))?)/g;
  const sanitized = text.replace(disclaimerPattern, ' ');

  const vapeDeliveryRegex = /(\b(vape|vapes|cart|carts|cartridge|cartridges|disposable|disposables|ccell|kera|vision box|510\s*thread|510\b|preheat|voltage|extract vape cart|vape cart|pen|pens|pod|pods|device|battery|batteries|buttonless|hands?-?free|palm pro|pure one)\b)/;
  if (vapeDeliveryRegex.test(sanitized)) {
    scores.Vapes = (scores.Vapes || 0) + 6;
  const hasCartToken = /(cart|carts|cartridge|cartridges|510)/.test(sanitized);
  const hasResinOrDist = /(live resin|distillate|distilate|delta 9|delta-9|delta9|d9|htfse|liquid\s+diamonds?)/.test(sanitized);
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
  const batteryOnly = /\b(buttonless|battery|batteries|hands?-?free|palm pro|pure one)\b/.test(sanitized);
    if (cartLike) (subsByCat.Vapes ||= new Set()).add('Cartridge');
    if (disposableLike) (subsByCat.Vapes ||= new Set()).add('Disposable');
  if (batteryOnly) (subsByCat.Vapes ||= new Set()).add('Battery');
  if (/live resin|htfse/.test(sanitized)) (subsByCat.Vapes ||= new Set()).add('LiveResin');
    if (/distillate|distilate|delta 9|delta-9|delta9|d9/.test(sanitized)) (subsByCat.Vapes ||= new Set()).add('Distillate');

    // Potency mg pattern & multiple vape tokens -> stronger vape dominance
    const mgPotency = /\b\d{3,4}\s?mg\b/.test(sanitized);
  const vapeTokenMatches = (sanitized.match(/vape|cart|carts|cartridge|cartridges|disposable|disposables|ccell|pen|pens|pod|pods|device|battery|buttonless|hands?-?free|palm pro|pure one/gi) || []).length;
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
  // Quantity x0.5ml or x1ml style multi-cart listings: treat as Vapes if 'cartridge' context implied via ml units plus strain list or explicit flavours list.
  {
    const combined = name ? (name + ' ' + text) : text;
    const multiCartPattern = /(\b\d{1,3}\s?x\s?(0?\.5|0?\.50|1|2|3)(?:\s?ml|\s?g)?\b)|(\b(0?\.5|1)\s?ml\s?(?:cartridges?|carts?)\b)/i;
    const flavourOrStrainTokens = /(gelato|zkitt?les?|kush|mimosa|grape|cake|nerdz|sherb|sherbet|runtz|ape|limeade|lime|haze|og\b|diesel|gorilla|cookie|cookies)/i;
    const cartridgesStock = /cartridges?\s+in\s+stock/i;
    const listStyle = /(\*\*\*|\u2022|\n|—|-\s|●)/;
    if (multiCartPattern.test(combined) && (flavourOrStrainTokens.test(text) || cartridgesStock.test(text))) {
      // Base boost (additive)
      scores.Vapes = (scores.Vapes || 0) + 10;
      // Additional dominance proportional to flavour strain variety count
      const strainMatches = (text.match(/gelato|zkitt?les?|kush|mimosa|grape|cake|nerdz|sherb|sherbet|runtz|ape|limeade|lime|haze|diesel|cookie|cookies/gi) || []).length;
      if (strainMatches >= 4) scores.Vapes += 6; else if (strainMatches >= 2) scores.Vapes += 3;
      if (scores.Flower) { scores.Flower -= (8 + Math.min(4, strainMatches)); if (scores.Flower <= 0) delete scores.Flower; }
      if (scores.Concentrates) { scores.Concentrates -= 5; if (scores.Concentrates <= 0) delete scores.Concentrates; }
      (subsByCat.Vapes ||= new Set()).add('Cartridge');
      if (listStyle.test(text)) {
        scores.Vapes += 2;
        if (scores.Flower) { scores.Flower -= 2; if (scores.Flower <= 0) delete scores.Flower; }
      }
    }
  }
  // Fallback: HTFSE or Liquid Diamonds context alone often implies vape content
  if (/(htfse|liquid\s+diamonds?)/.test(text)) {
    const smallMl = /\b(0\.5|1|2|2\.0|2\.2|2\.5|3)\s?ml\b|\bml\b/.test(text);
    scores.Vapes = (scores.Vapes || 0) + (smallMl ? 9 : 7);
    (subsByCat.Vapes ||= new Set()).add('LiveResin');
    if (scores.Flower) { scores.Flower -= (smallMl ? 7 : 5); if (scores.Flower <= 0) delete scores.Flower; }
    if (scores.Concentrates) { scores.Concentrates -= (smallMl ? 6 : 3); if (scores.Concentrates <= 0) delete scores.Concentrates; }
  }
  // Special cryo cured diamonds -> treat as Vapes (legacy user directive)
  if (/cryo\s+cured\s+diamonds/.test(text)) {
    scores.Vapes = (scores.Vapes || 0) + 4;
    if (scores.Concentrates) { scores.Concentrates -= 3; if (scores.Concentrates <= 0) delete scores.Concentrates; }
  }
}

module.exports = { vapeOverridesRule };
