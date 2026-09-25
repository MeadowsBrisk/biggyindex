"use client";

import { useSetAtom } from "jotai";
import { Sparkles, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { KeyboardEvent, MouseEvent } from "react";
import { lazy, Suspense, useState } from "react";
import { RelativeTime } from "@/components/home/RelativeTime";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { CATEGORIES, type Category } from "@/lib/constants";
import { decodeEntities } from "@/lib/format";
import type { HomeCardItem } from "@/lib/home/feed";
import { expandedRefNumAtom, sellerModalIdAtom } from "@/store/atoms";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

export type HomeCardMode = "new" | "drop" | "restock";

const STAR_POSITIONS = [0, 1, 2, 3, 4] as const;

function formatPrice(
  min: number | null,
  max: number | null,
  symbol: string,
  rate: number,
  unavailableLabel: string,
): string {
  if (min == null) return unavailableLabel;
  const lo = `${symbol}${(min * rate).toFixed(0)}`;
  if (max != null && max !== min)
    return `${lo} - ${symbol}${(max * rate).toFixed(0)}`;
  return lo;
}

function StarRating({ avg }: { avg: number }) {
  const stars = Math.round((avg / 10) * 5);
  return (
    <span className="inline-flex items-center gap-0.5">
      {STAR_POSITIONS.map((starIndex) => (
        <Star
          key={starIndex}
          size={10}
          className={
            starIndex < stars
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-muted-foreground"
          }
        />
      ))}
    </span>
  );
}

function ExpandArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5"
    >
      <path d="M7 17L17 7M17 7H7M17 7v10" />
    </svg>
  );
}

