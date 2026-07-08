"use client";

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
import { useTranslations } from "next-intl";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";
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
  now: number;
}

type Tab = "newest" | "updated";

const TABS: { key: Tab; labelKey: string; icon: React.ReactNode }[] = [
  { key: "newest", labelKey: "tabs.newest", icon: <Sparkles size={14} /> },
  { key: "updated", labelKey: "tabs.updated", icon: <Clock size={14} /> },
];

const STAR_POSITIONS = [0, 1, 2, 3, 4] as const;

interface TimeAgoCopy {
  justNow: string;
  hoursAgo: (count: number) => string;
  oneDayAgo: string;
  daysAgo: (count: number) => string;
  monthsAgo: (count: number) => string;
}

interface HomeItemCardCopy {
  priceUnavailable: string;
  unknownSeller: string;
  viewSeller: (seller: string) => string;
  alternateImageAlt: (item: string) => string;
  time: TimeAgoCopy;
}

function formatPrice(
  min?: number | null,
  max?: number | null,
  symbol = "\u00A3",
  rate = 0.79,
  unavailableLabel = "N/A",
): string {
  if (min == null) return unavailableLabel;
  const lo = `${symbol}${(min * rate).toFixed(0)}`;
  if (max != null && max !== min)
    return `${lo} - ${symbol}${(max * rate).toFixed(0)}`;
  return lo;
}

function timeAgo(dateStr: string, copy: TimeAgoCopy, now: number): string {
  const diff = Math.max(0, now - new Date(dateStr).getTime());
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return copy.justNow;
  if (hours < 24) return copy.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days === 1) return copy.oneDayAgo;
  if (days < 30) return copy.daysAgo(days);
  return copy.monthsAgo(Math.floor(days / 30));
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

/* -- Expand arrow (matches /browse ItemCard) -- */
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

