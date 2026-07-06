"use client";

import { useAtomValue } from "jotai";
import { Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MARKET } from "@/lib/constants";
import { getItemPrimaryImage } from "@/lib/images";
import type { SeedItem } from "@/lib/seed";
import {
  bookmarksSetAtom,
  categoryAtom,
  currencyDisplayAtom,
  gateCompleteAtom,
  highResImagesAtom,
  includeShippingAtom,
  isLoadingAtom,
  itemIndexAtom,
  marketAtom,
  mobileGridColsAtom,
  pauseGifsAtom,
  selectedSellersAtom,
  selectedWeightsAtom,
  sellersMapAtom,
  sortedItemsAtom,
  thumbnailAspectAtom,
  viewLayoutAtom,
  viewModeAtom,
} from "@/store/atoms";
import type { CardConfig } from "./ItemCard";
import { ItemCard } from "./ItemCard";
import { ItemRow } from "./ItemRow";

// ─── Progressive rendering (ported from food-agg) ──────────────────

const COLS = 4;
const INITIAL_ROWS = 5;
const INITIAL_BATCH = COLS * INITIAL_ROWS; // ~20 items visible immediately
const CHUNK_SIZE = COLS * 3; // ~12 items per scroll-load

function useProgressiveRender<T extends { id: string | number }>(
  items: T[],
): T[] {
  const [renderCount, setRenderCount] = useState(() =>
    Math.min(items.length, INITIAL_BATCH),
  );
  const [prevLength, setPrevLength] = useState(items.length);

  // React-recommended "adjust state during render" pattern:
  // reset count immediately when item list changes — no effect cascade
  if (items.length !== prevLength) {
    setPrevLength(items.length);
    setRenderCount(Math.min(items.length, INITIAL_BATCH));
  }

  // Progressively render remaining items as the user scrolls
  useEffect(() => {
    if (renderCount >= items.length) return;
    let ticking = false;

    const checkScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 1500
      ) {
        setRenderCount((prev) => Math.min(prev + CHUNK_SIZE * 2, items.length));
      }
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(checkScroll);
        ticking = true;
      }
    };

    // Run once on mount in case already near bottom
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [renderCount, items.length]);

  return useMemo(() => items.slice(0, renderCount), [items, renderCount]);
}

// ─── Seed card (SSR placeholder — shows real images, no JS needed) ──

/**
 * Lightweight card rendered during loading (before Jotai hydrates).
 * Contains a real <img> so the browser preload scanner discovers images
 * immediately from the server HTML.
 */