/** Home strip card on the `.item-card` shell; a left click opens the detail overlay. */
export function HomeItemCard({
  item,
  mode,
  currencySymbol,
  exchangeRate,
  eager = false,
}: {
  item: HomeCardItem;
  mode: HomeCardMode;
  currencySymbol: string;
  exchangeRate: number;
  /** First visible cards load eagerly; the rest stay lazy. */
  eager?: boolean;
}) {
  const t = useTranslations("home.feed");
  const tCategories = useTranslations("categories");
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const setSellerModalId = useSetAtom(sellerModalIdAtom);
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);

  const name = decodeEntities(item.name);
  const secondImage =
    item.images && item.images.length > 1 ? item.images[1] : null;
  const reviewAvg = item.reviewStats?.avg ?? null;
  const reviewCount = item.reviewStats?.cnt ?? null;
  const dropped =
    mode === "drop" &&
    item.was != null &&
    item.priceMin != null &&
    item.was > item.priceMin;
  const dropPct =
    dropped && item.was != null && item.priceMin != null
      ? Math.round(((item.was - item.priceMin) / item.was) * 100) || null
      : null;

  const sellerInitials = (item.seller ?? "?")
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const allImages = item.images?.length
    ? item.images
    : item.image
      ? [item.image]
      : [];
  const itemHref = `/item/${encodeURIComponent(item.ref)}`;
  const sellerName = item.seller ?? t("unknownSeller");
  const hasSellerLink = item.sellerId != null;
  const categoryLabel = item.category
    ? CATEGORIES.includes(item.category as Category)
      ? tCategories(item.category as Category)
      : item.category
    : null;
  const openSellerModal = () => {
    if (item.sellerId != null) setSellerModalId(String(item.sellerId));
  };
  const handleSellerClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openSellerModal();
  };
  const handleSellerKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      openSellerModal();
    }
  };
  const loading = eager ? "eager" : "lazy";

  return (
    <div className="item-card group h-full">
      <div className="item-card-inner h-full">
        <button
          type="button"
          onClick={() => setZoomSignal(Date.now())}
          className="item-card-image aspect-square cursor-zoom-in w-full"
        >
          {item.image ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt={name}
                loading={loading}
                className="card-image card-image--primary"
              />
              {secondImage && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={secondImage}
                  alt={t("alternateImageAlt", { item: name })}
                  loading="lazy"
                  className="card-image card-image--hover"
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted">
              <Sparkles size={32} className="opacity-30" />
            </div>
          )}

          {categoryLabel && (
            <div className="card-controls absolute inset-x-0 top-0 z-10 flex items-start p-2 pointer-events-none">
              <span className="card-pill card-pill--image text-[10px] font-medium pointer-events-auto">
                {categoryLabel}
              </span>
            </div>
          )}
        </button>

        {/* Real link for crawlers; a plain left click opens the overlay instead. */}
        <a
          href={itemHref}
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            setRefNum(item.ref);
          }}
          className="card-content w-full text-left flex-1"
        >
          <div className="card-content__inner">
            <div className="card-content__header">
              <h3 className="card-content__title">{name}</h3>
              <span className="card-content__icon" aria-hidden="true">
                <ExpandArrow />
              </span>
            </div>

            {/* Nested interactive elements are invalid inside the card anchor, hence role=button spans. */}
            <div className="seller-card mt-1.5">
              <SellerAvatarTooltip
                sellerName={sellerName}
                imageUrl={item.sellerImageUrl}
                showInitialTooltip
              >
                {hasSellerLink ? (
                  /* biome-ignore lint/a11y/useSemanticElements: nested button/anchor would be invalid HTML inside the card link */
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={handleSellerClick}
                    onKeyDown={handleSellerKeyDown}
                    className="seller-card__avatar w-5! h-5! text-[9px]! rounded! shrink-0 overflow-hidden inline-flex items-center justify-center cursor-pointer"
                    aria-label={t("viewSeller", { seller: sellerName })}
                  >
                    {item.sellerImageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.sellerImageUrl}
                        alt={sellerName}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      sellerInitials
                    )}
                  </span>
                ) : (
                  <span className="seller-card__avatar w-5! h-5! text-[9px]! rounded! shrink-0 overflow-hidden inline-flex items-center justify-center">
                    {item.sellerImageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.sellerImageUrl}
                        alt={sellerName}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      sellerInitials
                    )}
                  </span>
                )}
              </SellerAvatarTooltip>
              <div className="seller-card__body">
                <div className="seller-card__name-row">
                  {hasSellerLink ? (
                    /* biome-ignore lint/a11y/useSemanticElements: nested button/anchor would be invalid HTML inside the card link */
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={handleSellerClick}
                      onKeyDown={handleSellerKeyDown}
                      className="seller-card__name text-[11px] hover:text-foreground transition-colors cursor-pointer"
                    >
                      {sellerName}
                    </span>
                  ) : (
                    <span className="seller-card__name text-[11px] hover:text-foreground transition-colors">
                      {sellerName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="card-price-area mt-2">
              <div className="card-price-row">
                {item.soldOut ? (
                  <span className="seller-card__badge seller-card__badge--soldout">
                    {t("soldOut")}
                  </span>
                ) : mode === "drop" ? (
                  <span className="card-price-main text-base! home-card-drop">
                    {dropped && (
                      <>
                        <s className="home-card-was">
                          {formatPrice(
                            item.was,
                            null,
                            currencySymbol,
                            exchangeRate,
                            t("priceUnavailable"),
                          )}
                        </s>
                        <span className="home-card-to" aria-hidden="true">
                          →
                        </span>
                      </>
                    )}
                    {formatPrice(
                      item.priceMin,
                      null,
                      currencySymbol,
                      exchangeRate,
                      t("priceUnavailable"),
                    )}
                    {dropPct != null && (
                      <span className="seller-card__badge home-card-pct">
                        −{dropPct}%
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="card-price-main text-base!">
                    {formatPrice(
                      item.priceMin,
                      item.priceMax,
                      currencySymbol,
                      exchangeRate,
                      t("priceUnavailable"),
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground">
                {item.at && (
                  <>
                    {t(`timeLabel.${mode}`)} <RelativeTime iso={item.at} />
                  </>
                )}
              </span>
              {reviewAvg != null && reviewCount != null && (
                <span className="flex items-center gap-1">
                  <StarRating avg={reviewAvg} />
                  <span className="text-[10px] text-muted-foreground">
                    ({reviewCount})
                  </span>
                </span>
              )}
            </div>
          </div>
        </a>
      </div>

      {zoomSignal != null && allImages.length > 0 && (
        <Suspense fallback={null}>
          <ImageZoomPreview
            imageUrl={item.image ?? undefined}
            imageUrls={allImages.length > 1 ? allImages : undefined}
            alt={name}
            openSignal={zoomSignal}
          />
        </Suspense>
      )}
    </div>
  );
}
