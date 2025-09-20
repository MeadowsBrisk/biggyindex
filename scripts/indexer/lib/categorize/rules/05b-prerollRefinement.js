// Preroll refinement rule
// Purpose: remove false-positive Flower PreRolls subcategory when tokens appear in context
// of shake/trim/dust listings or strain names like 'Thai Stick' describing usage rather than
// actual pre-rolled joints/blunts/cones.
// Heuristics:
//  - If PreRolls subcategory present AND text contains shake/trim/dust/popcorn and lacks strong pack indicators
//  - Or phrase 'preroll quality' with shake
//  - Or 'perfect for'/'great for' usage phrases followed by joints/blunts etc AND shake present
//  - Or strain phrase 'thai stick' / 'thai sticks'
//  - Remove PreRolls from subsByCat.Flower set (do not alter primary flower score)

function prerollRefinementRule(ctx) {
  const { text, subsByCat } = ctx;
  const flowerSubs = subsByCat.Flower;
  if (!flowerSubs || !flowerSubs.has('PreRolls')) return;
  const hasShakeLike = /(shake|trim|dust|popcorn)/.test(text);
  const usagePhrase = /(perfect|great|ideal)\s+for\s+(blunts?|joints?|pre[- ]?rolls?|cones?)/.test(text);
  const prerollQuality = /preroll\s+quality/.test(text);
  const thaiStickStrain = /\bthai(?:[-\s]+)stick(s)?\b/.test(text);
  const shakeQuality = /(ultimate|super|premium)\s+preroll\s+quality/.test(text) && /shake/.test(text);
  // Indicators of actual pre-roll product packaging/quantity
  const packIndicators = /(pack|box|tube|doob|doobie|multi|bundle)/;
  const explicitCountPre = /\b\d+\s?(x\s?)?(pre[- ]?rolls?|joints?|blunts?|cones?)\b/;
  const preRolledTerm = /pre[- ]?rolled/;
  const isPack = packIndicators.test(text) || explicitCountPre.test(text) || preRolledTerm.test(text);

  const shouldRemove = (
    (hasShakeLike && !isPack) ||
    (prerollQuality && hasShakeLike) ||
    usagePhrase && hasShakeLike ||
    thaiStickStrain ||
    shakeQuality
  );
  if (shouldRemove) {
    flowerSubs.delete('PreRolls');
    if (flowerSubs.size === 0) delete subsByCat.Flower; // leave empty structure clean
  }
  const hashOnlyMoonrock = flowerSubs.has('PreRolls') && /moonrock|moonrocks/.test(text) && !/(\bhash\b|kief|pollen|dry sift|dry-filtered|static sift|piatella|temple ball|temple balls)/.test(text);
  if (hashOnlyMoonrock && ctx.scores && ctx.scores.Hash) {
    ctx.scores.Hash -= 6;
    if (ctx.scores.Hash <= 0) delete ctx.scores.Hash;
  }
}

module.exports = { prerollRefinementRule };
