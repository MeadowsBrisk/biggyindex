'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { fadeInUp } from "@/sections/home/motionPresets";
import { decodeEntities, timeAgo } from "@/lib/format";
import { panelClassForReviewScore } from "@/theme/reviewScoreColors";
import { proxyImage } from "@/lib/images";
import cn from "@/app/cn";
import SellerAvatarTooltip from "@/components/SellerAvatarTooltip";
import ItemImageTooltip from "@/components/ItemImageTooltip";
import { RECENT_REVIEWS_LIMIT } from "@/lib/constants";

const MAX_REVIEWS = RECENT_REVIEWS_LIMIT;

function formatPostedLabel(isoString) {
  if (!isoString) return "Posted just now";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Posted just now";
  // Deterministic across SSR/CSR: render in Europe/London regardless of server/client timezone
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
    const hh = parts.hour || "00";
    const mm = parts.minute || "00";
    const dd = parts.day || "01";
    const MM = parts.month || "01";
    const yy = parts.year || "00";
    return `Posted ${hh}:${mm} ${dd}/${MM}/${yy}`;
  } catch {
    // Fallback: UTC (still deterministic)
    const pad = (val) => String(val).padStart(2, "0");
    const hours = pad(date.getUTCHours());
    const minutes = pad(date.getUTCMinutes());
    const day = pad(date.getUTCDate());
    const month = pad(date.getUTCMonth() + 1);
    const year = String(date.getUTCFullYear()).slice(-2);
    return `Posted ${hours}:${minutes} ${day}/${month}/${year}`;
  }
}

const placeholderReviews = Array.from({ length: MAX_REVIEWS }).map((_, idx) => ({
  id: `placeholder-review-${idx}`,
  rating: 10,
  daysToArrive: 2,
  sellerName: "LittleBiggy Buyer",
  created: null,
  item: { name: "Fresh reviews incoming", refNum: null },
  segments:
    idx % 2 === 0
      ? [
          {
            type: "text",
            value: "We’re refreshing the combined reviews feed. Real highlights from LittleBiggy shoppers will appear here soon.\n\nStay tuned!",
          },
        ]
      : [],
}));

function extractReviewContent(review) {
  const textSegments = [];
  const images = [];
  if (Array.isArray(review?.segments)) {
    for (const seg of review.segments) {
      if (!seg) continue;
      if (seg.type === "text" && typeof seg.value === "string") {
        textSegments.push(seg.value);
      } else if (seg.type === "image" && seg.value) {
        images.push(seg.value);
      }
    }
  }
  const raw = textSegments.join("");
  const text = decodeEntities(raw);
  return { text, images };
}

function formatArrival(days) {
  if (days == null || Number.isNaN(days)) return null;
  if (days === 0) return "took same day";
  if (days === 1) return "took 1 day";
  return `took ${days} days`;
}


