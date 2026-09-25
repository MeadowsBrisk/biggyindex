import { isSentinelPrice } from "@/lib/browse/item-index";
import { getItemGalleryImages, getSellerImageUrl } from "@/lib/images";
import { isOffWall } from "@/lib/off-wall";
import type {
  HomeFeed,
  HomeFeedEvent,
  HomeFeedTabItem,
  HomeFeedTabs,
} from "@/lib/types";

const EMPTY_TABS: HomeFeedTabs = { new: [], drops: [], restock: [] };

/** Pre-shaped card for the home strip (images resolved on the server). */
export interface HomeCardItem {
  id: string | number;
  ref: string;
  name: string;
  image: string | null;
  images: string[] | null;
  priceMin: number | null;
  priceMax: number | null;
  /** Previous uMin (USD) on a price drop */
  was: number | null;
  soldOut: boolean;
  seller: string | null;
  sellerId: number | null;
  sellerImageUrl: string | null;
  category: string | null;
  /** Event timestamp (listed / dropped / restocked) */
  at: string | null;
  hotness: number | null;
  reviewStats: { avg?: number | null; cnt?: number | null } | null;
}

export function toHomeCard(item: HomeFeedTabItem): HomeCardItem {
  const gallery = getItemGalleryImages(item, "thumb", { forceStatic: true });
  return {
    id: item.id,
    ref: String(item.refNum ?? item.id),
    name: item.n,
    image: gallery[0] ?? null,
    images: gallery.length > 0 ? gallery : null,
    priceMin: item.uMin ?? null,
    priceMax: item.uMax ?? null,
    was: item.was ?? null,
    // Cards carry bounds but no variants, so the sentinel check reads the bounds themselves.
    soldOut:
      item.so === 1 ||
      (isSentinelPrice(item.uMin) && isSentinelPrice(item.uMax)),
    seller: item.sn ?? null,
    sellerId: item.sid ?? null,
    sellerImageUrl: getSellerImageUrl(item.si) ?? null,
    category: item.c ?? null,
    at: item.at ?? item.fsa ?? null,
    hotness: item.h ?? null,
    reviewStats: item.rs ?? null,
  };
}

/** Tab lists with off-wall sellers removed; missing blocks read as empty. */
export function homeTabs(
  feed: HomeFeed,
  offWallSellers: ReadonlySet<string>,
): HomeFeedTabs {
  const clean = (list: HomeFeedTabItem[] | undefined | null) =>
    (list ?? []).filter(
      (item) =>
        !isOffWall(item) &&
        (item.sid == null || !offWallSellers.has(String(item.sid))),
    );
  const tabs = feed.tabs;
  if (!tabs) return EMPTY_TABS;
  return {
    new: clean(tabs.new),
    drops: clean(tabs.drops),
    restock: clean(tabs.restock),
  };
}

function ms(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Ticker stream: newest first, one entry per item, at most 12. Pure, so it may run during render. */
export function homeEvents(
  feed: HomeFeed,
  offWallSellers: ReadonlySet<string>,
): HomeFeedEvent[] {
  const raw = (feed.events ?? []).filter(
    (e) => e.sid == null || !offWallSellers.has(String(e.sid)),
  );
  raw.sort((a, b) => ms(b.at) - ms(a.at));
  const seen = new Set<string>();
  const out: HomeFeedEvent[] = [];
  for (const e of raw) {
    const key = String(e.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length === 12) break;
  }
  return out;
}
