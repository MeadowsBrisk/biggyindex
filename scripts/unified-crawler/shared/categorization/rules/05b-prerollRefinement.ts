import type { CatContext } from '../types';

/**
 * PreRolls refinement rule
 * 
 * Since PreRolls is now a top-level category (not a Flower subcategory),
 * this rule handles disambiguation between PreRolls and Flower:
 * 
 * - Boosts PreRolls when explicit pre-roll terms appear in NAME (highest priority)
 * - Demotes PreRolls when text describes shake/trim/popcorn with usage phrases
 *   like "perfect for joints" (these are loose flower, not actual pre-rolls)
 *   UNLESS the name contains explicit pre-roll terms
 * - Boosts PreRolls when explicit pack/count indicators are present
 * - Handles moonrock pre-rolls (hash-infused)
 */

export function prerollRefinementRule(ctx: CatContext) {
  const { text, name, scores, subsByCat } = ctx;
  
  // Check if PreRolls is even in consideration
  let hasPrerollScore = scores.PreRolls && scores.PreRolls > 0;
  const hasFlowerScore = scores.Flower && scores.Flower > 0;
  
  // Check if NAME contains explicit pre-roll terms (strong signal)
  // But exclude "preroll quality" which describes shake/trim suitable for making pre-rolls
  const nameLower = (name || '').toLowerCase();
  const isPrerollQualityDescriptor = /preroll\s*quality|pre[- ]?roll\s*quality/i.test(nameLower);
  const nameHasPrerollTerm = !isPrerollQualityDescriptor && /pre[- ]?roll|preroll|joint|cone|blunt|doob/i.test(nameLower);
  
  // If name has pre-roll terms but no PreRolls score yet, add it
  // This handles cases where taxonomy keywords are narrow but the name is explicit
  if (nameHasPrerollTerm && !hasPrerollScore) {
    ctx.add('PreRolls', 6);  // Higher initial score for name match
    hasPrerollScore = true; // Update our local check
  }
  
  // Early exit if no relevant category scores
  if (!hasPrerollScore && !hasFlowerScore) return;
  
  const hasShakeLike = /(shake|trim|dust|popcorn)/.test(text);
  const usagePhrase = /(perfect|great|ideal)\s+for\s+(blunts?|joints?|pre[- ]?rolls?|cones?)/.test(text);
  const prerollQuality = /preroll\s+quality/.test(text);
  const thaiStickStrain = /\bthai(?:[-\s]+)stick(s)?\b/.test(text);
  const shakeQuality = /(ultimate|super|premium)\s+preroll\s+quality/.test(text) && /shake/.test(text);
  
  // Pack/product indicators (actual pre-rolled products)
  const packIndicators = /(pack|box|tube|doob|doobie|multi|bundle)/;
  const explicitCountPre = /\b\d+\s?(x\s?)?(pre[- ]?rolls?|joints?|blunts?|cones?)\b/;
  const preRolledTerm = /pre[- ]?rolled/;
  const isPack = packIndicators.test(text) || explicitCountPre.test(text) || preRolledTerm.test(text);
  
  // If NAME explicitly mentions pre-roll terms, strongly boost PreRolls
  // This overrides shake/trim context in description
  if (nameHasPrerollTerm && hasPrerollScore) {
    ctx.add('PreRolls', 10);  // Strong boost for explicit name match
    ctx.demote('Flower', 8);   // Strong demotion since name is explicit
    // Don't demote further even if shake mentioned in description
    return;
  }
  
  // If it's shake/trim described as "good for rolling" - demote PreRolls, boost Flower
  // Only if name doesn't have explicit pre-roll terms
  const isLooseFlowerContext = (
    (hasShakeLike && !isPack) ||
    (prerollQuality && hasShakeLike) ||
    (usagePhrase && hasShakeLike) ||
    thaiStickStrain ||
    shakeQuality
  );
  
  if (isLooseFlowerContext && hasPrerollScore && !nameHasPrerollTerm) {
    ctx.demote('PreRolls', 8);
    ctx.add('Flower', 3);
    // Remove any PreRolls subcategories
    if (subsByCat.PreRolls) {
      delete subsByCat.PreRolls;
    }
    return;
  }
  
  // If explicit pre-roll pack with hash/kief infusion, tag Infused subcategory
  if (isPack && hasPrerollScore) {
    const isInfused = /(infused|hash[- ]?infused|kief|dipped|moonrock|moon[- ]?rock)/.test(text);
    if (isInfused) {
      if (!subsByCat.PreRolls) subsByCat.PreRolls = new Set();
      subsByCat.PreRolls.add('Infused');
      // Boost PreRolls for infused products
      ctx.add('PreRolls', 3);
    }
  }
  
  // Handle moonrock mentions - could be Hash moonrocks or PreRolls moonrocks
  const hasMoonrock = /moonrock|moon[- ]?rock/i.test(text);
  const hasHashSignals = /(\bhash\b|kief|pollen|dry sift|dry-filtered|static sift|piatella|temple ball)/.test(text);
  
  if (hasMoonrock && hasPrerollScore && !hasHashSignals) {
    // Moonrock pre-roll without hash signals - likely infused pre-roll
    if (!subsByCat.PreRolls) subsByCat.PreRolls = new Set();
    subsByCat.PreRolls.add('Infused');
  }
}

export default prerollRefinementRule;
