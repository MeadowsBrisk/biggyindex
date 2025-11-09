import type { CatContext } from '../types';

// Parity port of 07-concentrateOverrides.js

export function concentrateEarlyOverridesRule(ctx: CatContext) {
  const { text, scores } = ctx;
  if (!(scores.Concentrates && scores.Flower)) return;
  const hasCrumble = /\bcrumble\b/.test(text);
  if (hasCrumble) {
    const hasOtherConSignals = /(extract|dab|shatter|rosin|wax|sauce|distillate|live resin|bho)/.test(text);
    const hasFlowerSignals = /(flower|bud|buds|budds|nug|nuggs|strain)/.test(text);
    if (!hasOtherConSignals && hasFlowerSignals) {
      ctx.demote('Concentrates', 5);
    }
  }
}

export function concentrateMidOverridesRule(ctx: CatContext) {
  const { text, scores, subsByCat } = ctx;
  if (/(chocolate|bar)/.test(text) && /distillate|distilate|delta 9|delta-9|delta9/.test(text) && /(edible|gummy|gummies|bar|chocolate|piece|pieces)/.test(text)) {
    ctx.add('Edibles', 6);
    if (scores.Concentrates) ctx.demote('Concentrates', 5);
    if (scores.Vapes) ctx.demote('Vapes', 2);
    const mgPotency = /\b\d{2,4}\s?mg\b/.test(text);
    if (mgPotency) {
      ctx.add('Edibles', 4);
      if (scores.Concentrates) ctx.demote('Concentrates', 3);
    }
  }
  if (/(gummie|gummy|gummies)/.test(text) && (/(delta 9|delta-9|delta9|d9|distillate|distilate|rso)/.test(text) || /\b\d{2,4}\s?mg\b/.test(text))) {
    ctx.add('Edibles', 8);
    if (scores.Concentrates) ctx.demote('Concentrates', 7);
  }
  if (/(baked\s+cones|chocolate\s+cone(s)?)/.test(text) && /(\b\d{2,4}\s?mg\b|\bpack(s)?\b|\b\d+\s?x\b)/.test(text)) {
    ctx.add('Edibles', 7);
    if (scores.Flower) ctx.demote('Flower', 5);
  }
  if (/(candy|sweet|sweets|drops|pieces|gummy|gummies|cone|cones)/.test(text) && /(shatter|wax|rosin|crumble|badder|batter|diamonds|distillate|distilate|live resin|rso|thca|thc-a|extract)/.test(text)) {
    ctx.add('Edibles', 7);
    if (scores.Concentrates) ctx.demote('Concentrates', 6);
    const mgPotency2 = /\b\d{2,4}\s?mg\b/.test(text);
    if (mgPotency2) ctx.add('Edibles', 2);
  }
  if (/(tablet|tablets|capsule|capsules|rosintab)/.test(text) && /(rosin|shatter|distillate|distilate|live resin|rso)/.test(text)) {
    ctx.add('Edibles', 8);
    if (scores.Concentrates) ctx.demote('Concentrates', 7);
  }
}

