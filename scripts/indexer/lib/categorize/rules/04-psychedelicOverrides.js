// Phase 2 Step 3: Psychedelic mushroom + edible overrides extracted & deduplicated
// Maintains effective scoring semantics of previously duplicated block.
// Original block existed twice; we combine effects while preserving outcome characteristics.
// Heuristics purpose:
//  - Strongly bias mushroom edible / microdose / grow kit listings into Psychedelics
//  - Demote Edibles when mushroom context dominates (avoid Edibles primary)
//  - Handle partial 'mush' tokens with edible form words (e.g. mrmushies chocolate)
// Inputs: ctx = { text, scores, subsByCat }

function psychedelicOverridesRule(ctx) {
  const { text, scores, subsByCat } = ctx;
  const mushroomRegex = /(\bmushroom\b|\bmushrooms\b|\bshroom\b|\bshrooms\b|shroomy|\bmushies\b|mrmushies|mr\s*mushies|fungi|mycelium|foraged|psilocy|cubensis|penis\s+envy|golden\s+teacher|treasure\s+coast|albino|magic\s+mushroom)/;
  const edibleFormRegex = /(chocolate|choc|gummy|gummies|capsule|capsules|caps\b|bar\b|bars\b|brownie|cacao|cocoa)/;
  const growRegex = /(grow kit|grow kits|grow your own|heat mat|heat mats|flow unit|flow units|spawn|substrate)/;
  const microdoseRegex = /(micro ?dose|microdose|microdoses|microdosing|micro-dosing|micro-doses)/;

  const hasMushroom = mushroomRegex.test(text);
  const hasEdibleForm = edibleFormRegex.test(text);

  if (hasMushroom) {
    (subsByCat.Psychedelics ||= new Set()).add('Mushrooms');
    scores.Psychedelics = (scores.Psychedelics || 0) + 4; // 2 * (original +2 duplication)
  }
  if (hasMushroom && hasEdibleForm) {
    scores.Psychedelics = (scores.Psychedelics || 0) + 12; // doubled +6
    (subsByCat.Psychedelics ||= new Set()).add('Edibles');
    const cannabisEdibleSignals = /(canna|cannabutter|cbd|thc)/.test(text);
    if (!cannabisEdibleSignals && scores.Edibles) {
      // Two sequential -5 demotions merged
      scores.Edibles -= 10;
      if (scores.Edibles <= 0) delete scores.Edibles;
    }
  }
  if (hasMushroom && growRegex.test(text)) {
    (subsByCat.Psychedelics ||= new Set()).add('Grow');
    scores.Psychedelics = (scores.Psychedelics || 0) + 4; // doubled +2
  }
  const hasMicrodose = microdoseRegex.test(text);
  if (hasMushroom && hasMicrodose) {
    (subsByCat.Psychedelics ||= new Set()).add('Microdose');
    scores.Psychedelics = (scores.Psychedelics || 0) + 4; // doubled +2
  }
  // Partial mush token + edible form (was duplicated; combine to +10 & -8)
  if (!hasMushroom && /mush/.test(text) && hasEdibleForm) {
    scores.Psychedelics = (scores.Psychedelics || 0) + 10; // doubled +5
    (subsByCat.Psychedelics ||= new Set()).add('Mushrooms');
    (subsByCat.Psychedelics ||= new Set()).add('Edibles');
    if (scores.Edibles) {
      scores.Edibles -= 8; // doubled -4
      if (scores.Edibles <= 0) delete scores.Edibles;
    }
  }

  // NEW: Microdose-only listings (no explicit mushroom token) should lean Psychedelics
  // when there are no strong cannabis-edible signals.
  if (!hasMushroom && hasMicrodose) {
    const cannabisEdibleSignals = /(\bthc\b|\bcbd\b|cannabis|canna\b|cannabutter|wonky|gummy|gummies|chocolate|brownie|bar\b|bars\b)/.test(text);
    if (!cannabisEdibleSignals) {
      (subsByCat.Psychedelics ||= new Set()).add('Microdose');
      scores.Psychedelics = (scores.Psychedelics || 0) + 6;
      if (scores.Edibles) { scores.Edibles -= 6; if (scores.Edibles <= 0) delete scores.Edibles; }
    }
  }
}

module.exports = { psychedelicOverridesRule };

