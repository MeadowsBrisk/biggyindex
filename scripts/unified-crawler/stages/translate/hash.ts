import crypto from 'crypto';

/**
 * Compute a stable hash of the source content for change detection.
 * Only re-translate when this hash changes.
 */
export function computeSourceHash(name: string, description: string): string {
  const normalized = `${(name || '').trim()}|${(description || '').trim()}`;
  return crypto.createHash('sha1').update(normalized, 'utf8').digest('hex');
}

/**
 * Estimate character count for translation API budgeting.
 * Returns the combined length of name + description.
 */
export function estimateCharCount(name: string, description: string): number {
  return (name || '').length + (description || '').length;
}
