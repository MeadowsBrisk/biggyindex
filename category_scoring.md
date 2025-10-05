# Category Scoring & Classification Pipeline

Purpose: Central reference for how item names/descriptions are converted into (primary category, subcategories) plus rationale behind each heuristic. Future agents should read this first before altering taxonomy, rule ordering, or scoring weights.

## Repository File Map (Authoritative Sources)
- Pipeline orchestrator: scripts/indexer/lib/categorize/pipeline.js
- Rule files (executed in order – see RULE_SEQUENCE): scripts/indexer/lib/categorize/rules/*.js
- Taxonomy (keywords & children): scripts/indexer/lib/taxonomy/baseTaxonomy.js
- Precedence definition: scripts/indexer/lib/categorize/rules/90-precedenceResolution.js
- ScoreBoard scaffold (not yet wired into rules): scripts/indexer/lib/categorize/scoreBoard.js
- Index entrypoint (fetch + categorize + persist): scripts/indexer/index-items.js
- Debug helper (manual classification): scripts/debug-categorize.js (reads pipeline)
- Tests (regressions / rule behaviour): scripts/indexer/test-*.js

## Pipeline Implementation (Exact Current ORDER)
Extract from pipeline.js (RULE_SEQUENCE):
1. baseKeywordsRule (01-baseKeywords.js)
2. fallbackBoostsRule (03-fallbackBoosts.js)
3. prerollRefinementRule (05b-prerollRefinement.js)
4. psychedelicOverridesRule (04-psychedelicOverrides.js)
5. ediblesVsFlowerDisambiguationRule (05-ediblesVsFlowerDisambiguation.js)
6. hashEarlyOverridesRule (06-hashOverrides.js)
7. medicalEarlyRule (09-medicalOverrides.js)
8. concentrateEarlyOverridesRule (07-concentrateOverrides.js)
9. antibioticLineageRule (09-medicalOverrides.js)
10. vapeOverridesRule (08-vapeOverrides.js)
11. templeBallsRule (06-hashOverrides.js)
12. concentrateMidOverridesRule (07-concentrateOverrides.js)
13. edibleSauceRefinementRule (07b-edibleSauceRefinement.js)
14. ediblesFalsePositiveDemotionRule (10-ediblesFalsePositiveDemotion.js)
15. seedsListingsRule (11-seedsListings.js)
16. hashPrecedenceRule (06-hashOverrides.js)
17. distillateBulkRefinementRule (07c-distillateBulkRefinement.js)
18. concentrateLatePrecedenceRule (07-concentrateOverrides.js)
19. precedenceResolutionRule (90-precedenceResolution.js)

Do NOT reorder casually. New rules should normally slot just before late precedence stages (15–16) unless they refine a very early ambiguity (then near 2–5). Document any insertion here.

## Rule File Inventory & Trigger Logic
(Use this as a change impact checklist when editing any token.)

01-baseKeywords.js
- Assigns base + child scores (+2 / +3). Excludes Tips from ever being primary.
- Word boundary regex built per token; tokens with spaces (e.g. " og ") rely on trimmed boundaries – confirm after adding similar patterns.

03-fallbackBoosts.js
- Generic boosts for hash/flower/edible/vape tokens; mushroom + LSD/DMT psychedelic boosts; edible spread/oil special; mad honey override to Other.
- Notes: LSD cues include `lsd|acid|dmt`; separate LSD-specific handling also exists in 04-psychedelicOverrides for edible contexts.

05b-prerollRefinement.js
- Removes Flower.PreRolls in shake/trim/dust/popcorn usage or descriptive usage phrases ("perfect for joints" etc.).
- Demotes Hash if only moonrock mention inside preroll context without true hash signals.

04-psychedelicOverrides.js
- Aggregated mushroom edible/microdose/grow overrides. Demotes Edibles when mushroom edible context appears without cannabis edible signals. Adds microdose-only handling (no explicit mushroom token, no cannabis-edible signals) to boost Psychedelics and demote Edibles.
- NEW: LSD “paper” override. Triggers on `lsd|acid|blotter|tab|paper|lucy|albert hofmann` and, if edible terms (gummies/choc/etc.) are present, strongly boosts Psychedelics.Paper and demotes Edibles to classify LSD candies correctly.

05-ediblesVsFlowerDisambiguation.js
- Dessert strain disambiguation: demote Edibles if only dessert-like tokens + strong flower context and no ingestion tokens; boosts Flower slightly.

06-hashOverrides.js
- hashEarlyOverridesRule: hash concentrate phrase, Simpson Kush strong boost, decarb hash, candyish hash context adjustments.
- templeBallsRule: temple ball(s) decisive Hash.
- hashPrecedenceRule: late bias Hash over Flower if explicit hash signals or name contains 'hash'. Includes 'hashish' as an explicit signal.
- NEW: Recognizes `120u`/`120 micron` explicitly as strong Hash signal. Maps “diamond infused flower” to Hash and tags Moonrocks subcategory (demotes Flower).

11-seedsListings.js (NEW)
- seedsListingsRule: Listings with clear seed context (title/text mentions seeds plus seedbank/seedbay/feminized/autoflower/germination or pack hints like "ten pack") are steered to Other and Flower is demoted. Placed late, before final precedence.

07-concentrateOverrides.js
- concentrateEarlyOverridesRule: crumble false-positive demotion when only flower context.
- concentrateMidOverridesRule: distillate candy bar listings -> Edibles redirect. Also redirects confection listings (candy/sweets/drops/pieces) that include concentrate signals (e.g., shatter/rosin/distillate) to Edibles and demotes Concentrates.
- concentrateLatePrecedenceRule: multi-part logic (live resin tincture guard, strong name-based concentrate, sugar/crystal demotion with expanded flower-context signals, guarded generic boost vs Flower, edible ingestion suppression, multi-strong-token scaling).
- Updates:
    - Mid: Includes gummies in confection ingestion patterns for redirect when infused with concentrates.
    - Late: Boosts Concentrates for `crystalline/crystal` and sugar when concentrate indicators present; name-based sugar also nudges Concentrates over Flower.
    - THC Syrup without vape hardware now classifies as Concentrates (demotes Flower/Vapes).
    - Syringe/applicator (e.g., 1g applicator) boosts Concentrates and demotes Flower.

07b-edibleSauceRefinement.js
- Distinguishes confection sauce (wonky/oompa/gourmet + mg or confection tokens) vs terp/live resin sauce.

08-vapeOverrides.js
- Hardware detection, additional synergy boosts (cart + distillate/resin), concentrate demotion in pure vape contexts, potency dominance, subcategory tagging, cryo cured diamonds special case.
- NEW: Treats `HTFSE` and `Liquid Diamonds` as vape contexts; adds Vapes.LiveResin subcategory and biases toward Vapes even without explicit hardware tokens (while still allowing stronger hardware synergy boosts to stack).

09-medicalOverrides.js
- medicalEarlyRule: antibiotic presence demotes Flower when only generic strain references.
- antibioticLineageRule: antibiotic tokens push Other; lineage context boosts Flower & demotes Edibles absent ingestion tokens.

10-ediblesFalsePositiveDemotion.js
- Generic sweet words with strong flower context + no ingestion forms -> demote Edibles, boost Flower.
- Spread/oil explicit cannabis qualifiers re-boost Edibles; special strong dominance for "cannabis coconut oil".
- Updated ingestion forms include `tablet|tablets` to correctly recognize edible tablets.

90-precedenceResolution.js
- Final tie-breaking and Other guard (requires explicit Other keyword). Subcategories narrowed to chosen primary.

## ScoreBoard (Current State & Integration Plan)
File: lib/categorize/scoreBoard.js
- Functions: add(cat, pts, reason), demote(cat, pts, reason), set, remove, importFinal, snapshot, trace.
- NOT yet used inside rules; rules mutate plain scores object directly (historical parity constraint).
- To integrate without behaviour change:
    1. Create adapter in pipeline to wrap scores mutations (monkey patch set/add/demote) logging reasons.
    2. Replace direct arithmetic (scores.X += N) with helper calls incrementally, running full regression tests after each batch.
    3. Expose debug mode: runCategorizationPipeline(name, desc, { trace: true }) returning { primary, subcategories, trace }.
- DO NOT partially convert a single rule file; convert whole rule to avoid missing reason lines.

## Taxonomy Structure Snapshot (baseTaxonomy.js)
Parent Categories & notable child groups:
- Flower: children Haze, Kush, rs11, Zkittlez, OG, Diesel, Shake, PreRolls, Imported, Smalls, Exotics (new), Landrace (new)
- Landrace keywords emphasize "thai stick", "red string", "ital", and "brick/brick weed" (generic country names removed to reduce false positives)
- Imported expanded to include "cali", "california"
- Hash: Moroccan, Mousse, Blonde, Charras, Bubble, TempleBall, Static, Frozen, Kief, Moonrocks, DrySift, Black, TripleFiltered, 120u, Piatella (includes Simpson Kush token at parent level). Parent keywords include 'hashish'.
- Tincture: Spray, Sublingual, LiveResin
- Vapes: Disposable, Cartridge, Distillate, LiveResin, Battery
- Concentrates: Wax, Shatter, Rosin, RSO, Oil, Sugar, Piatella, Distillates, Pots
- Edibles: Chocolate, Gummies, Capsules, Candy, Bars, ButterOil, Treats, InfusedOil, Spreads
- Edibles keywords now include `tablet` and `tablets`; child `Capsules` includes tablets.
- Psychedelics: Spirit, Paper, Mushrooms, Grow, Microdose
- Other: (mad honey, modafinil, blister, erectile, box, antibiotic, respiratory, doxycycline)

Notes:
- Overlapping tokens (e.g. 'live resin', 'distillate') appear across categories to allow context disambiguation via later rules.
- Tokens with embedded spaces or punctuation (e.g. "6*", " og ") rely on manual regex boundaries – test additions needed if modifying.

## Divergences vs index_plan.md (Outdated Elements)
- ScoreBoard not yet integrated into per-rule reasons (plan document envisioned usage earlier).
- Separate child keyword rule file (02-childKeywords.js) not created; base + child scoring consolidated in 01-baseKeywords.js.
- Proposed modular directories (env/, fetch/, persistence/, etc.) not all realized yet inside scripts/indexer/lib (some placeholders present but empty / future work).
- Documentation now centralized here instead of docs/categorization.md (not yet created).

## When Adding Tokens vs New Rule
- Add token to taxonomy only if it is an unambiguous category indicator or a common variant spelling.
- If token meaning depends on surrounding context (e.g. 'oil', 'sauce', 'sugar'), prefer a rule refinement with both positive & negative guards rather than a new taxonomy keyword.

## Heuristic Conflict Resolution Patterns
- Positive dominance: Add +N to target category AND subtract comparable amount from competing category to ensure tie-breaker not solely precedence-driven.
- Safe demotion: When removing a false positive (e.g., Concentrates from sugar/crystal Flower context), simultaneously boost the correct category to preserve stability when future neutral tokens are added.
- Guarded boosts: If ambiguous token present, require at least one strong co-token (multi-token threshold logic). Example: concentrateLatePrecedenceRule counts strongTokens and scales boost.

## Measuring Drift (Proposed)
- Maintain snapshot of category counts (public/data/manifest.json) and compare distribution deltas (Chi-square threshold) on each change; if large deviation without corresponding test updates, flag for review.
- Use ScoreBoard trace (once integrated) to detect newly dominant reason patterns after token additions.

## Future Safe Refactors
- Introduce a normalization phase (strip diacritics, collapse multiple spaces) before all regex tests to increase resilience.
- Precompile frequently used compound regex sets (strongConcDistinct etc.) outside rule functions to avoid re-instantiation cost.

## Open Technical Debt Items
- Bulk Distillate vs Vape: Implemented (07c-distillateBulkRefinement) – in absence of hardware tokens AND presence of bulk sizing / purity / syringe signals, favors Concentrates Distillates. Lives just before concentrateLatePrecedenceRule so earlier vape boosts can still assert when valid.
- Tincture Oral Wellness: Detect explicit ingestion disclaimers ("FOR ORAL APPLICATION ONLY", "DO NOT SMOKE OR VAPE") and force Tincture dominance when distillate + MCT + oral verbs present.
- Vape fallback contexts: HTFSE/Liquid Diamonds are used as vape shorthand and are now covered; continue to watch for false positives in non-vape diamond contexts.
- Edibles tablets: taxonomy and ingestion patterns updated; consider adding specific “Tablets” subcategory if future UI needs differentiation.

(Add completed implementations below this line when done.)

---

## Core Concepts
- Input text: lower‑cased concatenation of name + description ("base") and a padded version ("text") used for regex / boundary checks.
- Taxonomy: Declarative parent categories with keyword lists and child keyword groups (see scripts/indexer/lib/taxonomy/baseTaxonomy.js).
- Scores: Mutable numeric map (scores[Category] = points). Highest score wins; ties resolved by explicit precedence (90-precedenceResolution.js).
- Subcategories: Accumulated sets per category (subsByCat) only emitted for chosen primary category.
- Rule Pipeline: Deterministic ordered list (pipeline.js) where each rule may mutate scores or subcategory sets. Order matters; later rules can demote/override earlier logic. Early exit only after precedenceResolutionRule executes.

## Scoring Weights (Base Pass)
File: 01-baseKeywords.js
- Parent keyword exact word-boundary match: +2 points each occurrence (single pass; no multiplicity stacking beyond detection loop).
- Child keyword word-boundary match: +3 points and adds child subcategory.
- Tips category is explicitly excluded from being primary even though taxonomy lists its keywords.

## Fallback / Baseline Adjustments
File: 03-fallbackBoosts.js
- Hash token (+3), Flower token (+2), Edible token (+2), Vape tokens (vape/cart/cartridge/disposable) (+3).
- Mushrooms / psychedelic base triggers: +2 Psychedelics plus Mushrooms child.
- LSD / acid / DMT: additional +2 Psychedelics.
- Edible oil/spread boost: (coconut oil, canna nutella, cannabis nutella, nutella, canna honey, cannabis honey) +4 Edibles unless "mad honey" present.
- Mad honey: forces Other (+10) and strongly demotes Edibles (-8).

## Rule Sequence (Critical Ordering)
Defined in pipeline.js (RULE_SEQUENCE) and must stay consistent for expected behaviour:
1. baseKeywordsRule
2. fallbackBoostsRule
3. prerollRefinementRule
4. psychedelicOverridesRule
5. ediblesVsFlowerDisambiguationRule
6. hashEarlyOverridesRule
7. medicalEarlyRule
8. concentrateEarlyOverridesRule
9. antibioticLineageRule
10. vapeOverridesRule
11. templeBallsRule
12. concentrateMidOverridesRule
13. edibleSauceRefinementRule
14. ediblesFalsePositiveDemotionRule
15. hashPrecedenceRule
16. concentrateLatePrecedenceRule
17. distillateBulkRefinementRule
18. precedenceResolutionRule (final selection)

Changing insertion points can indirectly affect dozens of regression cases—add new narrow rules close to their most related existing stage (usually before late precedence adjustments).

## Category Precedence (Tie Break)
File: 90-precedenceResolution.js
Order: [Flower, Hash, Edibles, Concentrates, Vapes, Tincture, Psychedelics, Other]
- Highest numeric score wins. On tie, earlier precedence entry selected.
- Other requires explicit Other keyword presence; otherwise a null (uncategorized) result is produced if only Other scored.

## Major Rule Modules (Behavioural Summaries)

prerollRefinementRule (05b-prerollRefinement)
- Removes false PreRolls subcategory in contexts like shake / trim / dust / Thai Stick when listing not a true preroll.
- Demotes accidental Hash classification caused by moonrock mentions in preroll listings (keeps Flower + PreRolls).

psychedelicOverridesRule (04-psychedelicOverrides)
- Consolidates mushroom vs microdose tokens, dedupes overlapping psychedelic triggers, reduces false cross-category boosts.

ediblesVsFlowerDisambiguationRule (05-ediblesVsFlowerDisambiguation)
- Distinguishes dessert strain naming from true ingestion products (e.g., "cake" as strain vs edible). Demotes Edibles when only dessert strain words present and ingestion evidence is lacking.

hashEarlyOverridesRule / templeBallsRule / hashPrecedenceRule (06-hashOverrides)
- Early recognition of hash forms (temple balls, kief, dry sift etc.).
- Simpson Kush explicit boost (Hash).
- Precedence adjustments to ensure strongly hash-indicative listings are stabilized before concentrate / flower pushes.

concentrateEarlyOverridesRule (07-concentrateOverrides section)
- Crumble heuristic: if only "crumble" with strong flower signals and no other concentrate tokens, demote Concentrates to avoid false positives.

concentrateMidOverridesRule
- Distillate chocolate bar (distillate+edible candy tokens) -> redirect to Edibles (+6 plus potency scaling if mg present) while demoting Concentrates and Vapes.

edibleSauceRefinementRule (07b-edibleSauceRefinement)
- Disambiguates confection "sauce" descriptors (wonky/oompa/gourmet sauce) vs terp/live resin sauce (Concentrates). Protects concentrate context when terp tokens present; otherwise elevates Edibles.

vapeOverridesRule (08-vapeOverrides)
- Detects delivery hardware tokens (vape, cart, cartridge, disposable, pod, pen, ccell, 510 thread) and boosts Vapes (+6 baseline inside rule if hardware present, separate from fallback).
- Additional conditional +4 if cart tokens + resin/distillate tokens.
- Demotes incidental Concentrates score in pure vape contexts lacking strong dab tokens.
- Adds Vapes subcategories: Cartridge, Disposable, LiveResin, Distillate.
- Potency dominance: mg potency + ≥2 vape tokens -> +6 Vapes and demotes Flower/Concentrates; multiple strain names inside strong vape context adds more.
- Special cryo cured diamonds override forces Vapes over Concentrates.

medicalEarlyRule & antibioticLineageRule (09-medicalOverrides)
- Handles medical tokens (antibiotic, lineage terms) steering ambiguous listings to Other vs Flower.

ediblesFalsePositiveDemotionRule (10-ediblesFalsePositiveDemotion)
- Removes Edibles classification when only dessert strain vocabulary present (no ingestion evidence).
- Strengthens edible spread/oil dominance including special "cannabis coconut oil" boost.

concentrateLatePrecedenceRule (07-concentrateOverrides tail)
- Live resin tincture guard: If tincture word + live resin but no other strong concentrate terms, boost Tincture and demote Concentrates.
- Name-based strong concentrate booster (if listing name includes "concentrate").
- Sugar / crystal Flower context demotion: prevents sugar/crystalline adjectives from forcing Concentrates without other concentrate indicators.
- Generic concentrate boost vs Flower with guard rails:
    - Suppress boost in tincture context unless strong concentrate tokens.
    - Suppress/demote in edible ingestion context (gummy, chocolate, etc.) unless strong concentrate tokens present.
- Additional multi-strong-token scaling to push Concentrates above Flower as needed.

precedenceResolutionRule (90-precedenceResolution)
- Final selection and filtering of subcategories for chosen primary only.
- Guards Other.

## Taxonomy Highlights
- Flower children: include PreRolls detection; PreRolls removal refinements rely on earlier base tagging before refinement demotion.
- Hash extended with "simpson kush" (treated like a hash-specific token despite name overlap).
- Edibles includes spreads & infused oils; generic honey/nutella were previously removed to prevent false positives; now careful explicit canna/cannabis qualifiers plus targeted rule boosts fill the gap.
- Distillate tokens appear in both Vapes and Concentrates; disambiguation relies on hardware vs ingestion context plus late concentrate vs tincture logic.
- Tincture keywords intentionally include general ingestion words (oral, sublingual) to support live resin tincture guard.

## Known Recently Fixed Misclassifications (Regression Tests Added)
(See tests scripts/indexer/*)
- Concentrates mislabelled as Flower (Biscotti Wax/Resin, Zkittlez Concentrate) -> now Concentrates.
- Edible oils/spreads (cannabis coconut oil / nutella / honey) -> Edibles.
- Simpson Kush -> Hash.
- LSD “Lucy” gummies -> Psychedelics.Paper (not Edibles).
- Bulk D9 distillate (syringe/ml/CAT3/COA) -> Concentrates.Distillates (not Vapes/Edibles).
- Gummies infused with shatter/rosin/distillate -> Edibles (not Concentrates).
- HTFSE/Liquid Diamonds 2ml -> Vapes.LiveResin (not Flower).
- Crystalline items -> Concentrates (not Flower).
- 120u hash -> Hash (not Flower).
- Diamond infused flower -> Hash.Moonrocks (not Flower).
- THC Syrup -> Concentrates (not Flower).
- THC Tablets -> Edibles (not Flower/Concentrates).
- Multi-strain high-potency vape listing (e.g. THC VAPE 1000mg) -> Vapes.
- PreRoll false positives (shake/trim/dust, Thai Stick) removed.
- Flavor Packs Raw Cones with moonrocks mention -> Flower + PreRolls only (no Hash).
- Mad Honey -> Other.
- Sugar/crystalline strain adjectives remain Flower (UK Budget, Rainbow Sherbet, Runtz, Velvet Frost).
- Distillate chocolate bars & wonky sauce confections -> Edibles.
- Live resin tincture listing -> Tincture (not Concentrates).
- THC Gummies -> Edibles.

### Updates (2025-10-05)
Recent rule adjustments (implemented with accompanying regression tests) – this section documents only deltas since the last committed version of this file:

1. Hash Signal Expansion
    - Added plain `drysift` variant to late hash signal handling (previous taxonomy already listed DrySift as child but regex now matches single-word variant in broader contexts).
    - Ensures listings like “Premium Drysift” classify as Hash with DrySift subcategory; “triple filtered” pattern continues to surface TripleFiltered subcategory.

2. Vape Hardware & Quantity Heuristics (08-vapeOverrides.js)
    - Battery-only listings (no cart/distillate tokens) now recognized via tokens: `battery`, `batteries`, `buttonless`, `hands-free`, `palm pro`, `pure one` -> Vapes primary + Battery subcategory.
    - Multi-cart quantity detection added (patterns like `24x0.5ml`, `6x0.5ml`, `10 x 1ml`, `5x1g`, or `0.5 ml cartridges`) combined with a flavour / strain menu (gelato, zkittlez, kush, mimosa, grape, cake, nerdz, runtz, etc.) or explicit phrase `cartridges in stock` -> forces Vapes dominance with Cartridge subcategory.
    - Multi-cart booster now runs even if an earlier vape score exists (additive); adds proportional scaling based on number of distinct flavour/strain tokens (≥2 adds +3, ≥4 adds +6, plus stronger Flower demotion).
    - Additional list-style cues (`***`, `●`, bullet characters, hyphen lines) slightly reinforce vape dominance in multi-flavour menus.

3. Lemonchillo / Limoncello High-Alcohol Beverage Override (07-concentrateOverrides.js)
    - Strong pattern: `(lemonchillo|lemoncillo|limoncello|limonchello)` + either `40% alcohol` or potency mg (`\b\d{2,4} mg\b`) now classifies as Other (infused beverage) instead of Concentrates or Edibles.
    - Implementation sharply boosts Other (+12) and aggressively demotes Concentrates (-10) and Edibles (-6) to prevent drift back when concentrate tokens appear (e.g., `D9`).

4. Test Suite Additions / Adjustments
    - Added `test-user-listed-fixes-2.js` covering: Premium Drysift (Hash), two Buttonless Battery variants (Vapes.Battery), Lemonchillo beverage (Other), and multi-cart cartridge listings (Vapes.Cartridge dominance for `24x0.5ml cartridges`, `6x0.5ml`).
    - Updated `test-distillate-refinement.js` expectation for Lemonchillo from Concentrates -> Other.
    - Existing user-listed regression file (`test-user-listed-fixes.js`) remains green post changes.

5. Risk / Guard Notes
    - Multi-cart heuristic is intentionally aggressive; potential future false positives (e.g., non-vape bundle using similar `Nx0.5g` pattern) should add negative guards or require explicit vape/cart/cartridge tokens if encountered.
    - Beverage override heavily penalizes Concentrates; verify future genuine concentrate listings referencing limoncello terpenes without alcohol % are not unintentionally diverted (current regex requires alcohol % or mg potency plus beverage name variant, making this low risk).

Regression Goal: All new heuristics are now backed by explicit tests so future modifications to vape or concentrate rules must update or preserve these cases.

## Newly Reported (Pending) Misclassifications
Provided examples (2025‑09) indicate several pure distillate bulk listings misclassified as Vapes instead of Concentrates:
- "D9 Distillate - 98%+ 10ml-100ml" (+ variants)
- "Top Tier Cat 3 D9 Distillate - No pesticides..."
- "D9+Terpenes" / "D9 + Terp Syringes" fill-your-own hardware
- "1L of 96%THC D9 Distillate" (bulk ingredient)
- "D9 Distillate from California" (ingredient)
  Desired: Concentrates primary unless explicit vape hardware context (carts, cartridges, disposable devices) strongly present.

Tincture example needing correct Tincture classification:
- "Pumpjack wellness oil: THC & CBD" with explicit oral usage instructions and ingredients (MCT oil, distillate, terpenes) – should remain / become Tincture not Vapes or Concentrates.

These are not yet codified in tests; recommended to add a new test file (e.g. test-distillate-refinement.js) before adjusting rules:
- Cases: pure bulk distillate (expect Concentrates + Distillates subcategory), oral wellness oil (expect Tincture + maybe Sublingual/Spray if tokens appear), hardware fill instructions edge case (if strongly hardware oriented plus syringes maybe still Concentrates unless predominant vape cart hardware signals).

## Edge Case Handling Summary
- Generic "sauce" ambiguous; confection adjectives + absence of terp/live resin tokens tip to Edibles.
- Polysemy tokens (sugar, crystal) require negative list; future rare concentrate names may need explicit whitelist.
- Live resin tincture disambiguation prevents accidental Concentrates win when "live resin" appears inside ingestion product.
- PreRoll removal logic uses context phrases to avoid shake/trim auto-tagging.
- Mad honey forced to Other no matter edible-like tokens.

## Testing Strategy
Current test files (scripts/indexer/):
- test-flower-refine.js (targeted Flower expectation mapping)
- test-categorize-flower.js (sample Flower outputs)
- test-misclassifications.js (legacy base set)
- test-mushroom-edibles.js (psychedelic edible disambiguation)
- test-vape-overrides.js
- test-parse.js (quantity parsing; orthogonal)
- test-regress-flower-misclassifications.js (initial correction batch)
- test-preroll-refinement.js
- test-new-regressions.js (flavour packs, mad honey, sugar/crystal strains, chocolate bars)
- test-edible-sauce-refinement.js

Gap: No unified single source test aggregator referencing one canonical array of test cases (suggested improvement). test-all.js currently runs a fixed list—extend it when adding new test files.

## Adding a New Rule – Checklist
1. Write failing test(s) first capturing real-world misclassification examples.
2. Choose minimal insertion point in RULE_SEQUENCE respecting semantic phase:
    - Early base fix? Place just after fallbackBoosts.
    - Narrow category refinement? Place before late concentrate/tie-break steps.
3. Guard triggers with both positive AND negative conditions (avoid drift).
4. Add regression tests for both the corrected case and an adjacent near miss.
5. Run all tests (scripts/indexer/test-all.js) and ensure zero unexpected category shifts.
6. Update this document with rationale if rule introduces a new pattern class.

## Future Enhancements (from handover suggestions)
- Master regression test combining all case arrays (single JSON source reused by multiple test scripts).
- Debug CLI / ScoreBoard integration to emit per-rule delta trace for a given listing (scoreBoard scaffold: lib/categorize/scoreBoard.js currently unused in pipeline).
- Snapshot hashing of classification outputs to detect silent drift.
- Externalize heuristic weights (JSON or env-config) to adapt without code changes.
- Additional tests for:
    - "live resin tincture + distillate" hybrid names.
    - Negative test ensuring "terp sauce" never becomes Edibles even with candy adjectives present.

## Implementation Pointers
- Always search for existing token handling before adding new regex (grep across rules and taxonomy) to avoid duplication.
- When demoting a category, ensure to delete score if non-positive to maintain parity with existing patterns.
- Keep regex conservative (use word boundaries / explicit lists) unless intentional broad match.
- Subcategory sets: Only relevant for primary category—avoid reliance on cross-category subcategory leakage.

## Safety / Stability Guidelines
- Do not reorder RULE_SEQUENCE casually; instead create a new precise rule and insert minimally.
- Resist adding broad tokens to taxonomy; prefer rule-layer logic with context checks for ambiguous terms.
- For bulk ingredient vs hardware (distillate vs vape): treat hardware tokens as decisive only when *plus* potencies or multiple hardware mentions.
- Use mg potency patterns carefully; mg detection currently boosts Vapes in strong vape context—avoid making mg alone a cross-category indicator.

## Quick Reference – Token Classes (Non-Exhaustive)
- Strong Concentrate: wax, shatter, crumble, badder, batter, rosin, rso, diamonds, distillate, thca/thc-a, piatella, cold cure, slab, extract, live resin
- Weak / Ambiguous: sugar, crystal, sauce (unless terp/live resin), oil (needs context), concentrate(s) (generic)
- Edible Ingestion Indicators: gummy, gummies, chocolate, brownie, cereal bar, capsule(s), wonky bar, rope, nutella (canna/cannabis), honey (canna/cannabis), cannabutter, coconut oil (guarded), infused
- Tincture Indicators: tincture, sublingual, oral spray, oral, fast acting, live resin tincture
- Vape Hardware: vape, cart, carts, cartridge(s), disposable(s), device, pod(s), pen(s), battery, ccell, 510 (thread)

## Open Items (Actionable)
- Implement test + rule for oral wellness oil (tincture) with both distillate & MCT oil.
- Wire ScoreBoard logging option via debug CLI (scripts/debug-categorize.js could be extended) for transparency.

## Debugging Tips
- To explore classification quickly: use scripts/debug-categorize.js (if present) or create a small script requiring runCategorizationPipeline.
- Grep for a token (e.g., "distillate") across rules to see every influence point before modifying.
- After changes, inspect diff of public/data/items-*.json counts for unexpected category migrations.

---
Maintainer Note: Update this file whenever you:
- Introduce a new rule file
- Change scoring weights
- Expand taxonomy with ambiguous tokens
- Add a new class of regression tests

Failure to keep this document in sync will increase future rule brittleness and regression risk.
