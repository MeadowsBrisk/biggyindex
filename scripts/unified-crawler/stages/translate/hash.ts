import crypto from 'crypto';

/** Variant structure (minimal for hash/estimate) */
export interface VariantForHash {
  vid?: string | number;
  d: string;
}

/**
 * Compute a stable hash of the source content for change detection.
 * Only re-translate name/description when this hash changes.
 * NOTE: Variants are NOT included in hash - they're handled separately to avoid
 * invalidating existing translations when adding variant support.
 */
export function computeSourceHash(name: string, description: string): string {
  const normalized = `${(name || '').trim()}|${(description || '').trim()}`;
  return crypto.createHash('sha1').update(normalized, 'utf8').digest('hex');
}

/**
 * Estimate character count for translation API budgeting.
 * Returns the combined length of name + description + variants.
 */
export function estimateCharCount(name: string, description: string, variants?: VariantForHash[]): number {
  let total = (name || '').length + (description || '').length;
  
  if (variants && variants.length > 0) {
    for (const v of variants) {
      total += (v.d || '').length;
    }
  }
  
  return total;
}
