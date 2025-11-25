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
  
  // Genetics detection (clones, cuttings, seeds for sale - NOT flower with seeds or lineage info)
  
  // Clone/cutting in title is a STRONG signal - these rarely appear in flower listings
  const cloneCuttingTitlePattern = /(\bclone\b|\bclones\b|\bcloning\b|\bcutting\b|\bcuttings\b)/;
  
  // Seeds in title needs additional context to avoid false positives
  const seedsTitlePattern = /(\bseed\b|\bseeds\b|\bseedbank\b)/;
  
  // Selling context: Strong indicators this is genetics FOR SALE (required for seeds)
  const geneticsSellingContext = /(ten pack|pack of \d+|feminized|autoflower|auto flower|germination|seedbay|regular seeds|photoperiod|mother plant|clone only|cutting only|rooted clone|unrooted|sex:\s*regular|sex:\s*feminized)/;
  
  // Exclude false positives: flower descriptions mentioning seeds/breeding as context
  const flowerContextExclusion = /(contain.*seeds?|contains.*seeds?|has.*seeds?|have.*seeds?|with.*seeds?|few seeds?|some seeds?|seeds? in|breeding strain|bred by|lineage|genetics by|cross of|crossed with)/;
  
  // Brand name genetics: "by [name] genetics" in title (case insensitive, handles punctuation)
  const brandGenetics = /\bby\s+[\w\s]+genetics[\s\.\,\!]?/i;
  
  // Classify as genetics if:
  // 1. Title contains clone/cutting (strong signal, no additional context needed), OR
  // 2. Title contains seeds AND selling context present AND no flower-context exclusions, OR
  // 3. Brand genetics pattern in title
  const titleHasCloneCutting = cloneCuttingTitlePattern.test(title);
  const titleHasSeeds = seedsTitlePattern.test(title);
  const hasSellingContext = geneticsSellingContext.test(text);
  const hasBrandGenetics = brandGenetics.test(title);
  const hasFlowerContext = flowerContextExclusion.test(text);
  
  const isGenetics = titleHasCloneCutting || 
                     (titleHasSeeds && hasSellingContext && !hasFlowerContext) || 
                     hasBrandGenetics;
  
  if (isGenetics) {
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

export default otherParaphernaliaRule;