/** Home page item card -- simplified version of /browse ItemCard. Opens overlay via expandedRefNumAtom. */
function HomeItemCard({
  item,
  currencySymbol,
  exchangeRate,
  copy,
  now,
}: {
  item: NewItem;
  currencySymbol: string;
  exchangeRate: number;
  copy: HomeItemCardCopy;
  now: number;
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
  const itemHref = `/item/${encodeURIComponent(String(item.refNum ?? item.id))}`;
  const sellerName = item.seller ?? copy.unknownSeller;
  const hasSellerLink = item.sellerId != null;
  const openSellerModal = () => {
    if (item.sellerId != null) setSellerModalId(String(item.sellerId));
  };
  const handleSellerClick = (event: MouseEvent<HTMLSpanElement>) => {
    // preventDefault stops the enclosing item anchor from navigating
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
                  alt={copy.alternateImageAlt(item.name)}
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

        {/* Clickable body -- real link for crawlers; left-click opens overlay */}
        <a
          href={itemHref}
          onClick={(e) => {
            // Middle-click / ctrl-click → let browser open in new tab
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
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
                NOTE: uses spans with role=button (not <button>/<a>) because the
                enclosing card-content is an <a>, and nested interactive
                elements are invalid HTML. */}
            <div className="seller-card mt-1.5">
              <SellerAvatarTooltip
                sellerName={sellerName}
                imageUrl={item.sellerImageUrl}
                showInitialTooltip
              >
                {hasSellerLink ? (
                  /* biome-ignore lint/a11y/useSemanticElements: This control sits inside the card detail link, so a nested button/anchor would be invalid HTML. */
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={handleSellerClick}
                    onKeyDown={handleSellerKeyDown}
                    className="seller-card__avatar w-5! h-5! text-[9px]! rounded! shrink-0 overflow-hidden inline-flex items-center justify-center cursor-pointer"
                    aria-label={copy.viewSeller(sellerName)}
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
                    /* biome-ignore lint/a11y/useSemanticElements: This control sits inside the card detail link, so a nested button/anchor would be invalid HTML. */
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

            {/* Price */}
            <div className="card-price-area mt-2">
              <div className="card-price-row">
                <span className="card-price-main text-base!">
                  {formatPrice(
                    item.priceMin,
                    item.priceMax,
                    currencySymbol,
                    exchangeRate,
                    copy.priceUnavailable,
                  )}
                </span>
              </div>
            </div>

            {/* Footer row: time ago + reviews */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground">
                {timeAgo(item.date, copy.time, now)}
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
        </a>
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
  now,
}: WhatsNewSectionProps) {
  const t = useTranslations("home.whatsNewSection");
  const [activeTab, setActiveTab] = useState<Tab>("newest");
  const { symbol, rate } = useAtomValue(currencyDisplayAtom);

  // Two-pass render: first render must match SSR output (exchangeRates starts
  // empty → rate=1) so hydration succeeds. After mount, switch to real rate.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const currencySymbol = mounted ? symbol : "\u00A3";
  const exchangeRate = mounted ? rate : 1;

  const items = activeTab === "newest" ? newest : recentlyUpdated;
  const itemCardCopy: HomeItemCardCopy = useMemo(
    () => ({
      priceUnavailable: t("priceUnavailable"),
      unknownSeller: t("unknownSeller"),
      viewSeller: (seller) => t("viewSeller", { seller }),
      alternateImageAlt: (item) => t("alternateImageAlt", { item }),
      time: {
        justNow: t("time.justNow"),
        hoursAgo: (count) => t("time.hoursAgo", { count }),
        oneDayAgo: t("time.oneDayAgo"),
        daysAgo: (count) => t("time.daysAgo", { count }),
        monthsAgo: (count) => t("time.monthsAgo", { count }),
      },
    }),
    [t],
  );
  const header = useRevealOnScroll<HTMLDivElement>();
  const carousel = useRevealOnScroll<HTMLDivElement>();

  // CSS scroll-snap strip (replaces Swiper — kept it out of the home page's
  // critical bundle). The prev/next buttons advance by one card width; no
  // looping (the Swiper setup had none either).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollByCard = useCallback((direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const slide = scroller.querySelector<HTMLElement>(".whats-new-slide");
    if (!slide) return;
    const gap = Number.parseFloat(getComputedStyle(scroller).columnGap) || 12;
    scroller.scrollBy({
      left: direction * (slide.offsetWidth + gap),
      behavior: "smooth",
    });
  }, []);

  return (
    <section className="py-20 bg-background">
      {/* Header area - contained */}
      <div className="max-w-7xl mx-auto px-4">
        <div
          ref={header.ref}
          data-revealed={header.revealed}
          className="reveal-fade"
        >
          {/* Section label */}
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
            {t("eyebrow")}
          </p>

          {/* Section heading */}
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            {t("heading")}
          </h2>
          <p className="text-muted mb-8">{t("description")}</p>

          {/* Tab switcher + scroll arrows */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-1 rounded-xl bg-surface p-1">
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
                  <span className="hidden sm:inline">{t(tab.labelKey)}</span>
                </button>
              ))}
            </div>

            {/* Scroll arrows - desktop only */}
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollByCard(-1)}
                className="whats-new-prev rounded-full border border-border p-2 text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                aria-label={t("scrollLeft")}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => scrollByCard(1)}
                className="whats-new-next rounded-full border border-border p-2 text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                aria-label={t("scrollRight")}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Card strip — CSS scroll-snap (Swiper removed from the critical bundle) */}
      <div className="overflow-hidden">
        <div
          ref={carousel.ref}
          data-revealed={carousel.revealed}
          className="reveal-fade"
        >
          {/* Re-keyed on tab change so the enter animation replays (and the
              scroll position resets) — CSS stand-in for AnimatePresence
              mode="wait". Card widths per breakpoint replicate the previous
              Swiper slidesPerView/spaceBetween config (see whats-new.css). */}
          <div key={activeTab} className="tab-switch-fade">
            <div
              ref={scrollerRef}
              className="whats-new-scroller"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: horizontal scroller must be keyboard-scrollable
              tabIndex={0}
            >
              {items.map((item) => (
                <div
                  key={`${activeTab}-${item.id}`}
                  className="whats-new-slide"
                >
                  <HomeItemCard
                    item={item}
                    currencySymbol={currencySymbol}
                    exchangeRate={exchangeRate}
                    copy={itemCardCopy}
                    now={now}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Browse CTA */}
      <div className="max-w-7xl mx-auto px-4 mt-8 flex justify-center">
        <Link
          href="/browse"
          prefetch={false}
          className="group inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition-all hover:border-primary/30 hover:text-primary"
        >
          {t("browseAll")}
          <ArrowRight
            size={16}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </section>
  );
}
