import type { CatContext } from '../types';

// Tincture brand name refinement rule
// Handles Cannadrops and AccuDose branded products that should be classified as tinctures
// even when strong flower/edible signals are present

export function tinctureRefinementRule(ctx: CatContext) {
  const { text, scores, subsByCat } = ctx;
  
  // Strong tincture brand indicators
  const tinctureBreeds = /(cannadrops|accudose)/;
  
  if (!tinctureBreeds.test(text)) return;
  
  // If we have cannadrops or accudose, strongly boost Tincture
  // These are specific branded tincture products
  ctx.add('Tincture', 8);
  (subsByCat.Tincture ||= new Set()).add('Sublingual');
  
  // Demote competing categories
  // Flower: strain names (Kush, OG, etc.) shouldn't override tincture classification
  if (scores.Flower) {
    ctx.demote('Flower', 6);
  }
  
  // Edibles: "drops" and "oil" might trigger edibles, but these are tinctures
  if (scores.Edibles) {
    ctx.demote('Edibles', 6);
  }
  
  // Concentrates: shouldn't compete unless strong concentrate signals present
  const strongConcDistinct = /(wax|shatter|crumble|badder|batter|rosin|rso|diamonds|thca|thc-a|piatella|cold cure|slab)/.test(text);
  if (scores.Concentrates && !strongConcDistinct) {
    ctx.demote('Concentrates', 5);
  }
  
  // Ensure Tincture wins over remaining categories
  const maxOtherScore = Math.max(
    scores.Flower || 0,
    scores.Edibles || 0,
    scores.Concentrates || 0,
    scores.Vapes || 0,
    scores.Hash || 0
  );
  
  if ((scores.Tincture || 0) <= maxOtherScore) {
    ctx.set('Tincture', maxOtherScore + 3);
  }
}

export default tinctureRefinementRule;
