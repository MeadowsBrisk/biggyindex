// Bounded concurrency helper
export async function mapWithLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<(R | null)[]> {
  const results: (R | null)[] = [];
  const errors: { index: number; error: unknown }[] = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        errors.push({ index: i, error: e });
        results[i] = null;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  if (errors.length > 0) {
    console.warn(`[concurrency] ${errors.length}/${items.length} items failed`);
    for (const { index, error } of errors.slice(0, 5)) {
      console.warn(`[concurrency]   item[${index}]: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return results;
}
