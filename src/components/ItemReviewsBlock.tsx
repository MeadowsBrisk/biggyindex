"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  type Review,
  ReviewCard,
  ReviewStatsHeader,
} from "@/components/ReviewCard";

export interface ItemReview {
  id: number;
  created: number;
  rating: number;
  daysToArrive: number | null;
  segments: { type: string; value?: string; url?: string }[];
  item?: { refNum: string; name: string; id: number };
}

interface ItemReviewsBlockProps {
  reviews: ItemReview[];
  rs?: {
    avg?: number | null;
    cnt?: number | null;
    days?: number | null;
  } | null;
  loading: boolean;
  compact?: boolean;
  shareLink?: string | null;
  focusReviewId?: number | null;
  onFocusHandled?: () => void;
}

export function ItemReviewsBlock({
  reviews,
  rs,
  loading,
  compact,
  shareLink,
  focusReviewId,
  onFocusHandled,
}: ItemReviewsBlockProps) {
  const t = useTranslations("item.detail");
  const [textOnly, setTextOnly] = useState(false);

  const textReviewCount = useMemo(
    () =>
      reviews.filter((review) =>
        review.segments?.some(
          (segment) => segment.type === "text" && !!segment.value?.trim(),
        ),
      ).length,
    [reviews],
  );

  const shown = useMemo(
    () =>
      textOnly
        ? reviews.filter((review) =>
            review.segments?.some(
              (segment) => segment.type === "text" && !!segment.value?.trim(),
            ),
          )
        : reviews,
    [reviews, textOnly],
  );

  const focusMatched =
    focusReviewId != null &&
    reviews.some((review) => review.id === focusReviewId);

  useEffect(() => {
    if (focusMatched && onFocusHandled) {
      onFocusHandled();
    }
  }, [focusMatched, onFocusHandled]);

  return (
    <>
      <h3
        className={
          compact
            ? "mb-1 text-xs font-medium uppercase tracking-wider text-muted"
            : "text-sm font-semibold text-foreground mb-1"
        }
      >
        {t("reviews.heading")}
        {reviews.length > 0 && (
          <span className="ml-1 text-muted font-normal">
            ({reviews.length})
          </span>
        )}
      </h3>

      <ReviewStatsHeader
        avg={rs?.avg}
        count={rs?.cnt}
        days={rs?.days}
        recentCount={reviews.length}
      />

      {reviews.length > 1 &&
        textReviewCount > 0 &&
        textReviewCount < reviews.length && (
          <div className="mt-1 mb-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setTextOnly(false)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                textOnly
                  ? "border-border text-muted hover:bg-surface-hover hover:text-foreground"
                  : "border-transparent bg-primary/15 text-primary"
              }`}
            >
              {t("reviews.filter.all", { count: reviews.length })}
            </button>
            <button
              type="button"
              onClick={() => setTextOnly(true)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                textOnly
                  ? "border-transparent bg-primary/15 text-primary"
                  : "border-border text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {t("reviews.filter.withText", { count: textReviewCount })}
            </button>
          </div>
        )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted">{t("reviews.noneAvailable")}</p>
      ) : (
        <div className={compact ? "space-y-2" : "space-y-2"}>
          {shown.map((review, index) => (
            <ReviewCard
              key={`${review.id}-${index}`}
              review={review as Review}
              compact={compact}
              showItemName={false}
              highlighted={focusReviewId != null && review.id === focusReviewId}
            />
          ))}
        </div>
      )}

      {shareLink && reviews.length >= 2 && (rs?.cnt ?? 0) > reviews.length && (
        <p className="ido-reviews-hint">{t("reviews.readMoreAt")}</p>
      )}
    </>
  );
}
