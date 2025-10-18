// Categorization pipeline orchestrator (Phase 2 Step 10)
// Runs rule modules in deterministic order and returns { primary, subcategories }
// NOTE: Aims for behaviour parity with previous inline logic in index-items.js

const { TAXONOMY } = require('../taxonomy/baseTaxonomy');
const { baseKeywordsRule } = require('./rules/01-baseKeywords');
const { fallbackBoostsRule } = require('./rules/03-fallbackBoosts');
const { prerollRefinementRule } = require('./rules/05b-prerollRefinement');
const { psychedelicOverridesRule } = require('./rules/04-psychedelicOverrides');
const { ediblesVsFlowerDisambiguationRule } = require('./rules/05-ediblesVsFlowerDisambiguation');
const { hashEarlyOverridesRule, templeBallsRule, hashPrecedenceRule } = require('./rules/06-hashOverrides');
const { concentrateEarlyOverridesRule, concentrateMidOverridesRule, concentrateLatePrecedenceRule } = require('./rules/07-concentrateOverrides');
const { edibleSauceRefinementRule } = require('./rules/07b-edibleSauceRefinement');
const { vapeOverridesRule } = require('./rules/08-vapeOverrides');
const { medicalEarlyRule, antibioticLineageRule } = require('./rules/09-medicalOverrides');
const { ediblesFalsePositiveDemotionRule } = require('./rules/10-ediblesFalsePositiveDemotion');
const { precedenceResolutionRule } = require('./rules/90-precedenceResolution');
const { seedsListingsRule } = require('./rules/11-seedsListings');
const { distillateBulkRefinementRule } = require('./rules/07c-distillateBulkRefinement');
const { otherParaphernaliaRule } = require('./rules/12-otherParaphernalia');

function escapeRegExp(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Ordered execution matching legacy semantics
const RULE_SEQUENCE = [
  baseKeywordsRule,
  fallbackBoostsRule,
  prerollRefinementRule,
  psychedelicOverridesRule,
  ediblesVsFlowerDisambiguationRule,
  hashEarlyOverridesRule,
  medicalEarlyRule,
  concentrateEarlyOverridesRule,
  antibioticLineageRule,
  vapeOverridesRule,
  templeBallsRule,
  concentrateMidOverridesRule,
  edibleSauceRefinementRule,
  ediblesFalsePositiveDemotionRule,
  seedsListingsRule,
  hashPrecedenceRule,            // precedence adjustments before final resolution
  distillateBulkRefinementRule, // NEW: bulk distillate vs vape hardware & oral wellness disambiguation
  concentrateLatePrecedenceRule, // idem
  otherParaphernaliaRule,      // NEW: paraphernalia like Bongs (title-only), placed last to override product-category noise
  precedenceResolutionRule       // sets ctx.result
];

function runCategorizationPipeline(name, description) {
  const base = `${name || ''} ${description || ''}`.toLowerCase();
  const text = ` ${base} `; // padded for simpler word boundary includes
  const scores = {};
  const subsByCat = {};
  const ctx = { name, description, base, text, TAXONOMY, scores, subsByCat, escapeRegExp, result: null };
  for (const rule of RULE_SEQUENCE) {
    try { rule(ctx); } catch (e) { /* fail-soft: continue other rules */ }
    // Early exit if final result already decided (precedenceResolutionRule executed)
    if (ctx.result && rule === precedenceResolutionRule) break;
  }
  return ctx.result || { primary: null, subcategories: [] };
}

module.exports = { runCategorizationPipeline, RULE_SEQUENCE };