function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s)]+)([),.]?)/gi;
  const parts = [];
  let last = 0;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[1];
    const trailing = match[2] || "";
    parts.push(
      <a
        key={`${parts.length}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-emerald-600 dark:hover:text-emerald-400"
      >
        {url}
      </a>
    );
    if (trailing) parts.push(trailing);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

function renderParagraphs(text) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) return null;
  return paragraphs.map((para, idx) => {
    const inline = para.replace(/\n+/g, " ").replace(/\s{2,}/g, " ");
    return (
      <p key={idx} className="mb-2 text-[14px] leading-relaxed text-slate-700 dark:text-white/80">
        {linkify(inline)}
      </p>
    );
  });
}

function StarRating({ rating }) {
  const total = 5;
  const score = typeof rating === "number" ? Math.max(0, Math.min(10, rating)) : 0;
  const starValue = score / 2; // 10-point score mapped to 5 stars

  return (
    <div className="flex items-center gap-1" aria-label={`${score}/10 rating`} title={`${score}/10 rating`}>
      {Array.from({ length: total }).map((_, idx) => {
        const isFull = starValue >= idx + 1;
        const isHalf = !isFull && starValue > idx && starValue < idx + 1;
        return (
          <span key={`star-${idx}-${Math.round(starValue * 10)}`} className="relative inline-flex h-4 w-4">
            <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <path
                className="fill-slate-200 dark:fill-white/15"
                d="M12 2.5 14.9 8l6.1.9-4.4 4.3 1 6.2L12 16.9 6.4 19.4l1-6.2-4.4-4.3L9.1 8z"
              />
              {(isFull || isHalf) && (
                <path
                  className="fill-emerald-500"
                  d={
                    isHalf
                      ? "M12 2.5 12 16.9 6.4 19.4l1-6.2-4.4-4.3L9.1 8z"
                      : "M12 2.5 14.9 8l6.1.9-4.4 4.3 1 6.2L12 16.9 6.4 19.4l1-6.2-4.4-4.3L9.1 8z"
                  }
                />
              )}
            </svg>
          </span>
        );
      })}
    </div>
  );
}


export default function RecentReviewsSection({ reviews }) {
  const list = useMemo(() => {
    const source = Array.isArray(reviews) && reviews.length ? reviews : placeholderReviews;
    return source
      .slice(0, MAX_REVIEWS)
      .map((review, index) => {
        const { text, images } = extractReviewContent(review);
        return {
          id: review?.id ?? `recent-review-${index}`,
          rating: typeof review?.rating === "number" ? review.rating : null,
          daysToArrive: Number.isFinite(review?.daysToArrive) ? review.daysToArrive : null,
          sellerName: review?.sellerName || "Unknown seller",
          sellerId: review?.sellerId ?? review?.seller?.id ?? null,
          itemName: review?.item?.name || "Unknown item",
          refNum: review?.item?.refNum || null,
          createdAt: review?.created ? resolveCreated(review.created) : null,
          itemImageUrl: review?.itemImageUrl ?? review?.item?.imageUrl ?? null,
          sellerImageUrl: review?.sellerImageUrl ?? null,
          text,
          images,
        };
      })
      .sort((a, b) => {
        const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bTime - aTime;
      });
  }, [reviews]);

  return (
    <section className="bg-gradient-to-b from-white via-white to-slate-100 py-24 xl:pt-16 transition-colors duration-300 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div {...fadeInUp({ trigger: "view", viewportAmount: 0.45 })} className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-white/60">Community pulse</span>
          <h2 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">Recent reviews</h2>
          <p className="mt-4 text-base text-slate-600 dark:text-white/70">
            Straight from LittleBiggy shoppers — scroll the latest ratings, delivery speeds, and buyer notes pulled from the combined feed.
          </p>
        </motion.div>

        <motion.div
          {...fadeInUp({ trigger: "view", viewportAmount: 0.4, delay: 0.05 })}
          className="mt-16 rounded-3xl border border-slate-200 bg-white/95 p-4 sm:p-8 shadow-xl shadow-slate-900/5 transition-colors duration-300 dark:border-white/10 dark:bg-white/[0.08] dark:shadow-black/30"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Latest buyer feedback</p>
              <p className="text-xs text-slate-500 dark:text-white/60">{list.length} review{list.length === 1 ? "" : "s"} loaded from the recent feed</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
              Refreshed every 4 hours
            </span>
          </div>

          <div className="mt-6 max-h-[540px] overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-300 hover:scrollbar-thumb-emerald-400 dark:scrollbar-thumb-white/20">
            <ul className="space-y-4">
              {list.map((review) => (
                <ReviewRow key={review.id} review={review} />
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function resolveCreated(created) {
  if (!created) return null;
  if (typeof created === "number") return new Date(created * 1000).toISOString();
  const parsed = new Date(created);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function ReviewRow({ review }) {
  const scoreRaw = typeof review.rating === "number" ? review.rating : null;
  const scoreKey = scoreRaw != null ? Math.min(10, Math.max(1, Math.round(scoreRaw))) : null;
  const panelClass = panelClassForReviewScore(scoreKey);
  const arrivalLabel = formatArrival(review.daysToArrive);
  const capturedLabel = review.createdAt ? formatPostedLabel(review.createdAt) : "Posted just now";
  const [relativeLabel, setRelativeLabel] = useState(null);

  useEffect(() => {
    if (!review.createdAt) return undefined;
    setRelativeLabel(timeAgo(review.createdAt));
    const interval = window.setInterval(() => {
      setRelativeLabel(timeAgo(review.createdAt));
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [review.createdAt]);
  const hasText = review.text && review.text.trim().length > 0;
  const hasImages = Array.isArray(review.images) && review.images.length > 0;
  const hasItemImage = Boolean(review.itemImageUrl);
  const showPlaceholder = !hasItemImage; // show a subtle placeholder when missing

  return (
    <li
      className={cn(
        "relative rounded-2xl border transition-colors duration-200 backdrop-blur-sm",
        hasText
          ? `${panelClass} p-4 sm:p-5 shadow-sm hover:shadow dark:shadow-black/30`
          : `border-dashed ${panelClass} px-3 sm:px-4 py-2 sm:py-3 text-sm font-medium`,
        (hasItemImage || showPlaceholder) && "sm:pr-24"
      )}
    >
      {(hasItemImage || showPlaceholder) && (
        <div className="absolute right-4 top-4 sm:right-5 sm:top-5">
          <ItemImageTooltip
            imageUrl={review.itemImageUrl}
            itemName={review.itemName}
            fallbackText="Image not indexed. Item may no longer be available"
          >
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm dark:border-white/20 dark:bg-white/10">
              <div className="relative h-12 w-12 sm:h-16 sm:w-16">
                {hasItemImage ? (
                  <img
                    src={proxyImage(review.itemImageUrl)}
                    alt={`${review.itemName} image`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-white/5 dark:to-white/10" aria-label="No image available" />
                )}
              </div>
            </div>
          </ItemImageTooltip>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1 text-[10px] font-medium text-slate-400 dark:text-white/55">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-white/65">
            {capturedLabel}
            {/* Render relative label client-side only (useEffect populated) to avoid SSR mismatch */}
            {relativeLabel ? (
              <span className="ml-2 text-[10px] text-slate-400 dark:text-white/55">({relativeLabel})</span>
            ) : null}
          </span>
          <div className="flex items-start gap-3 text-slate-600 dark:text-white/70">
            <StarRating rating={scoreRaw} />
            {arrivalLabel && <span className="text-[11px] font-semibold text-slate-500 dark:text-white/65">{arrivalLabel}</span>}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-5 sm:pt-0">
        {review.itemName && (
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {review.refNum ? (
              <Link
                href={`/item/${review.refNum}`}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <span className="font-semibold text-base md:text-lg">{review.itemName}</span>
              </Link>
            ) : (
              <span className="font-semibold text-base md:text-lg">{review.itemName}</span>
            )}
            <span className="ml-2 text-[11px] font-medium text-slate-500 dark:text-white/60">
              – sold by {review.sellerId ? (
                <SellerAvatarTooltip sellerName={review.sellerName} sellerImageUrl={review.sellerImageUrl}>
                  <Link
                    href={`/seller/${review.sellerId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    {review.sellerName}
                  </Link>
                </SellerAvatarTooltip>
              ) : (
                review.sellerName
              )}
            </span>
          </p>
        )}

        {hasText && <div className="mt-3 [&>*:last-child]:mb-0">{renderParagraphs(review.text)}</div>}

        {hasImages && (
          <div className="mt-3 flex flex-wrap gap-2">
            {review.images.map((src, idx) => (
              <div
                key={`${review.id}-img-${idx}`}
                className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-300/70 bg-slate-100 dark:border-white/20 dark:bg-white/10"
              >
                <img src={proxyImage(src)} alt="Review media" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

