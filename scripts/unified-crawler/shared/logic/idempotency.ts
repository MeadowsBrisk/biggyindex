// Idempotency keys helper (stub)
export function idKey(step: string, payload: unknown): string {
  return `${step}:${stableStringify(payload)}`;
}

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return JSON.stringify(obj.map(stableStringify));
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}
