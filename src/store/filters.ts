"use client";

/**
 * nuqs search params — URL-synced filter state.
 *
 * These define the URL query parameters for shareable, bookmarkable
 * filter state. Back-button friendly via nuqs.
 */

import { parseAsArrayOf, parseAsInteger, parseAsString } from "nuqs";

/** Category filter: ?cat=Flower */
export const categoryParam = parseAsString.withDefault("All");

/** Subcategory filter: ?sub=Gelato */
export const subcategoryParam = parseAsString.withDefault("All");

/** Search query: ?q=blue+cheese */
export const searchParam = parseAsString.withDefault("");

/** Sort key: ?sort=hottest */
export const sortParam = parseAsString.withDefault("hottest");

/** Min price (USD): ?pmin=10 */
export const priceMinParam = parseAsInteger.withDefault(0);

/** Max price (USD): ?pmax=100 */
export const priceMaxParam = parseAsInteger;

/** Selected sellers: ?sellers=seller1,seller2 */
export const sellersParam = parseAsArrayOf(parseAsString, ",");

/** Market code: ?market=GB */
export const marketParam = parseAsString.withDefault("GB");
