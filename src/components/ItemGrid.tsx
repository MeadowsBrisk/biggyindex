"use client";

import { useAtomValue } from "jotai";
import { Package, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MARKET } from "@/lib/constants";
import { getItemPrimaryImage, variantSrcSetForUrl } from "@/lib/images";
import type { SeedItem } from "@/lib/seed";
import {
  bookmarksSetAtom,
  browseViewSignatureAtom,
  categoryAtom,
  currencyDisplayAtom,
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

// ─── Progressive rendering ──────────────────

const COLS = 4;
const INITIAL_ROWS = 9;
// Matches the 36 SSR seed cards so the seed→live swap never removes
// rendered rows (page height shrinking mid-load = scroll jump / CLS).
const INITIAL_BATCH = COLS * INITIAL_ROWS;
const CHUNK_SIZE = COLS * 3; // ~12 items per scroll-load

function useProgressiveRender<T extends { id: string | number }>(
  items: T[],
  signature: string,
): T[] {
  const [renderCount, setRenderCount] = useState(() =>
    Math.min(items.length, INITIAL_BATCH),
  );
  const [prevSignature, setPrevSignature] = useState(signature);
  const [prevLength, setPrevLength] = useState(items.length);

  // React-recommended "adjust state during render" pattern (no effect cascade).
  //
  // The reset key is the user's active-view SIGNATURE, not the raw item count.
  // `sortedItemsAtom` emits a new array both when the user changes a
  // filter/sort AND when fresh data lands (crawler ran → router.refresh
  // refetched the browse RSC). Only the former may snap back to the first
  // batch — resetting on the latter truncates the list under a deep-scrolled
  // reader and collapses the page height.
  if (signature !== prevSignature) {
    // User changed their view (filter/sort/search/category/market/…): reset to
    // the first batch.
    setPrevSignature(signature);
    setPrevLength(items.length);
    setRenderCount(Math.min(items.length, INITIAL_BATCH));
  } else if (items.length !== prevLength) {
    // Same view, new data reference (background swap, or the seed→live boot
    // swap): PRESERVE how far the user had scrolled. Clamp to the new length,
    // floored at INITIAL_BATCH so the boot transition (renderCount 0 while the
    // store is empty) still reveals a full first batch rather than freezing.
    setPrevLength(items.length);
    setRenderCount((prev) =>
      Math.min(items.length, Math.max(prev, INITIAL_BATCH)),
    );
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
 * Keep it a real <img> inside a real <a href="/item/{ref}">: the preload
 * scanner then finds images straight from the server HTML, and crawlers get a
 * linked catalog with the item name as anchor text. No onClick (pre-hydration
 * a tap should navigate) and no client hooks, so the server HTML is complete.
 *
 * Fields are pre-shaped by buildSeedItems (server) — price (`p`) already
 * currency-converted, rating (`ra`/`rc`) and category pill (`cl`/`sc0`)
 * mirroring the live card — so a seed reads as a complete card rather than an
 * image-with-missing-text stub.
 */
function SeedCard({
  item,
  priority,
  mobileCols,
}: {
  item: SeedItem;
  priority: boolean;
  mobileCols: 1 | 2;
}) {
  const imageUrl = getItemPrimaryImage(item, "thumb", { forceStatic: true });
  const imageSrcSet = variantSrcSetForUrl(imageUrl, item.vw);
  const mobileSize = mobileCols === 2 ? "50vw" : "100vw";
  const href = `/item/${encodeURIComponent(String(item.refNum ?? item.id))}`;
  // Category · Subcategory — same label the live CardPill builds in the "All"
  // (unfiltered) view the seed grid always represents.
  const pillLabel = item.cl
    ? item.sc0
      ? `${item.cl} · ${item.sc0}`
      : item.cl
    : null;

  return (
    <a href={href} className="item-card">
      <div className="item-card-inner">
        <div className="item-card-image aspect-square">
          {imageUrl ? (
            /* <picture> is React's documented escape hatch from Fizz's
               automatic image preloading: without it an SSR'd eager+high
               img is promoted into a CACHED HTTP Link preload header that
               also rides the /browse RSC prefetch, so other pages warn
               about unused preloads. The preload scanner still discovers
               the img from the HTML; only the header auto-emit is
               suppressed. */
            <picture>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                srcSet={imageSrcSet}
                alt={item.c ? `${item.n} — ${item.c}` : item.n}
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : undefined}
                sizes={`(min-width: 2560px) 17vw, (min-width: 1920px) 20vw, (min-width: 1440px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, ${mobileSize}`}
                className="card-image card-image--primary"
              />
            </picture>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Package size={48} />
            </div>
          )}

          {/* Category pill overlay — mirrors the live card's glass CardPill.
              Reuses the live classes so the mobile 2-col CSS (font/padding
              shrink) applies for free. `always-show` overrides the
              .card-controls hover-reveal so the pill is visible pre-hover on
              desktop too; on touch devices it's shown regardless. Absolutely
              positioned → no layout impact on the card body. */}
          {pillLabel && (
            <div className="card-controls absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2 pointer-events-none">
              <div className="flex items-start gap-1 always-show">
                <span className="card-pill card-pill--image glass text-[10px] font-medium">
                  {pillLabel}
                </span>
              </div>
            </div>
          )}
        </div>
        {mobileCols === 2 ? (
          /* Compact seed body — mirrors the 2-col live card (title 2-line
             ~11.5px, seller ~10.5px, price ~13px). No rating chip: the live
             2-col card hides .card-item-rating, so the seed omits it too. */
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
            {item.p ? (
              <p className="mt-1 font-bold" style={{ fontSize: "13px" }}>
                {item.p}
              </p>
            ) : (
              <p
                aria-hidden="true"
                className="mt-1 font-bold"
                style={{ fontSize: "13px" }}
              >
                &nbsp;
              </p>
            )}
          </div>
        ) : (
          /* 1-col seed body — title (+ rating chip, as the live 1-col card
             shows) above seller + real price. */
          <div className="p-2">
            <div className="flex items-start gap-1">
              <p className="text-sm font-medium leading-snug line-clamp-2 min-w-0 flex-1">
                {item.n}
              </p>
              {item.ra != null && (
                <span
                  className={`card-item-rating${item.ra < 8 ? " card-item-rating--low" : ""}`}
                >
                  <Star size={9} className="fill-current" />
                  {item.ra.toFixed(1)}
                  {item.rc != null && item.rc > 0 && (
                    <span className="card-item-rating__count">({item.rc})</span>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-muted truncate mt-1">{item.sn}</p>
            {item.p ? (
              <p className="text-sm font-semibold mt-1">{item.p}</p>
            ) : (
              <p aria-hidden="true" className="text-sm font-semibold mt-1">
                &nbsp;
              </p>
            )}
          </div>
        )}
      </div>
    </a>
  );
}

// ─── Item Grid ─────────────────────────────────────────────────────

export function ItemGrid({ seedItems }: { seedItems?: SeedItem[] }) {
  const t = useTranslations("browse");
  const items = useAtomValue(sortedItemsAtom);
  const viewSignature = useAtomValue(browseViewSignatureAtom);
  const isLoading = useAtomValue(isLoadingAtom);
  const visibleItems = useProgressiveRender(items, viewSignature);

  // Smooth-scroll to top when the user changes their VIEW (filter/sort/search/
  // category/market/…), keyed on the same signature the progressive renderer
  // resets on. Never key this on the `items` reference: a background data swap
  // (router.refresh) or the seed→live boot swap produces a new `items` array
  // with an UNCHANGED signature, and yanking a deep-scrolled reader to the top
  // for those is exactly what must not happen. Skips initial mount; only
  // scrolls if the user is already near the top.
  const prevSignatureRef = useRef(viewSignature);
  useEffect(() => {
    if (prevSignatureRef.current !== viewSignature) {
      prevSignatureRef.current = viewSignature;
      if (window.scrollY < 400) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [viewSignature]);

  // Read shared atoms once here — avoids per-card subscriptions
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

  // `clientNow` is the "now" reference fed to the cards' relative-time
  // formatters ("listed 3m ago"). It MUST be bumped when items change:
  // router.refresh brings in data whose `lua` timestamps are later than a
  // stale now, and `relativeAge` then returns null on every card (its
  // `ms < 0` guard). Three cheap triggers: a new items reference (filter/sort
  // also fires it — harmless, same second), a slow interval so an idle page
  // still ticks over, and tab return — which is NOT redundant with
  // RouterRefreshOnReturn, since that only refreshes after a long-enough hide
  // and defers entirely for a deep-scrolled reader.
  // `items` is a trigger-only sentinel — reading items.length inside the
  // effect marks the dep "used" for biome's exhaustive-deps rule.
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
    // Seed cards until live data lands. Seeds mirror the default sort
    // (hottest desc), so a plain /browse load swaps in content-identical and
    // dimension-stable. The page is cached path-only, so the server cannot
    // vary on searchParams: with filter params in the URL (shared links like
    // /browse?cat=Flower) the seeds would show the UNFILTERED default set, so
    // the layout's inline script (SeedParamsScript; SeedParamsSync on client
    // navs) sets `html.bi-seed-hide` before first paint and CSS hides the seed
    // grid in favour of the skeleton grid below (same grid container → no
    // layout shift; the toolbar/header are never hidden). Crawlers fetch
    // /browse without params, so the raw HTML keeps the full linked seed grid.
    if (seedItems?.length) {
      return (
        <>
          <div
            className="item-list-grid"
            data-seed-grid
            data-view={viewMode}
            data-mobile-cols={mobileGridCols}
          >
            {seedItems.map((item, i) => (
              <SeedCard
                key={item.id}
                item={item}
                priority={i < 2}
                mobileCols={mobileGridCols}
              />
            ))}
          </div>
          {/* Hidden unless html.bi-seed-hide is set pre-paint (URL has
              filter params). aria-hidden: purely decorative placeholder. */}
          <div
            className="item-list-grid"
            data-seed-skeleton
            data-view={viewMode}
            data-mobile-cols={mobileGridCols}
            aria-hidden="true"
          >
            {seedItems.map((item) => (
              <div
                key={`sk-${item.id}`}
                className="aspect-3/4 animate-pulse rounded-lg bg-surface"
              />
            ))}
          </div>
        </>
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
      <div className="item-list-rows">
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
      className="item-list-grid"
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
