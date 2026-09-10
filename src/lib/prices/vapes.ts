/**
 * Vape-cart price medians, in USD.
 *
 * Carts are sold per device, never by weight, so they get their own
 * computation rather than being folded into the per-gram tables. /prices
 * renders the full tile set and the vapes category page quotes the single
 * 1ml figure — both call in here so the two can never disagree.
 */

import { median, SENTINEL_USD } from "@/lib/prices/stats";
import type { Item, ItemVariant } from "@/lib/types";

/** Battery/hardware rows inside vape listings — never device prices. */
const VAPE_ACCESSORY_RE =
  /\bbatter(?:y|ies)\b|\bcharger\b|\bkit\b|\bjuice\b|\bvaporizer\b/i;

/** Device sizes (ml ≡ g for carts) the tiles recognise. */
const VAPE_SIZES = new Set([0.5, 1, 1.25, 2]);

/** Sizes quoted, in render order. */
const TILE_SIZES = [1, 0.5];

/** A size needs this many distinct listings before its median means anything. */
const MIN_TILE_LISTINGS = 3;

/** The reference cart size — what "a cart costs X" means without a qualifier. */
export const STANDARD_CART_ML = 1;

export interface VapeTile {
  /** Device size in ml-equivalent (sellers list 1g and 1ml interchangeably). */
  size: number;
  /** Median of per-listing median single-device prices, USD. */
  median: number;
  items: number;
  sellers: number;
}

/**
 * Single-device size in ml-equivalent, or null. Sellers list 1g and 1ml
 * carts interchangeably, so stamped grams and ml resolve to one scale.
 * Pack rows (ol "N×Mml" with N>1) are excluded — the tiles quote what one
 * cart costs, not a divided bundle price.
 */
function vapeDeviceSize(v: ItemVariant): number | null {
  if (VAPE_ACCESSORY_RE.test(v.d ?? "")) return null;
  const packMatch = v.ol?.match(/^(\d+)×[\d.]+ml$/);
  if (packMatch && parseInt(packMatch[1], 10) > 1) return null;
  if (typeof v.g === "number" && VAPE_SIZES.has(v.g)) return v.g;
  if (v.u === "ml" && typeof v.q === "number" && VAPE_SIZES.has(v.q)) {
    return v.q;
  }
  return null;
}

export function buildVapeTiles(items: Item[]): VapeTile[] {
  // size → per-item single-device prices, plus seller ids per size.
  const bySize = new Map<
    number,
    { perItem: Map<string, number[]>; sellers: Set<string> }
  >();
  for (const item of items) {
    if (item.c !== "Vapes") continue;
    for (const v of item.v ?? []) {
      if (typeof v.usd !== "number" || v.usd <= 0 || v.usd === SENTINEL_USD)
        continue;
      const size = vapeDeviceSize(v);
      if (size == null) continue;
      let entry = bySize.get(size);
      if (!entry) {
        entry = { perItem: new Map(), sellers: new Set() };
        bySize.set(size, entry);
      }
      const key = String(item.refNum ?? item.id);
      const prices = entry.perItem.get(key) ?? [];
      prices.push(v.usd);
      entry.perItem.set(key, prices);
      if (item.sid != null) entry.sellers.add(String(item.sid));
    }
  }

  // Median of per-listing medians, so one long menu is one vote.
  return TILE_SIZES.map((size) => {
    const entry = bySize.get(size);
    if (!entry || entry.perItem.size < MIN_TILE_LISTINGS) return null;
    const itemMedians = [...entry.perItem.values()].map(median);
    return {
      size,
      median: median(itemMedians),
      items: entry.perItem.size,
      sellers: entry.sellers.size,
    };
  }).filter((tile): tile is VapeTile => tile !== null);
}

/**
 * Median USD price of one cart at `size`, or null when too few listings
 * carry a usable device price to quote a figure.
 */
export function vapeCartMedianUsd(
  items: Item[],
  size: number = STANDARD_CART_ML,
): number | null {
  return (
    buildVapeTiles(items).find((tile) => tile.size === size)?.median ?? null
  );
}
