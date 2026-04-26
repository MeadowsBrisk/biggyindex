import type { Item } from "@/lib/types";
import {
  groupByQuantity,
  groupByWeight,
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
  const weightGroups = hasMultipleVariants ? groupByWeight(variants) : null;
  const quantityGroups =
    hasMultipleVariants && !weightGroups ? groupByQuantity(variants) : null;
  const singleVariantParsed =
    !weightGroups && !quantityGroups && variants.length === 1 && variants[0].d
      ? parseVariant(variants[0])
      : null;

  for (const variant of variants) {
    const parsed = parseVariant(variant);
    if (parsed?.grams == null || parsed.grams <= 0) continue;

    weightBuckets.add(bucketGrams(parsed.grams));
    if (variant.usd > 0) {
      ppgVariants.push({ grams: parsed.grams, usd: variant.usd });
    }
  }

  return {
    key: itemIndexKey(item),
    bookmarkKey: item.refNum ? String(item.refNum) : String(item.id),
    searchText: `${item.n} ${item.d ?? ""} ${item.sn ?? ""}`.toLowerCase(),
    sellerId: item.sid != null ? String(item.sid) : "",
    shipFrom: (item.sf ?? "").toLowerCase(),
    weightBuckets,
    ppgVariants,
    weightGroups,
    quantityGroups,
    singleVariantParsed,
  };
}
