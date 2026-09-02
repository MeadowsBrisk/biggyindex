import { shipFromCode } from "@/lib/shipFrom";
import type { Item, ItemVariant } from "@/lib/types";
import {
  groupByQuantity,
  groupByWeight,
  itemVariantContext,
  type ParsedVariant,
  parseVariant,
  type QuantityGroup,
  type WeightGroup,
} from "@/lib/variants";

export interface ItemPpgVariant {
  grams: number;
  usd: number;
}

export interface ItemBrowseMeta {
  key: string;
  bookmarkKey: string;
  searchText: string;
  sellerId: string;
  shipFrom: string;
  weightBuckets: Set<number>;
  ppgVariants: ItemPpgVariant[];
  weightGroups: WeightGroup[] | null;
  quantityGroups: QuantityGroup[] | null;
  singleVariantParsed: ParsedVariant | null;
}

export type ItemIndex = Map<string, ItemBrowseMeta>;

/**
 * Sellers park out-of-stock listings by repricing every variant to a
 * placeholder amount. Matched exactly: genuine listings at or above it exist.
 */
const SENTINEL_USD_VALUES = [999, 999.99];

/** True when a USD amount is an out-of-stock placeholder rather than a price. */
export function isSentinelPrice(usd: number | null | undefined): boolean {
  return usd === 999 || usd === 999.99;
}

/** Parked out of stock: the crawler's `so` stamp, else every variant is a placeholder. */
export function isSoldOut(
  item: Pick<Item, "so" | "v"> | null | undefined,
): boolean {
  if (!item) return false;
  if (item.so === 1) return true;

  let priced = 0;
  for (const variant of item.v ?? []) {
    if (typeof variant.usd !== "number" || !Number.isFinite(variant.usd)) {
      continue;
    }
    priced++;
    if (!isSentinelPrice(variant.usd)) return false;
  }
  return priced > 0;
}

/** True when a single variant is parked out of stock. */
export function isVariantSoldOut(
  variant: Pick<ItemVariant, "so" | "usd"> | null | undefined,
): boolean {
  if (!variant) return false;
  return variant.so === 1 || isSentinelPrice(variant.usd);
}

/** A history snapshot taken while the listing was parked (older history still holds these). */
export function isSoldOutSnapshot(
  snapshot: { min: number; max: number } | null | undefined,
): boolean {
  if (!snapshot) return false;
  return isSentinelPrice(snapshot.min) && isSentinelPrice(snapshot.max);
}

/** Price history with parked-listing snapshots removed. */
export function realPriceHistory<T extends { min: number; max: number }>(
  history: T[] | null | undefined,
): T[] {
  return (history ?? []).filter((snapshot) => !isSoldOutSnapshot(snapshot));
}

export { SENTINEL_USD_VALUES };

const WEIGHT_BUCKETS = [1, 2, 3.5, 5, 7, 10, 14, 28, 56, 112] as const;

export function bucketGrams(grams: number): number {
  let bestBucket: number = WEIGHT_BUCKETS[0];
  let bestDistance = Math.abs(grams - bestBucket);

  for (let index = 1; index < WEIGHT_BUCKETS.length; index++) {
    const bucket = WEIGHT_BUCKETS[index];
    const distance = Math.abs(grams - bucket);
    if (distance < bestDistance) {
      bestBucket = bucket;
      bestDistance = distance;
    }
  }

  return bestBucket;
}

export function itemIndexKey(item: Item): string {
  return String(item.id);
}

export function buildItemIndex(items: Item[]): ItemIndex {
  const index: ItemIndex = new Map();
  for (const item of items) {
    index.set(itemIndexKey(item), buildItemBrowseMeta(item));
  }
  return index;
}

export function getItemBrowseMeta(
  itemIndex: ItemIndex | undefined,
  item: Item,
): ItemBrowseMeta {
  return itemIndex?.get(itemIndexKey(item)) ?? buildItemBrowseMeta(item);
}

function buildItemBrowseMeta(item: Item): ItemBrowseMeta {
  const weightBuckets = new Set<number>();
  const ppgVariants: ItemPpgVariant[] = [];
  const variants = item.v ?? [];
  const hasMultipleVariants = variants.length > 1;
  const variantContext = itemVariantContext(item);
  const weightGroups = hasMultipleVariants
    ? groupByWeight(variants, variantContext)
    : null;
  const quantityGroups =
    hasMultipleVariants && !weightGroups
      ? groupByQuantity(variants, variantContext)
      : null;
  const singleVariantParsed =
    !weightGroups && !quantityGroups && variants.length === 1 && variants[0].d
      ? parseVariant(variants[0], variantContext)
      : null;

  for (const variant of variants) {
    const parsed = parseVariant(variant, variantContext);
    if (parsed?.grams == null || parsed.grams <= 0) continue;

    weightBuckets.add(bucketGrams(parsed.grams));
    // Placeholder-priced variants carry no per-gram signal — including them
    // would rank a parked listing as though it cost hundreds per gram.
    if (variant.usd > 0 && !isVariantSoldOut(variant)) {
      ppgVariants.push({ grams: parsed.grams, usd: variant.usd });
    }
  }

  // Variant strain stamps join the searchable text: menu listings often
  // carry strains ONLY in their variants ("28g mochi", "3.5 g cherry pie"),
  // invisible to a name+description search.
  const variantStrains = new Set<string>();
  for (const variant of item.v ?? []) {
    if (variant.st) variantStrains.add(variant.st);
  }

  return {
    key: itemIndexKey(item),
    bookmarkKey: item.refNum ? String(item.refNum) : String(item.id),
    searchText:
      `${item.n} ${item.d ?? ""} ${item.sn ?? ""} ${[...variantStrains].join(" ")}`.toLowerCase(),
    sellerId: item.sid != null ? String(item.sid) : "",
    // Normalize via shipFromCode so the filter facet buckets are flag
    // codes (gb, nl, multi, unknown) — same key the card flag uses, so
    // selections stay consistent across UI surfaces. Falls back to the
    // raw lowercase value for genuinely unrecognised strings.
    shipFrom: shipFromCode(item.sf) ?? (item.sf ?? "").toLowerCase(),
    weightBuckets,
    ppgVariants,
    weightGroups,
    quantityGroups,
    singleVariantParsed,
  };
}
