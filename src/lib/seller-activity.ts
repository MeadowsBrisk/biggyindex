/** Seller activity warnings: quiet sellers and clusters of recent negative reviews. */

import type { Item, Seller, SellerNegativeReviews, SellerQuiet } from "./types";

// Listed sellers are always online within ~2 days (LB drops the rest), so quiet is judged by buyer reviews and listing edits.
export const QUIET_AFTER_DAYS = 14;
export const NEGATIVE_REVIEW_WINDOW = 10;
export const NEGATIVE_REVIEW_MIN = 3;
// Same cut as the crawler's lifetime negativeCount.
export const NEGATIVE_RATING_MAX = 5;

const DAY_MS = 86_400_000;

export interface SellerReviewStamps {
  /** When the review data was generated; "days since" is measured against this, never the clock. */
  asOf: number | null;
  lastReview: Record<string, number>;
}

export const EMPTY_REVIEW_STAMPS: SellerReviewStamps = {
  asOf: null,
  lastReview: {},
};

interface ListingStamps {
  asOf: number | null;
  lastListing: Map<string, number>;
}

function parseStamp(raw: string | null | undefined): number {
  const ms = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function listingStamps(items: Item[]): ListingStamps {
  const lastListing = new Map<string, number>();
  let asOf = 0;
  for (const item of items) {
    if (item.sid == null) continue;
    const activity = Math.max(parseStamp(item.lua), parseStamp(item.fsa));
    if (!activity) continue;
    const sid = String(item.sid);
    if (activity > (lastListing.get(sid) ?? 0)) lastListing.set(sid, activity);
    if (activity > asOf) asOf = activity;
  }
  return { asOf: asOf || null, lastListing };
}

function sellerQuiet(
  sellerId: string,
  reviews: SellerReviewStamps,
  listings: ListingStamps,
): SellerQuiet | null {
  const lastReview = reviews.lastReview[sellerId];
  const lastListing = listings.lastListing.get(sellerId);
  if (
    reviews.asOf == null ||
    listings.asOf == null ||
    lastReview == null ||
    lastListing == null
  ) {
    return null;
  }
  const reviewDays = Math.floor((reviews.asOf - lastReview) / DAY_MS);
  const listingDays = Math.floor((listings.asOf - lastListing) / DAY_MS);
  if (reviewDays < QUIET_AFTER_DAYS || listingDays < QUIET_AFTER_DAYS) {
    return null;
  }
  return { reviewDays, listingDays };
}

export function withQuietSellers(
  sellers: Seller[],
  items: Item[],
  reviews: SellerReviewStamps,
): Seller[] {
  const listings = listingStamps(items);
  return sellers.map((seller) => {
    const quiet = sellerQuiet(String(seller.id), reviews, listings);
    return quiet ? { ...seller, quiet } : seller;
  });
}

export function recentNegativeReviews(
  reviews: ReadonlyArray<{ rating?: number | null; created?: number | null }>,
): SellerNegativeReviews | null {
  const recent = reviews
    .filter(
      (review): review is { rating: number; created: number } =>
        typeof review?.rating === "number" &&
        Number.isFinite(review.rating) &&
        typeof review.created === "number",
    )
    .sort((a, b) => b.created - a.created)
    .slice(0, NEGATIVE_REVIEW_WINDOW);
  const negative = recent.filter(
    (review) => review.rating <= NEGATIVE_RATING_MAX,
  ).length;
  return negative >= NEGATIVE_REVIEW_MIN
    ? { negative, total: recent.length }
    : null;
}
