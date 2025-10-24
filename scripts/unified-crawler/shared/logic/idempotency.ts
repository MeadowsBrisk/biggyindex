// Idempotency keys helper (stub)
export function idKey(step: string, payload: unknown): string {
  return `${step}:${stableStringify(payload)}`;
}

function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}
