// Bulk Distillate vs Vape refinement rule
// Goal: Distinguish ingredient / bulk distillate (should be Concentrates) from true vape hardware listings.
// Also promotes oral wellness distillate oil (no 'tincture' token) into Tincture when clear ingestion context.
// Placement: inserted just before concentrateLatePrecedenceRule so earlier vape overrides can assert first.
// Heuristics:
//  - bulkDistillate when distillate tokens + (ml sizing | litre | syringe | range ml-ml | bulk/jar) tokens present.
//  - Non-hardware / ingredient context when EITHER no hardware tokens OR presence of syringe/fill/refill phrases.
//  - In bulk ingredient context: boost Concentrates (+5) and (if Vapes present & non-hardware) demote Vapes (-4).
//  - Protect true hardware listings (cart/cartridge/disposable/device/pod/battery/ccell/510) without ingredient cues (no boost/demotion).
//  - Oral wellness oil detection: oral ingestion disclaimers + MCT oil + distillate -> force Tincture dominance.
//  - Avoid over-demotion if strong concentrate tokens exist (keep ability to classify as Concentrates when not Tincture).

function distillateBulkRefinementRule(ctx) {
  const { text, scores, subsByCat } = ctx;

  // --- Oral wellness / tincture ingestion override (run regardless of distillate presence) ---
  // Trigger when oral application disclaimers + MCT oil + cannabinoid/distillate tokens present
  const oralContext = /(for oral application|for oral applications|oral application|oral only|for oral use|oral use only|do not smoke|do not vape|sublingual|under the tongue|drops per|approx\s+\d+\s+drops|ingest|ingestion)/;
  const mctOil = /mct\s+oil|\bmct\b|coconut\s+oil|extra\s+virgin\s+coconut\s+oil/;
  const cannabinoidTokens = /(distillate|distilate|cbd|thc|cbg|cbn|full\s*spectrum)/; // broaden so CBD-only wellness oils still qualify
  const edibleOilAdjuncts = /(lecithin|sunflower lecithin)/;
  const hasOralTinctureSignals = (oralContext.test(text) || /for oral/.test(text)) && mctOil.test(text) && cannabinoidTokens.test(text);
  if (hasOralTinctureSignals || (mctOil.test(text) && edibleOilAdjuncts.test(text) && /(shatter|rosin|rso)/.test(text))) {
    // Strongly boost Tincture
    scores.Tincture = (scores.Tincture || 0) + 10; // ensure dominance over Vapes/Concentrates base
    // Hard demote Vapes if present and there is no real hardware token (just disclaimers)
    const hardwareTokens = /(cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510\b|device)/;
    const disclaimerOnlyVape = /(do not smoke|do not vape|not for vaping|not for smoking)/.test(text) && !hardwareTokens.test(text);
    if (scores.Vapes && disclaimerOnlyVape) { scores.Vapes -= 999; if (scores.Vapes <= 0) delete scores.Vapes; }
    // Demote Concentrates unless strong dab-only context (avoid harming true dab tincture hybrids)
  const strongConcDistinct = /(wax|shatter|crumble|badder|batter|rosin|rso|diamonds|thca|thc-a|piatella|cold cure|slab|extract)/.test(text);
    const dabOnly = /(dab|dabbing)/.test(text) && !hardwareTokens.test(text);
    if (scores.Concentrates && !dabOnly) {
      const demoteAmt = strongConcDistinct ? 6 : 5;
      scores.Concentrates -= demoteAmt;
      if (scores.Concentrates <= 0) delete scores.Concentrates;
    }
    // Demote Edibles in oral tincture context (e.g., 'drops per bottle' can falsely add Candy/Drops)
    if (scores.Edibles) {
      scores.Edibles -= 9;
      if (scores.Edibles <= 0) delete scores.Edibles;
    }
    // Guarantee Tincture strictly exceeds any surviving Concentrates / Vapes
    if (scores.Concentrates && scores.Tincture <= scores.Concentrates) {
      scores.Tincture = scores.Concentrates + 2;
    }
    if (scores.Vapes && scores.Tincture <= scores.Vapes) {
      scores.Tincture = scores.Vapes + 2;
    }
    if (scores.Edibles && scores.Tincture <= scores.Edibles) {
      scores.Tincture = scores.Edibles + 2;
    }
  }

  // CBD Oil specific: if name/desc indicate CBD oil bottle size without vape hardware, treat as Tincture
  const cbdOilBottle = /(cbd\s+oil)\b/.test(text) && /(\b\d{1,3}\s?ml\b|\b15\s?ml\b|\b30\s?ml\b)/.test(text);
  const hardwareTokens2 = /(cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510\b|device)/;
  if (cbdOilBottle && !hardwareTokens2.test(text)) {
    scores.Tincture = (scores.Tincture || 0) + 8;
    if (scores.Vapes) { scores.Vapes -= 6; if (scores.Vapes <= 0) delete scores.Vapes; }
    if (scores.Concentrates) { scores.Concentrates -= 4; if (scores.Concentrates <= 0) delete scores.Concentrates; }
  }

  // --- Bulk distillate vs vape hardware refinement (requires distillate / d9 tokens) ---
  const distTok = /(distillate|distilate|delta 9|delta-9|delta9|d9|crystalline|thca|thc-a)/;
  if (!distTok.test(text)) return; // fast exit for non-distillate listings (oral wellness already handled above)

  // NEW: Purity / quality disclaimers often indicate ingredient bulk distillate (not hardware) even without size metrics
  // Trigger only when no explicit hardware tokens present.
  const hardwareTokens = /(\bvape|\bvapes|cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510\b|device)/;
  const purityContext = /(no pesticides|heavy metals|mycotoxin|mycotoxins|contaminant|contaminants|cat\s*3|cleanest|highest quality|purest|lab tested|coa\b|coas\b|only the cleanest)/;
  if (!hardwareTokens.test(text) && purityContext.test(text)) {
    scores.Concentrates = (scores.Concentrates || 0) + 6;
    if (scores.Vapes) { scores.Vapes -= 5; if (scores.Vapes <= 0) delete scores.Vapes; }
    // Ensure Distillates subcategory retained if present
    if (/(distillate|distilate)/.test(text)) {
      (subsByCat.Concentrates ||= new Set()).add('Distillates');
    }
    // If this purity branch fires, we still continue to check for ml bulk signals below, but early dominance already established
  }

  const mlPattern = /\b\d{1,4}(?:\.\d+)?\s?(?:ml|mL)\b/;
  const litrePattern = /\b\d(?:\.\d+)?\s?(?:l|litre|liter)\b/; // restrict to 1-9L to reduce false positives
  const mlRange = /\b\d{1,3}\s?ml\s?-\s?\d{1,3}\s?ml\b/;
  const syringe = /syringe|syringes|applicator|applicators/;
  const bulkWords = /\b(bulk|jar|jars)\b/;
  const fillPhrases = /(fill (straight )?into|fill your (own )?vapes?|refill|top up)/;

  const bulkDistillate = (mlPattern.test(text) || litrePattern.test(text) || mlRange.test(text) || syringe.test(text) || bulkWords.test(text)) ;
  const largeBulk = litrePattern.test(text) || /\b1\s?l\b/.test(text) || /\b(5[0-9]|[6-9][0-9]|[1-9][0-9]{2,3})\s?ml\b/.test(text);
  if (bulkDistillate) {
    const ingredientContext = (!hardwareTokens.test(text)) || syringe.test(text) || fillPhrases.test(text) || largeBulk;
    if (ingredientContext) {
      scores.Concentrates = (scores.Concentrates || 0) + (largeBulk ? 7 : 5);
      // Mark Distillates subtype when applicable
      if (/(distillate|distilate|delta 9|delta-9|delta9|d9)/.test(text)) {
        (subsByCat.Concentrates ||= new Set()).add('Distillates');
      }
      // Demote Edibles if present (bulk ingredient listings are not ready-to-eat edibles)
      if (scores.Edibles) { scores.Edibles -= 6; if (scores.Edibles <= 0) delete scores.Edibles; }
      const hardwareOnlySale = hardwareTokens.test(text) && !syringe.test(text) && !fillPhrases.test(text) && !largeBulk;
      if (scores.Vapes && !hardwareOnlySale) {
        scores.Vapes -= largeBulk ? 999 : 4; // large bulk: obliterate vape classification (generic vape mention only)
        if (scores.Vapes <= 0) delete scores.Vapes;
      }
    }
    // Syringe + fill explicit dominance (ingredient distribution kit)
    if (syringe.test(text) && fillPhrases.test(text)) {
      scores.Concentrates = (scores.Concentrates || 0) + 6; // extra dominance
      if (scores.Vapes) { scores.Vapes -= 999; if (scores.Vapes <= 0) delete scores.Vapes; }
    }
    // Large bulk with ONLY generic 'vape(s)' (no cart/cartridge/disposable/pod/pen/battery/ccell/510) treat as ingredient
    const genericVapeOnly = /\bvapes?\b/.test(text) && !/(cart|carts|cartridge|cartridges|disposable|disposables|pod|pods|pen|pens|battery|ccell|510)/.test(text);
    if (largeBulk && genericVapeOnly) {
      scores.Concentrates = (scores.Concentrates || 0) + 5;
      if (scores.Vapes) { scores.Vapes -= 999; if (scores.Vapes <= 0) delete scores.Vapes; }
    }
  }

  // (Oral override already executed above; no further action here.)
}

module.exports = { distillateBulkRefinementRule };
