import type { CatContext } from '../types';

// Parity port of 12-otherParaphernalia.js
// Handles paraphernalia (bongs) and genetics (clones, cuttings, seeds)

export function otherParaphernaliaRule(ctx: CatContext) {
  const { name, text, scores, subsByCat } = ctx;
  const title = (name || '').toLowerCase();
  
  // Bongs detection (title only)
  if (/\bbongs?\b/.test(title)) {
    ctx.add('Other', 12);
    if (scores.Flower) ctx.demote('Flower', 8);
    if (scores.Concentrates) ctx.demote('Concentrates', 8);
    if (scores.Vapes) ctx.demote('Vapes', 6);
    (subsByCat.Other ||= new Set()).add('Bongs');
  }
  
  // Genetics detection (clones, cuttings, seeds)
  // Patterns: "clone", "clones", "cutting", "cuttings", "seed", "seeds"
  const geneticsPattern = /(\bclone\b|\bclones\b|\bcloning\b|\bcutting\b|\bcuttings\b|\bseed\b|\bseeds\b|\bseedbank\b)/;
  
  // Additional context indicators that strengthen genetics classification
  const geneticsContext = /(ten pack|pack of|feminized|autoflower|auto flower|germination|seedbay|breeding|lineage|regular seeds|photoperiod|mother plant|mum|clone only|cutting only|sex:\s*regular|type:\s*sativa|type:\s*indica|flowering:\s*photoperiod)/;
  
  // Brand name genetics: "by [name] genetics" in title (case insensitive, handles punctuation)
  const brandGenetics = /\bby\s+[\w\s]+genetics[\s\.\,\!]?/i;
  
  if (geneticsPattern.test(text) || brandGenetics.test(title)) {
    // Strong boost if title contains genetics terms or strong context present
    const strongGenetics = geneticsPattern.test(title) || geneticsContext.test(text) || brandGenetics.test(title);
    
    if (strongGenetics) {
      ctx.add('Other', 10);
      if (scores.Flower) ctx.demote('Flower', 8);
      if (scores.Hash) ctx.demote('Hash', 6);
      (subsByCat.Other ||= new Set()).add('Genetics');
      
      // Ensure Other wins over Flower
      if ((scores.Other || 0) <= (scores.Flower || 0)) {
        ctx.set('Other', (scores.Flower || 0) + 3);
      }
    }
  }
}

export default otherParaphernaliaRule;