function SeedCard({
  item,
  priority,
  sym,
  mobileCols,
}: {
  item: SeedItem;
  priority: boolean;
  sym: string;
  mobileCols: 1 | 2;
}) {
  const imageUrl = getItemPrimaryImage(item, "thumb", { forceStatic: true });
  const mobileSize = mobileCols === 2 ? "50vw" : "100vw";

  return (
    <div className="item-card">
      <div className="item-card-inner">
        <div className="item-card-image aspect-square">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={item.n}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              sizes={`(min-width: 2560px) 17vw, (min-width: 1920px) 20vw, (min-width: 1440px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, ${mobileSize}`}
              className="card-image card-image--primary"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Package size={48} />
            </div>
          )}
        </div>
        {mobileCols === 2 ? (
          /* Compact seed body — mirrors the 2-col live card so first paint
             (title 2-line ~11.5px, seller ~10.5px, price ~13px) doesn't jump
             when live cards swap in. */
          <div className="px-1.5 pb-2 pt-1">
            <p
              className="font-medium leading-tight line-clamp-2"
              style={{ fontSize: "11.5px" }}
            >
              {item.n}
            </p>
            <p
              className="text-muted truncate mt-1"
              style={{ fontSize: "10.5px" }}
            >
              {item.sn}
            </p>
            <p className="font-bold mt-1" style={{ fontSize: "13px" }}>
              {sym}
              {item.uMin.toFixed(2)}
            </p>
          </div>
        ) : (
          <div className="p-2">
            <p className="text-xs text-muted truncate">{item.sn}</p>
            <p className="text-sm font-medium leading-snug line-clamp-2 mt-0.5">
              {item.n}
            </p>
            <p className="text-sm font-semibold mt-1">
              {sym}
              {item.uMin.toFixed(2)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Item Grid ─────────────────────────────────────────────────────

export function ItemGrid({
  seedItems,
  seedSym,
}: {
  seedItems?: SeedItem[];
  seedSym?: string;
}) {
  const t = useTranslations("browse");
  const items = useAtomValue(sortedItemsAtom);
  const isLoading = useAtomValue(isLoadingAtom);
  const gateComplete = useAtomValue(gateCompleteAtom);
  const visibleItems = useProgressiveRender(items);

  // Smooth-scroll to top when filtered/sorted item list changes.
  // Skips initial mount; only scrolls if user is near top.
  const prevItemsRef = useRef(items);
  useEffect(() => {
    if (prevItemsRef.current !== items) {
      prevItemsRef.current = items;
      if (window.scrollY < 400) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [items]);

  // Read shared atoms once here — avoids per-card subscriptions (food-agg pattern)
  const currentMarket = useAtomValue(marketAtom) || DEFAULT_MARKET;
  const { symbol: cSym, rate: cRate } = useAtomValue(currencyDisplayAtom);
  const sellersMap = useAtomValue(sellersMapAtom);
  const selectedSellers = useAtomValue(selectedSellersAtom);
  const bookmarksSet = useAtomValue(bookmarksSetAtom);
  const globalWeights = useAtomValue(selectedWeightsAtom);
  const includeShipping = useAtomValue(includeShippingAtom);
  const pauseGifs = useAtomValue(pauseGifsAtom);
  const thumbAspect = useAtomValue(thumbnailAspectAtom);
  const highRes = useAtomValue(highResImagesAtom);
  const activeCategory = useAtomValue(categoryAtom);
  const viewMode = useAtomValue(viewModeAtom);
  const viewLayout = useAtomValue(viewLayoutAtom);
  const mobileGridCols = useAtomValue(mobileGridColsAtom);
  const itemIndex = useAtomValue(itemIndexAtom);
  const [clientNow, setClientNow] = useState<number | null>(null);

  // `clientNow` is the "now" reference fed to relative-time formatters on
  // each card ("listed 3m ago"). It MUST be bumped when items change —
  // otherwise router.refresh() (e.g. RouterRefreshOnReturn) brings in
  // newer data with `lua` timestamps that are later than the cached now,
  // and `relativeAge` returns null on every card (its `ms < 0` guard).
  // Three triggers, all cheap:
  //   1. Items reference change (data arrival, also fires on filter/sort
  //      but that's benign — same clientNow within the same second).
  //   2. Slow interval so a user sitting on a static page eventually
  //      sees "3m ago" advance to "4m ago".
  //   3. Tab return — covers the case where router.refresh hasn't fired
  //      yet (e.g. < 2 min hidden) but times still drifted.
  // `items` is intentionally a trigger-only sentinel — a new array
  // reference means fresh data arrived (router.refresh, filter change)
  // and we want a fresh `now` for relative-time formatting on the cards.
  // Reading items.length inside the effect makes the dep "used" so biome's
  // exhaustive-deps rule doesn't flag it.
  useEffect(() => {
    void items.length;
    setClientNow(Date.now());
  }, [items]);

  useEffect(() => {
    const interval = window.setInterval(() => setClientNow(Date.now()), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") setClientNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const config = useMemo<CardConfig>(
    () => ({
      currentMarket,
      cSym,
      cRate,
      sellersMap,
      selectedSellers,
      globalWeights,
      includeShipping,
      pauseGifs,
      thumbAspect,
      highRes,
      activeCategory,
      itemIndex,
      clientNow,
    }),
    [
      currentMarket,
      cSym,
      cRate,
      sellersMap,
      selectedSellers,
      globalWeights,
      includeShipping,
      pauseGifs,
      thumbAspect,
      highRes,
      activeCategory,
      itemIndex,
      clientNow,
    ],
  );

  // Only render the loading state when there's *nothing* to show. If the
  // Jotai store still has items from a previous navigation (the user came
  // back to /browse), render them immediately — the user shouldn't see a
  // skeleton flash for data that's already in memory.
  if (isLoading && items.length === 0) {
    // Show seed cards during initial page load (gate still active).
    // Skip during client-side navigation (gate already done) to avoid
    // flashing hot-sorted seeds before live sorted cards appear.
    if (seedItems?.length && !gateComplete) {
      return (
        <div
          className="item-list-grid"
          data-view={viewMode}
          data-mobile-cols={mobileGridCols}
        >
          {seedItems.map((item, i) => (
            <SeedCard
              key={item.id}
              item={item}
              priority={i < 2}
              sym={seedSym ?? "£"}
              mobileCols={mobileGridCols}
            />
          ))}
        </div>
      );
    }
    // Fallback skeleton (only if no seed data at all)
    return (
      <div
        className="item-list-grid"
        data-view={viewMode}
        data-mobile-cols={mobileGridCols}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className="aspect-3/4 animate-pulse rounded-lg bg-surface"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg font-medium">{t("noItemsFound")}</p>
        <p className="text-sm">{t("adjustFilters")}</p>
      </div>
    );
  }

  if (viewLayout === "list") {
    return (
      <div className="item-list-rows animate-[fadeIn_350ms_ease-out]">
        {visibleItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            config={config}
            isBookmarked={bookmarksSet.has(
              item.refNum ? String(item.refNum) : String(item.id),
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="item-list-grid animate-[fadeIn_350ms_ease-out]"
      data-view={viewMode}
      data-mobile-cols={mobileGridCols}
    >
      {visibleItems.map((item, index) => (
        <ItemCard
          key={item.id}
          item={item}
          priority={index < 6}
          config={config}
          isBookmarked={bookmarksSet.has(
            item.refNum ? String(item.refNum) : String(item.id),
          )}
        />
      ))}
    </div>
  );
}
