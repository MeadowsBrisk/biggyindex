/**
 * Numeric primitives shared by every surface that quotes a price median.
 *
 * /prices and the category landing pages read the same catalogue, so the
 * quantile rule and the sold-out sentinel live in one place rather than
 * being restated (and allowed to drift) per page.
 */

/** Sellers use 999 as a "sold out" placeholder, not a price. */
export const SENTINEL_USD = 999;

/** Linear-interpolated quantile over an ALREADY ascending array. */
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Median of an arbitrarily ordered set; the input is not mutated. */
export function median(values: number[]): number {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}
