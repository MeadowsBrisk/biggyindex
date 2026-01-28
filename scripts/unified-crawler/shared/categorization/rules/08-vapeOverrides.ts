import type { CatContext } from '../types';

// Parity port of 08-vapeOverrides.js

export function vapeOverridesRule(ctx: CatContext) {
  const { text, scores, subsByCat, name } = ctx;
  
  // Check if "vape" appears in a "usage" context (what the product can be used for)
  // e.g., "perfect for blunts, edibles, concentrates, dry vape"
  const usageContextPattern = /(perfect|great|ideal|good)\s+for\s+[^.]*\bvape/i;
  const isUsageContext = usageContextPattern.test(text);
  
  const disclaimerPattern = /(do not (?:smoke|vape)(?: or (?:smoke|vape))?|not for (?:vaping|smoking)(?: or (?:vaping|smoking))?)/g;
  const sanitized = text.replace(disclaimerPattern, ' ');
  const vapeDeliveryRegex = /(\b(vape|vapes|cart|carts|cartridge|cartridges|disposable|disposables|ccell|kera|vision box|510\s*thread|510\b|preheat|voltage|extract vape cart|vape cart|pen|pens|pod|pods|device|battery|batteries|buttonless|hands?-?free|palm pro|pure one)\b)/;
  if (vapeDeliveryRegex.test(sanitized) && !isUsageContext) {
    ctx.add('Vapes', 6);
    const hasCartToken = /(cart|carts|cartridge|cartridges|510)/.test(sanitized);
    const hasResinOrDist = /(live resin|distillate|distilate|delta 9|delta-9|delta9|d9|htfse|liquid\s+diamonds?)/.test(sanitized);
    if (hasCartToken && hasResinOrDist) {
      ctx.add('Vapes', 4);
      if (scores.Flower) ctx.demote('Flower', 2);
      if (scores.Concentrates) ctx.demote('Concentrates', 2);
    }
    const strongDabTokens = /(dab|dabbing|shatter|rosin|bho|slab)/.test(sanitized);
    if (scores.Concentrates && !strongDabTokens) ctx.demote('Concentrates', 4);
    const cartLike = /(cart|carts|cartridge|cartridges|510)/.test(sanitized);
    const disposableLike = /disposable|disposables/.test(sanitized);
    const batteryOnly = /\b(buttonless|battery|batteries|hands?-?free|palm pro|pure one)\b/.test(sanitized);
    if (cartLike) (subsByCat.Vapes ||= new Set()).add('Cartridge');
    if (disposableLike) (subsByCat.Vapes ||= new Set()).add('Disposable');
    if (batteryOnly) (subsByCat.Vapes ||= new Set()).add('Battery');
    if (/live resin|htfse/.test(sanitized)) (subsByCat.Vapes ||= new Set()).add('LiveResin');
    if (/distillate|distilate|delta 9|delta-9|delta9|d9/.test(sanitized)) (subsByCat.Vapes ||= new Set()).add('Distillate');
    const mgPotency = /\b\d{3,4}\s?mg\b/.test(sanitized);
    const vapeTokenMatches = (sanitized.match(/vape|cart|carts|cartridge|cartridges|disposable|disposables|ccell|pen|pens|pod|pods|device|battery|buttonless|hands?-?free|palm pro|pure one/gi) || []).length;
    if (mgPotency && vapeTokenMatches >= 2) {
      ctx.add('Vapes', 6);
      if (scores.Flower) ctx.demote('Flower', 4);
      if (scores.Concentrates) ctx.demote('Concentrates', 2);
      const strainNameMatches = (sanitized.match(/haze|kush|zkittlez|sherb|sherbet|sherbert|runtz|cookies|gelato|glue|punch|sherb/gi) || []).length;
      if (strainNameMatches >= 2) {
        ctx.add('Vapes', 4);
        if (scores.Flower) ctx.demote('Flower', 4);
      }
    }
  }
  {
    const combined = name ? (name + ' ' + text) : text;
    const multiCartPattern = /(\b\d{1,3}\s?x\s?(0?\.5|0?\.50|1|2|3)(?:\s?ml|\s?g)?\b)|(\b(0?\.5|1)\s?ml\s?(?:cartridges?|carts?)\b)/i;
    const flavourOrStrainTokens = /(gelato|zkitt?les?|kush|mimosa|grape|cake|nerdz|sherb|sherbet|runtz|ape|limeade|lime|haze|og\b|diesel|gorilla|cookie|cookies)/i;
    const cartridgesStock = /cartridges?\s+in\s+stock/i;
    const listStyle = /(\*\*\*|\u2022|\n|—|-\s|●)/;
    if (multiCartPattern.test(combined) && (flavourOrStrainTokens.test(text) || cartridgesStock.test(text))) {
      ctx.add('Vapes', 10);
      const strainMatches = (text.match(/gelato|zkitt?les?|kush|mimosa|grape|cake|nerdz|sherb|sherbet|runtz|ape|limeade|lime|haze|diesel|cookie|cookies/gi) || []).length;
      if (strainMatches >= 4) ctx.add('Vapes', 6); else if (strainMatches >= 2) ctx.add('Vapes', 3);
      if (scores.Flower) ctx.demote('Flower', 8 + Math.min(4, strainMatches));
      if (scores.Concentrates) ctx.demote('Concentrates', 5);
      (subsByCat.Vapes ||= new Set()).add('Cartridge');
      if (listStyle.test(text)) {
        ctx.add('Vapes', 2);
        if (scores.Flower) ctx.demote('Flower', 2);
      }
    }
  }
  if (/(htfse|liquid\s+diamonds?)/.test(text)) {
    const smallMl = /\b(0\.5|1|2|2\.0|2\.2|2\.5|3)\s?ml\b|\bml\b/.test(text);
    ctx.add('Vapes', smallMl ? 9 : 7);
    (subsByCat.Vapes ||= new Set()).add('LiveResin');
    if (scores.Flower) ctx.demote('Flower', smallMl ? 7 : 5);
    if (scores.Concentrates) ctx.demote('Concentrates', smallMl ? 6 : 3);
  }
  if (/cryo\s+cured\s+diamonds/.test(text)) {
    ctx.add('Vapes', 4);
    if (scores.Concentrates) ctx.demote('Concentrates', 3);
  }
}

export default vapeOverridesRule;
