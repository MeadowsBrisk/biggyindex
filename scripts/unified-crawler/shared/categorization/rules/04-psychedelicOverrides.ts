import type { CatContext } from '../types';

// Parity port of 04-psychedelicOverrides.js
// Consolidated mushroom edible/microdose/grow overrides + LSD paper handling.

export function psychedelicOverridesRule(ctx: CatContext) {
  const { text, scores, subsByCat } = ctx;
  const mushroomRegex = /(\bmushroom\b|\bmushrooms\b|\bshroom\b|\bshrooms\b|shroomy|\bmushies\b|mrmushies|mr\s*mushies|fungi|mycelium|foraged|psilocy|cubensis|penis\s+envy|golden\s+teacher|treasure\s+coast|albino|magic\s+mushroom)/;
  const edibleFormRegex = /(chocolate|choc|gummy|gummies|capsule|capsules|caps\b|bar\b|bars\b|brownie|cacao|cocoa)/;
  const growRegex = /(grow kit|grow kits|grow your own|heat mat|heat mats|flow unit|flow units|spawn|substrate)/;
  const microdoseRegex = /(micro ?dose|microdose|microdoses|microdosing|micro-dosing|micro-doses)/;
  const lsdCues = /(\blsd\b|\bacid\b|\bblotter\b|\btab\b|\bpaper\b|\blucy\b|albert\s+h[oa]f+mann?)/;

  const hasMushroom = mushroomRegex.test(text);
  const hasEdibleForm = edibleFormRegex.test(text);
  const hasLsd = lsdCues.test(text);

  if (hasMushroom) {
    (subsByCat.Psychedelics ||= new Set()).add('Mushrooms');
    ctx.add('Psychedelics', 4); // doubled +2
  }
  if (hasMushroom && hasEdibleForm) {
    ctx.add('Psychedelics', 12); // doubled +6
    (subsByCat.Psychedelics ||= new Set()).add('Edibles');
    const cannabisEdibleSignals = /(canna|cannabutter|cbd|thc)/.test(text);
    if (!cannabisEdibleSignals && scores.Edibles) ctx.demote('Edibles', 10); // merged -5 -5
  }
  if (hasMushroom && growRegex.test(text)) {
    (subsByCat.Psychedelics ||= new Set()).add('Grow');
    ctx.add('Psychedelics', 4);
  }
  const hasMicrodose = microdoseRegex.test(text);
  if (hasMushroom && hasMicrodose) {
    (subsByCat.Psychedelics ||= new Set()).add('Microdose');
    ctx.add('Psychedelics', 4);
  }
  if (!hasMushroom && /mush/.test(text) && hasEdibleForm) {
    ctx.add('Psychedelics', 10);
    (subsByCat.Psychedelics ||= new Set()).add('Mushrooms');
    (subsByCat.Psychedelics ||= new Set()).add('Edibles');
    if (scores.Edibles) ctx.demote('Edibles', 8);
  }
  if (!hasMushroom && hasMicrodose) {
    const cannabisEdibleSignals = /(\bthc\b|\bcbd\b|cannabis|canna\b|cannabutter|wonky|gummy|gummies|chocolate|brownie|bar\b|bars\b)/.test(text);
    if (!cannabisEdibleSignals) {
      (subsByCat.Psychedelics ||= new Set()).add('Microdose');
      ctx.add('Psychedelics', 6);
      if (scores.Edibles) ctx.demote('Edibles', 6);
    }
  }
  if (hasLsd) {
    (subsByCat.Psychedelics ||= new Set()).add('Paper');
    ctx.add('Psychedelics', hasEdibleForm ? 10 : 6);
    if (scores.Edibles && hasEdibleForm) ctx.demote('Edibles', 9);
  }
}

export default psychedelicOverridesRule;
