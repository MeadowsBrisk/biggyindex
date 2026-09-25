import { isSentinelPrice, isSoldOut } from "@/lib/browse/item-index";
import { CATEGORIES } from "@/lib/constants";
import { decodeEntities } from "@/lib/format";
import { toHomeCard } from "@/lib/home/feed";
import { getItemPrimaryImage } from "@/lib/images";
import { isOffWall } from "@/lib/off-wall";
import type { HomeFeedTabItem, HomeFeedTabs, Item } from "@/lib/types";

const FEATURED = 3;

export interface HeroStatValues {
  listings: number;
  sellers: number;
  newThisWeek: number;
  priceDrops: number;
}

export type LeafListingKind = "new" | "drop" | "cheap";

/** Prices are USD; `at` is set for new and drop rows only. */
export interface LeafListing {
  ref: string;
  n: string;
  s: string | null;
  img: string | null;
  u: number | null;
  was: number | null;
  k: LeafListingKind;
  at: string | null;
}

export interface LeafCategory {
  c: string;
  cnt: number;
  sellers: number;
  min: number | null;
  med: number | null;
  top: string | null;
  newCnt: number;
  dropCnt: number;
  feat: LeafListing[];
}

export interface LeafData {
  seed: string;
  cats: LeafCategory[];
  feat: LeafListing[];
}

function fromTab(item: HomeFeedTabItem, k: LeafListingKind): LeafListing {
  const card = toHomeCard(item);
  return {
    ref: card.ref,
    n: decodeEntities(card.name),
    s: card.seller,
    img: card.image,
    u: card.priceMin,
    was: k === "drop" ? card.was : null,
    k,
    at: card.at,
  };
}

function fromItem(item: Item): LeafListing {
  return {
    ref: String(item.refNum ?? item.id),
    n: decodeEntities(item.n),
    s: item.sn ?? null,
    img: getItemPrimaryImage(item, "thumb", { forceStatic: true }) ?? null,
    u: item.uMin ?? null,
    was: null,
    k: "cheap",
    at: null,
  };
}

function price(item: Item): number | null {
  const u = item.uMin;
  return typeof u === "number" &&
    Number.isFinite(u) &&
    u > 0 &&
    !isSentinelPrice(u)
    ? u
    : null;
}

function pickFeatured(
  fresh: HomeFeedTabItem[],
  drops: HomeFeedTabItem[],
  cheapest: Item[],
): LeafListing[] {
  const out: LeafListing[] = [];
  const seen = new Set<string>();
  const add = (row: LeafListing) => {
    if (out.length >= FEATURED || seen.has(row.ref)) return;
    seen.add(row.ref);
    out.push(row);
  };
  for (const item of fresh) add(fromTab(item, "new"));
  for (const item of drops) add(fromTab(item, "drop"));
  for (const item of cheapest) add(fromItem(item));
  return out;
}

/** Per-category leaf and card figures; `tabs` must already exclude off-wall sellers. */
export function buildLeafData({
  seed,
  categoryCounts,
  tabs,
  items,
  offWallSellers,
  weekAgo,
}: {
  seed: string;
  categoryCounts: { name: string; count: number }[];
  tabs: HomeFeedTabs;
  items: Item[];
  offWallSellers: ReadonlySet<string>;
  weekAgo: number;
}): LeafData {
  const inStock = items
    .filter(
      (item) =>
        item.c &&
        !isOffWall(item) &&
        !(item.sid != null && offWallSellers.has(String(item.sid))) &&
        !isSoldOut(item) &&
        price(item) != null,
    )
    .sort((a, b) => (price(a) ?? 0) - (price(b) ?? 0));
  const thisWeek = tabs.new.filter((item) => {
    const at = Date.parse(item.at ?? item.fsa ?? "");
    return Number.isFinite(at) && at >= weekAgo;
  });
  const fresh = thisWeek.filter((item) => !toHomeCard(item).soldOut);
  const drops = tabs.drops.filter(
    (item) =>
      !toHomeCard(item).soldOut &&
      item.was != null &&
      item.uMin != null &&
      item.was > item.uMin,
  );

  const countOf = new Map(categoryCounts.map((c) => [c.name, c.count]));
  const order = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]));
  const cats = CATEGORIES.filter((c) => (countOf.get(c) ?? 0) > 0)
    .map((c): LeafCategory => {
      const own = inStock.filter((item) => item.c === c);
      const bySeller = new Map<string, number>();
      for (const item of own) {
        if (item.sn) bySeller.set(item.sn, (bySeller.get(item.sn) ?? 0) + 1);
      }
      const top =
        [...bySeller.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        )[0]?.[0] ?? null;

      return {
        c,
        cnt: countOf.get(c) ?? 0,
        sellers: new Set(own.map((item) => item.sid ?? item.sn)).size,
        min: own.length ? price(own[0]) : null,
        med: own.length ? price(own[Math.floor(own.length / 2)]) : null,
        top,
        newCnt: thisWeek.filter((item) => item.c === c).length,
        dropCnt: tabs.drops.filter((item) => item.c === c).length,
        feat: pickFeatured(
          fresh.filter((item) => item.c === c),
          drops.filter((item) => item.c === c),
          own,
        ),
      };
    })
    .sort(
      (a, b) => b.cnt - a.cnt || (order.get(a.c) ?? 0) - (order.get(b.c) ?? 0),
    );

  return { seed, cats, feat: pickFeatured(fresh, drops, inStock) };
}
