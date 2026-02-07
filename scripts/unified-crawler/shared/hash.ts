/**
 * FNV-1a hash for stable URL-to-filename mapping.
 * Used by: image optimizer (R2 keys), index stage (image meta), frontend (src/lib/ui/images.ts)
 * All three MUST produce identical output for the same input.
 */
export function hashUrl(url: string): string {
  let hash = 2166136261;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
