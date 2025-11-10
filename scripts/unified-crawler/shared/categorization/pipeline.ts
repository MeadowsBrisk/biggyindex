import { createContext, type CatContext } from './types';
import { TAXONOMY } from './baseTaxonomy';

// Rules (TS parity ports)
import { baseKeywordsRule } from './rules/01-baseKeywords';
import { fallbackBoostsRule } from './rules/03-fallbackBoosts';
import { prerollRefinementRule } from './rules/05b-prerollRefinement';
import { psychedelicOverridesRule } from './rules/04-psychedelicOverrides';
import { ediblesVsFlowerDisambiguationRule } from './rules/05-ediblesVsFlowerDisambiguation';
import { hashEarlyOverridesRule, templeBallsRule, hashPrecedenceRule } from './rules/06-hashOverrides';
import { concentrateEarlyOverridesRule, concentrateMidOverridesRule, concentrateLatePrecedenceRule } from './rules/07-concentrateOverrides';
import { edibleSauceRefinementRule } from './rules/07b-edibleSauceRefinement';
import { vapeOverridesRule } from './rules/08-vapeOverrides';
import { medicalEarlyRule, antibioticLineageRule } from './rules/09-medicalOverrides';
import { ediblesFalsePositiveDemotionRule } from './rules/10-ediblesFalsePositiveDemotion';
import { seedsListingsRule } from './rules/11-seedsListings';
import { distillateBulkRefinementRule } from './rules/07c-distillateBulkRefinement';
import { otherParaphernaliaRule } from './rules/12-otherParaphernalia';
import { precedenceResolutionRule } from './rules/90-precedenceResolution';

export type RuleFn = (ctx: CatContext) => void;

export const RULE_SEQUENCE: RuleFn[] = [
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
  hashPrecedenceRule,
  distillateBulkRefinementRule,
  concentrateLatePrecedenceRule,
  otherParaphernaliaRule,
  precedenceResolutionRule,
];

export function runCategorizationPipelineTS(name: string, description: string) {
  const ctx = createContext(name || '', description || '');
  // Ensure taxonomy reference present (redundant but explicit)
  (ctx as any).TAXONOMY = TAXONOMY;
  for (const rule of RULE_SEQUENCE) {
    try { rule(ctx); } catch { /* fail-soft */ }
    if (ctx.result && rule === precedenceResolutionRule) break;
  }
  return ctx.result || { primary: null, subcategories: [] };
}

export default runCategorizationPipelineTS;