export function concentrateLatePrecedenceRule(ctx: CatContext) {
  const { text, scores, name } = ctx;
  if (/(lem(?:on)?c?h?ill?o|limon?c?h?ell?o)/.test(text) && /(40%\s*alcohol|\b\d{2,4}\s?mg\b)/.test(text)) {
    ctx.add('Other', 12);
    if (scores.Concentrates) ctx.demote('Concentrates', 10);
    if (scores.Edibles) ctx.demote('Edibles', 6);
  }
  if (/\bnug\s*run\b/.test(text)) {
    ctx.add('Concentrates', 6);
    if (scores.Flower) ctx.demote('Flower', 5);
  }
  const hasTinctureWord = /\btincture(s)?\b/.test(text);
  if (hasTinctureWord && /live resin/.test(text)) {
    const otherStrongConc = /(wax|shatter|crumble|badder|batter|rosin|rso|diamonds|distillate|distilate|thca|thc-a|piatella|cold cure|slab|extract)/.test(text);
    if (!otherStrongConc) {
      ctx.add('Tincture', 6);
      if (scores.Concentrates) ctx.demote('Concentrates', 6);
    }
  }
  const nameLower = (name || '').toLowerCase();
  if (/concentrate/.test(nameLower)) {
    const signalMatches = (text.match(/concentrate|wax|rosin|sauce|sugar|diamonds|crumble|badder|batter|thca|thc-a|distillate|live resin|shatter|rso|piatella|cold cure|extract/gi) || []).length;
    const baseBoost = 6;
    const extra = Math.min(8, signalMatches * 2);
    ctx.add('Concentrates', baseBoost + extra);
    if (scores.Flower && (scores.Concentrates || 0) >= (scores.Flower || 0)) ctx.demote('Flower', 4);
  }
  if (/\bsugar\b/.test(nameLower) && !/sugar-?coated/.test(nameLower)) {
    ctx.add('Concentrates', 6);
    if (scores.Flower) ctx.demote('Flower', 4);
  }
  if (/\bcrystalline\b|\bcrystal\b/.test(text)) {
    const coSignals = /(thca|thc-a|diamonds?|extract|concentrate|shatter|rosin|live resin|distillate|rso|sauce|terp sauce|terpene sauce)/;
    if (coSignals.test(text)) {
      ctx.add('Concentrates', 5);
      if (scores.Flower) ctx.demote('Flower', 3);
    }
  }
  if (/(\bcrystalline\b|\bcrystal\b)/.test(nameLower)) {
    ctx.add('Concentrates', 8);
    if (scores.Flower) ctx.demote('Flower', 6);
  }
  if (/(shatter|wax|rosin|badder|batter|crumble|sauce|terp\s*sauce)/.test(nameLower)) {
    ctx.add('Concentrates', 7);
    if (scores.Flower) ctx.demote('Flower', 6);
  }
  if (/\bsugar\b/.test(text) && /(wax|shatter|rosin|sauce|live resin|rso|diamonds|distillate|distilate|thca|thc-a|extract)/.test(text)) {
    ctx.add('Concentrates', 4);
    if (scores.Flower) ctx.demote('Flower', 2);
  }
  if (/thc\s*syrup/.test(text)) {
    const hardwareTokens = /(cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510\b|device)/;
    if (!hardwareTokens.test(text)) {
      ctx.add('Concentrates', 7);
      if (scores.Flower) ctx.demote('Flower', 5);
      if (scores.Vapes) ctx.demote('Vapes', 3);
    }
  }
  if (/(syringe|applicator)\b/.test(text) && /\b1\s?g\b|\b1\.0\s?g\b/.test(text)) {
    ctx.add('Concentrates', 6);
    if (scores.Flower) ctx.demote('Flower', 4);
  }
  if (scores.Concentrates) {
    const sugarLike = /(\bsugar\b|\bcrystal(?:line)?\b)/;
    const hasOnlySugarLike = sugarLike.test(text) && !/(wax|shatter|crumble|badder|batter|rosin|live resin|rso|thca|thc-a|diamonds|distillate|distilate|sauce|terp sauce|terpene sauce|piatella|cold cure|slab|extract)/.test(text);
    const strongFlowerCtx = /(\bflower\b|\bbud|\bbuds|\bstrain\b|\bstrains\b|hybrid|indica|sativa|runtz|sherb|sherbet|zkittlez|diesel|tops|blueberry|cake|frost|frosty|indoor|outdoor|greenhouse|seeds?|shake|trim|pop\s?corn|sugar\s?leaf)/.test(text);
    if (hasOnlySugarLike && strongFlowerCtx) {
      ctx.demote('Concentrates', 6);
      ctx.add('Flower', 4);
    }
  }
  if (scores.Concentrates && scores.Flower) {
    const concSignals = /(rosin|wax|shatter|crumble|badder|batter|sauce|terp sauce|terpene sauce|live resin|rso|diamond|diamonds|crystalline|crystal|thca|thc-a|distillate|distilate|piatella|cold cure|cold-cure|6\*|6 star|6star|six star|wpff|slab|extract|concentrate|concentrates|resale pots|static sift|sugar)/;
    const hasTincture = /\btincture(s)?\b/.test(text);
    const ingestionEdible = /(gummy|gummies|chocolate|brownie|cereal bar|nerd rope|capsule|capsules|tablet|tablets|wonky bar|nutella|honey|cannabutter|canna butter|coconut oil)/.test(text);
    const strongConcDistinct = /(wax|shatter|crumble|badder|batter|rosin|live resin|rso|thca|thc-a|diamonds|distillate|distilate|sauce|terp sauce|terpene sauce|piatella|cold cure|slab|extract)/.test(text);
    const allowConcBoost = !(hasTincture && !strongConcDistinct);
    const edibleSkip = ingestionEdible && !strongConcDistinct;
    const tabletCapsIngestion = /(tablet|tablets|capsule|capsules)/.test(text);
    if (tabletCapsIngestion) {
      if (scores.Concentrates) ctx.demote('Concentrates', strongConcDistinct ? 7 : 5);
    }
    if (concSignals.test(text) && allowConcBoost && !edibleSkip && !tabletCapsIngestion) {
      ctx.add('Concentrates', 5);
      ctx.demote('Flower', 5);
    } else if (edibleSkip && scores.Concentrates) {
      ctx.demote('Concentrates', 3);
    } else if (hasTincture && scores.Concentrates && !strongConcDistinct) {
      ctx.demote('Concentrates', 4);
    }
    if (scores.Concentrates && scores.Flower) {
      const strongTokens = [
        'concentrate','concentrates','wax','shatter','rosin','crumble','badder','batter','sugar','diamonds','rso','distillate','distilate','live resin','thca','thc-a'
      ];
      let present = 0;
      for (const tok of strongTokens) if (text.includes(tok)) present++;
      if (present >= 2 && scores.Flower > scores.Concentrates) {
        ctx.add('Concentrates', present * 2);
        ctx.demote('Flower', 2);
      }
    }
  }
}

export default { concentrateEarlyOverridesRule, concentrateMidOverridesRule, concentrateLatePrecedenceRule };
