"use client";

import { motion } from "framer-motion";
import { useAtomValue, useSetAtom } from "jotai";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigation } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/navigation";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import {
  currencyDisplayAtom,
  expandedRefNumAtom,
  sellerModalIdAtom,
} from "@/store/atoms";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

interface ReviewStats {
  avg?: number | null;
  days?: number | null;
  cnt?: number | null;
}

interface NewItem {
  id: string | number;
  refNum?: string | number | null;
  name: string;
  image?: string | null;
  images?: string[] | null;
  priceMin?: number | null;
  priceMax?: number | null;
  seller?: string | null;
  sellerId?: number | null;
  sellerImageUrl?: string | null;
  category?: string | null;
  date: string;
  reviewStats?: ReviewStats | null;
  shipsFrom?: string | null;
}

interface WhatsNewSectionProps {
  newest: NewItem[];
  recentlyUpdated: NewItem[];
}

type Tab = "newest" | "updated";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "newest", label: "Recently added", icon: <Sparkles size={14} /> },
  { key: "updated", label: "Recently updated", icon: <Clock size={14} /> },
];

function formatPrice(
  min?: number | null,
  max?: number | null,
  symbol = "\u00A3",
  rate = 0.79,
): string {
  if (min == null) return "N/A";
  const lo = `${symbol}${(min * rate).toFixed(0)}`;
  if (max != null && max !== min)
    return `${lo} - ${symbol}${(max * rate).toFixed(0)}`;
  return lo;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function StarRating({ avg }: { avg: number }) {
  const stars = Math.round((avg / 10) * 5);
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={10}
          className={
            i < stars
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-[var(--muted-foreground)]"
          }
        />
      ))}
    </span>
  );
}

/* -- Expand arrow (matches /browse ItemCard) -- */
function ExpandArrow() {
  return (
    <svg
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

/** Home page item card -- simplified version of /browse ItemCard. Opens overlay via expandedRefNumAtom. */
function HomeItemCard({
  item,
  currencySymbol,
  exchangeRate,
}: {
  item: NewItem;
  currencySymbol: string;
  exchangeRate: number;
}) {
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const setSellerModalId = useSetAtom(sellerModalIdAtom);
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);

  // Get the second image (not the primary) for hover crossfade
  const secondImage =
    item.images && item.images.length > 1 ? item.images[1] : null;
  const hasReviews =
    item.reviewStats?.avg != null && item.reviewStats?.cnt != null;

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

  return (
    <div className="item-card group">
      <div className="item-card-inner">
        {/* Image area - clickable for zoom */}
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
                alt={item.name}
                loading="lazy"
                className="card-image card-image--primary"
              />
              {secondImage && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={secondImage}
                  alt={`${item.name} alternate`}
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

          {/* Category pill */}
          {item.category && (
            <div className="card-controls absolute inset-x-0 top-0 z-10 flex items-start p-2 pointer-events-none">
              <span className="card-pill card-pill--image text-[10px] font-medium pointer-events-auto">
                {item.category === "PreRolls" ? "Pre-Rolls" : item.category}
              </span>
            </div>
          )}
        </button>

        {/* Clickable body -- opens overlay */}
        <button
          type="button"
          onClick={() => {
            const ref = item.refNum ? String(item.refNum) : String(item.id);
            setRefNum(ref);
          }}
          className="card-content w-full text-left"
        >
          <div className="card-content__inner">
            <div className="card-content__header">
              <h3 className="card-content__title">{item.name}</h3>
              <span className="card-content__icon" aria-hidden="true">
                <ExpandArrow />
              </span>
            </div>

            {/* Seller row — avatar + name, both open SellerModal.
                NOTE: uses spans with role=button (not <button>) because the
                enclosing card-content is already a <button>, and nested buttons
                are invalid HTML. */}
            <div className="seller-card mt-1.5">
              <SellerAvatarTooltip
                sellerName={item.seller ?? "Unknown seller"}
                imageUrl={item.sellerImageUrl}
                showInitialTooltip
              >
                <span
                  role={item.sellerId != null ? "button" : undefined}
                  tabIndex={item.sellerId != null ? 0 : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.sellerId != null)
                      setSellerModalId(String(item.sellerId));
                  }}
                  onKeyDown={(e) => {
                    if (
                      item.sellerId != null &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      e.stopPropagation();
                      setSellerModalId(String(item.sellerId));
                    }
                  }}
                  className={`seller-card__avatar !w-5 !h-5 !text-[9px] !rounded shrink-0 overflow-hidden inline-flex items-center justify-center ${item.sellerId != null ? "cursor-pointer" : ""}`}
                  aria-label={
                    item.sellerId != null
                      ? `View seller ${item.seller ?? ""}`
                      : undefined
                  }
                >
                  {item.sellerImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.sellerImageUrl}
                      alt={item.seller ?? ""}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    sellerInitials
                  )}
                </span>
              </SellerAvatarTooltip>
              <div className="seller-card__body">
                <div className="seller-card__name-row">
                  <span
                    role={item.sellerId != null ? "button" : undefined}
                    tabIndex={item.sellerId != null ? 0 : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.sellerId != null)
                        setSellerModalId(String(item.sellerId));
                    }}
                    onKeyDown={(e) => {
                      if (
                        item.sellerId != null &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        e.stopPropagation();
                        setSellerModalId(String(item.sellerId));
                      }
                    }}
                    className={`seller-card__name text-[11px] hover:text-foreground transition-colors ${item.sellerId != null ? "cursor-pointer" : ""}`}
                  >
                    {item.seller ?? "Unknown seller"}
                  </span>
                </div>
              </div>
            </div>

            {/* Price */}
            <div className="card-price-area mt-2">
              <div className="card-price-row">
                <span className="card-price-main !text-base">
                  {formatPrice(
                    item.priceMin,
                    item.priceMax,
                    currencySymbol,
                    exchangeRate,
                  )}
                </span>
              </div>
            </div>

            {/* Footer row: time ago + reviews */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground">
                {timeAgo(item.date)}
              </span>
              {hasReviews && (
                <span className="flex items-center gap-1">
                  <StarRating avg={item.reviewStats!.avg!} />
                  <span className="text-[10px] text-muted-foreground">
                    ({item.reviewStats!.cnt})
                  </span>
                </span>
              )}
            </div>
          </div>
        </button>
      </div>

      {/* Image zoom preview */}
      {zoomSignal != null && allImages.length > 0 && (
        <Suspense fallback={null}>
          <ImageZoomPreview
            imageUrl={item.image ?? undefined}
            imageUrls={allImages.length > 1 ? allImages : undefined}
            alt={item.name}
            openSignal={zoomSignal}
          />
        </Suspense>
      )}
    </div>
  );
}

