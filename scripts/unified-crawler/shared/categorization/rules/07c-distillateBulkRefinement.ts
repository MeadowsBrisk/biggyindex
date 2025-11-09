import type { CatContext } from '../types';

// Parity port of 07c-distillateBulkRefinement.js

export function distillateBulkRefinementRule(ctx: CatContext) {
  const { text, scores, subsByCat } = ctx;
  // Oral wellness / tincture ingestion override
  const oralContext = /(for oral application|for oral applications|oral application|oral only|for oral use|oral use only|do not smoke|do not vape|sublingual|under the tongue|drops per|approx\s+\d+\s+drops|ingest|ingestion)/;
  const mctOil = /mct\s+oil|\bmct\b|coconut\s+oil|extra\s+virgin\s+coconut\s+oil/;
  const cannabinoidTokens = /(distillate|distilate|cbd|thc|cbg|cbn|full\s*spectrum)/;
  const edibleOilAdjuncts = /(lecithin|sunflower lecithin)/;
  const hasOralTinctureSignals = (oralContext.test(text) || /for oral/.test(text)) && mctOil.test(text) && cannabinoidTokens.test(text);
  if (hasOralTinctureSignals || (mctOil.test(text) && edibleOilAdjuncts.test(text) && /(shatter|rosin|rso)/.test(text))) {
    ctx.add('Tincture', 10);
    const hardwareTokens = /(cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510\b|device)/;
    const disclaimerOnlyVape = /(do not smoke|do not vape|not for vaping|not for smoking)/.test(text) && !hardwareTokens.test(text);
    if (scores.Vapes && disclaimerOnlyVape) ctx.demote('Vapes', 999);
    const strongConcDistinct = /(wax|shatter|crumble|badder|batter|rosin|rso|diamonds|thca|thc-a|piatella|cold cure|slab|extract)/.test(text);
    const dabOnly = /(dab|dabbing)/.test(text) && !hardwareTokens.test(text);
    if (scores.Concentrates && !dabOnly) ctx.demote('Concentrates', strongConcDistinct ? 6 : 5);
    if (scores.Edibles) ctx.demote('Edibles', 9);
    if (scores.Concentrates && (scores.Tincture || 0) <= scores.Concentrates) ctx.set('Tincture', scores.Concentrates + 2);
    if (scores.Vapes && (scores.Tincture || 0) <= scores.Vapes) ctx.set('Tincture', scores.Vapes + 2);
    if (scores.Edibles && (scores.Tincture || 0) <= scores.Edibles) ctx.set('Tincture', scores.Edibles + 2);
  }
  const cbdOilBottle = /(cbd\s+oil)\b/.test(text) && /(\b\d{1,3}\s?ml\b|\b15\s?ml\b|\b30\s?ml\b)/.test(text);
  const hardwareTokens2 = /(cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510\b|device)/;
  if (cbdOilBottle && !hardwareTokens2.test(text)) {
    ctx.add('Tincture', 8);
    if (scores.Vapes) ctx.demote('Vapes', 6);
    if (scores.Concentrates) ctx.demote('Concentrates', 4);
  }
  const distTok = /(distillate|distilate|delta 9|delta-9|delta9|d9|crystalline|thca|thc-a)/;
  if (!distTok.test(text)) return;
  const hardwareTokens = /(\bvape|\bvapes|cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510\b|device)/;
  const purityContext = /(no pesticides|heavy metals|mycotoxin|mycotoxins|contaminant|contaminants|cat\s*3|cleanest|highest quality|purest|lab tested|coa\b|coas\b|only the cleanest)/;
  if (!hardwareTokens.test(text) && purityContext.test(text)) {
    ctx.add('Concentrates', 6);
    if (scores.Vapes) ctx.demote('Vapes', 5);
    if (/(distillate|distilate)/.test(text)) (subsByCat.Concentrates ||= new Set()).add('Distillates');
  }
  const mlPattern = /\b\d{1,4}(?:\.\d+)?\s?(?:ml|mL)\b/;
  const litrePattern = /\b\d(?:\.\d+)?\s?(?:l|litre|liter)\b/;
  const mlRange = /\b\d{1,3}\s?ml\s?-\s?\d{1,3}\s?ml\b/;
  const syringe = /syringe|syringes|applicator|applicators/;
  const bulkWords = /\b(bulk|jar|jars)\b/;
  const fillPhrases = /(fill (straight )?into|fill your (own )?vapes?|refill|top up)/;
  const bulkDistillate = (mlPattern.test(text) || litrePattern.test(text) || mlRange.test(text) || syringe.test(text) || bulkWords.test(text));
  const largeBulk = litrePattern.test(text) || /\b1\s?l\b/.test(text) || /\b(5[0-9]|[6-9][0-9]|[1-9][0-9]{2,3})\s?ml\b/.test(text);
  if (bulkDistillate) {
    const ingredientContext = (!hardwareTokens.test(text)) || syringe.test(text) || fillPhrases.test(text) || largeBulk;
    if (ingredientContext) {
      ctx.add('Concentrates', largeBulk ? 7 : 5);
      if (/(distillate|distilate|delta 9|delta-9|delta9|d9)/.test(text)) (subsByCat.Concentrates ||= new Set()).add('Distillates');
      if (scores.Edibles) ctx.demote('Edibles', 6);
      const hardwareOnlySale = hardwareTokens.test(text) && !syringe.test(text) && !fillPhrases.test(text) && !largeBulk;
      if (scores.Vapes && !hardwareOnlySale) {
        ctx.demote('Vapes', largeBulk ? 999 : 4);
      }
    }
    if (syringe.test(text) && fillPhrases.test(text)) {
      ctx.add('Concentrates', 6);
      if (scores.Vapes) ctx.demote('Vapes', 999);
    }
    const genericVapeOnly = /\bvapes?\b/.test(text) && !/(cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510)/.test(text);
    if (largeBulk && genericVapeOnly) {
      ctx.add('Concentrates', 5);
      if (scores.Vapes) ctx.demote('Vapes', 999);
    }
  }
}

export default distillateBulkRefinementRule;
