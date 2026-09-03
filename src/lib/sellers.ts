/** Shared seller-count rules. */

import type { Seller } from "./types";

/**
 * "Active" = the seller has at least one live listing in this market.
 *
 * The home page hero and the /sellers header both quote an active-seller
 * count. They read the same per-market `sellers.json`, but each used to apply
 * its own rule (or quote a number precomputed elsewhere), so the two surfaces
 * could disagree about the same market at the same moment. One definition,
 * applied to one source, is what keeps them honest.
 *
 * `itemsCount` is the crawler's per-market listing count for the seller, so a
 * seller who has emptied their store or stopped shipping here drops out.
 */
export function isActiveSeller(seller: Seller): boolean {
  return (seller.itemsCount ?? 0) > 0;
}

/** Number of sellers with at least one live listing in this market. */
export function countActiveSellers(sellers: Seller[]): number {
  return sellers.reduce((total, s) => total + (isActiveSeller(s) ? 1 : 0), 0);
}
