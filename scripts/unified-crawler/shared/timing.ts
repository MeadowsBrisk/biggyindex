/** Elapsed seconds since `t0` (epoch ms), rounded to nearest integer. */
export const since = (t0: number): number => Math.round((Date.now() - t0) / 1000);
