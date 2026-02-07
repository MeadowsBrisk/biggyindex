/**
 * Lightweight logger factory for Netlify functions.
 *
 * Replaces the copy-pasted `const log/warn/err = (m) => console.X(...)` pattern
 * with a single `createFnLogger('crawler:items')` call.
 */
export function createFnLogger(prefix: string) {
  return {
    log: (m: string) => console.log(`[${prefix}] ${m}`),
    warn: (m: string) => console.warn(`[${prefix}] ${m}`),
    error: (m: string) => console.error(`[${prefix}] ${m}`),
  };
}
