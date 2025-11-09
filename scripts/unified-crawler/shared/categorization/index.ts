// Categorization facade (TS parity pipeline). Imports unified RULE_SEQUENCE orchestrator.

export interface CategorizationResult {
  primary?: string;
  subcategories?: string[];
}

export function categorize(name: string, description: string): CategorizationResult {
  try {
    const { runCategorizationPipelineTS } = require('./pipeline'); // parity pipeline
    const res = runCategorizationPipelineTS(name || '', description || '') || {};
    return {
      primary: typeof res.primary === 'string' && res.primary ? res.primary : undefined,
      subcategories: Array.isArray(res.subcategories) ? res.subcategories.filter(Boolean) : undefined,
    };
  } catch {
    return {};
  }
}