export function WhatsNewSection({
  newest,
  recentlyUpdated,
}: WhatsNewSectionProps) {
  const [activeTab, setActiveTab] = useState<Tab>("newest");
  const { symbol, rate } = useAtomValue(currencyDisplayAtom);

  // Two-pass render: first render must match SSR output (exchangeRates starts
  // empty → rate=1) so hydration succeeds. After mount, switch to real rate.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const currencySymbol = mounted ? symbol : "\u00A3";
  const exchangeRate = mounted ? rate : 1;

  const items = activeTab === "newest" ? newest : recentlyUpdated;

  return (
    <section className="py-20 bg-[var(--background)]">
      {/* Header area - contained */}
      <div className="max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          {/* Section label */}
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
            Fresh activity
          </p>

          {/* Section heading */}
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            Recently indexed items
          </h2>
          <p className="text-muted mb-8">
            See the latest or most recently updated items on Little Biggy.
          </p>

          {/* Tab switcher + scroll arrows */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-1 rounded-xl bg-[var(--surface)] p-1">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? "bg-primary/15 text-primary"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Scroll arrows - desktop only */}
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                className="whats-new-prev rounded-full border border-[var(--border)] p-2 text-muted hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="whats-new-next rounded-full border border-[var(--border)] p-2 text-muted hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Card carousel - Swiper */}
      <div className="overflow-hidden">
        <Swiper
          modules={[Navigation]}
          navigation={{
            nextEl: ".whats-new-next",
            prevEl: ".whats-new-prev",
          }}
          slidesPerView={1.4}
          centeredSlides
          spaceBetween={12}
          breakpoints={{
            480: {
              slidesPerView: 2.2,
              centeredSlides: false,
              spaceBetween: 12,
            },
            640: { slidesPerView: 3, centeredSlides: false, spaceBetween: 12 },
            900: { slidesPerView: 4, centeredSlides: false, spaceBetween: 14 },
            1200: { slidesPerView: 5, centeredSlides: false, spaceBetween: 16 },
            1600: { slidesPerView: 6, centeredSlides: false, spaceBetween: 16 },
            2200: { slidesPerView: 8, centeredSlides: false, spaceBetween: 16 },
          }}
          style={{ overflow: "visible", padding: "0 1rem" }}
        >
          {items.map((item) => (
            <SwiperSlide key={`${activeTab}-${item.id}`}>
              <HomeItemCard
                item={item}
                currencySymbol={currencySymbol}
                exchangeRate={exchangeRate}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Browse CTA */}
      <div className="max-w-7xl mx-auto px-4 mt-8 flex justify-center">
        <Link
          href="/browse"
          prefetch={false}
          className="group inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-6 py-3 text-sm font-semibold text-foreground transition-all hover:border-primary/30 hover:text-primary"
        >
          Browse all items
          <ArrowRight
            size={16}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </section>
  );
}
