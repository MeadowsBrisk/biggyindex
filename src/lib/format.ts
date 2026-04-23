/** Format a price value with currency symbol and rate conversion. */
export function fmtPrice(
  val: number | null | undefined,
  sym: string,
  rate: number,
): string {
  if (val == null) return "N/A";
  return `${sym}${(val * rate).toFixed(2)}`;
}

/** Format a price change between two values. Returns e.g. "↓ 15%" or "↑ 8%", or null if equal. */
export function formatPriceChange(
  oldPrice: number,
  newPrice: number,
): string | null {
  if (oldPrice === newPrice || oldPrice <= 0) return null;
  const pct = Math.round(Math.abs(((newPrice - oldPrice) / oldPrice) * 100));
  if (pct === 0) return null;
  return newPrice < oldPrice ? `↓ ${pct}%` : `↑ ${pct}%`;
}

/** Format ISO string as "17 Feb 2026, 14:30" (en-GB). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
