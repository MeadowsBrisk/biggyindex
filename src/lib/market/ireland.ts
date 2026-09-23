/**
 * Ordering facts for the IE edition, read off the IE catalogue (postage and
 * arrival times there are market-scoped, not copies of the GB values).
 *
 * Aggregated one seller, one vote: `rs.days` is stamped per seller onto each
 * of their listings, so a per-listing median would measure catalogue size.
 */

import { cacheLife, cacheTag } from "next/cache";
import { loadItems } from "@/lib/data";
import { withoutOffWall } from "@/lib/off-wall";
import { median } from "@/lib/prices/stats";
import type { Item } from "@/lib/types";

/** Below this many sellers a median says more about the sample than the market. */
const MIN_SELLERS = 3;

export interface IrelandOrderingFacts {
  /** Sellers with at least one listing that ships to Ireland. */
  sellers: number;
  /** Listings indexed for Ireland. */
  listings: number;
  /** Listings that publish a postage price. */
  listingsWithShipping: number;
  /** Median seller postage to Ireland in USD, or null when too thin to quote. */
  shippingUsd: number | null;
  /** Median reported days to arrive in Ireland, or null when too thin to quote. */
  deliveryDays: number | null;
  /** Sellers behind `deliveryDays`. */
  deliverySellers: number;
}

/** Group a per-listing figure by seller, then take the median of seller medians. */
function medianAcrossSellers(perSeller: Map<string, number[]>): number | null {
  if (perSeller.size < MIN_SELLERS) return null;
  return median([...perSeller.values()].map(median));
}

export function computeIrelandOrderingFacts(
  allItems: Item[],
): IrelandOrderingFacts | null {
  const items = withoutOffWall(allItems);
  if (items.length === 0) return null;

  const sellers = new Set<string>();
  const postageBySeller = new Map<string, number[]>();
  const daysBySeller = new Map<string, number[]>();
  let listingsWithShipping = 0;

  for (const item of items) {
    const sellerId = item.sid == null ? null : String(item.sid);
    if (sellerId) sellers.add(sellerId);

    // A zero floor is a combined-order or spend-threshold option, not the
    // price of posting one parcel to Ireland — quoting it as postage would
    // read as "free shipping" to someone it will never apply to.
    const postage = item.sh?.min;
    if (typeof postage === "number" && postage > 0) {
      listingsWithShipping++;
      if (sellerId) {
        postageBySeller.set(sellerId, [
          ...(postageBySeller.get(sellerId) ?? []),
          postage,
        ]);
      }
    }

    const days = item.rs?.days;
    if (sellerId && typeof days === "number" && days > 0) {
      daysBySeller.set(sellerId, [...(daysBySeller.get(sellerId) ?? []), days]);
    }
  }

  return {
    sellers: sellers.size,
    listings: items.length,
    listingsWithShipping,
    shippingUsd: medianAcrossSellers(postageBySeller),
    deliveryDays: medianAcrossSellers(daysBySeller),
    deliverySellers: daysBySeller.size,
  };
}

/**
 * Cached wrapper. Carries the 'items' profile and tag so the numbers roll
 * over with the catalogue that produced them, whichever page embeds them.
 */
export async function loadIrelandOrderingFacts(): Promise<IrelandOrderingFacts | null> {
  "use cache";
  cacheLife("items");
  cacheTag("items");

  return computeIrelandOrderingFacts(await loadItems("ie"));
}
