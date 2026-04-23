"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Swiper, SwiperSlide } from "swiper/react";
import { Keyboard, EffectFade } from "swiper/modules";
import type { Swiper as SwiperInstance } from "swiper/types";
import "swiper/css";
import "swiper/css/effect-fade";
import { SuggestLink } from "@/components/SuggestLink";
import {
  X,
  Star,
  Clock,
  ChevronLeft,
  ChevronRight,
  Truck,
  Package,
  Award,
  Plus,
  Check,
} from "lucide-react";
import {
  expandedRefNumAtom,
  itemsAtom,
  sortedItemsAtom,
  sellerModalIdAtom,
  sellersMapAtom,
  currencyDisplayAtom,
  addToBasketAtom,
  marketAtom,
  focusReviewIdAtom,
} from "@/store/atoms";
import { cx } from "@/lib/cn";
import { parseVariant } from "@/lib/variants";
import { fmtPrice, formatPriceChange, formatDateTime } from "@/lib/format";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useHistoryState } from "@/hooks/useHistoryState";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { ReviewCard, ReviewStatsHeader, type Review } from "@/components/ReviewCard";
import { useAddToast } from "@/components/Toast";
import { getSellerImageUrl } from "@/lib/images";
import type { Item, PriceSnapshot, MergedDetailBlob } from "@/lib/types";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

/* ── Review shape from merged detail ── */
interface ItemReview {
  id: number;
  created: number;
  rating: number;
  daysToArrive: number | null;
  segments: { type: string; value: string }[];
  item?: { refNum: string; name: string; id: number };
}

/* ── Helpers ── */
const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};
const ENTITY_RE = /&(?:amp|lt|gt|quot|#39|apos);/g;
function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (m) => ENTITY_MAP[m] ?? m);
}

/* Human-friendly labels + value formatters for item attributes (`at` field). */
const AT_LABELS: Record<string, string> = {
  effect: "Effect",
  cbd: "CBD",
  grow: "Grow",
  tier: "Tier",
  imported: "Imported",
  micron: "Micron",
  origin: "Origin",
  fullMelt: "Full Melt",
  mg: "Potency",
  vegan: "Vegan",
  mlSize: "Size",
  purity: "Purity",
  delta: "Type",
  terped: "Terped",
  species: "Species",
};

function formatAttrValue(key: string, val: string | number | boolean): string {
  if (key === "delta") {
    if (val === "d9") return "Delta-9";
    if (val === "d8") return "Delta-8";
    return String(val);
  }
  if (key === "mlSize") return `${val} ml`;
  if (key === "purity") return `${val}%`;
  if (key === "mg") return `${val} mg`;
  if (key === "micron") return String(val);
  if (typeof val === "string") {
    // Title case multi-word with hyphens/spaces
    return val
      .split(/[\s-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return String(val);
}

function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/* ── Reviews block (shared between inline + ultrawide column) ── */
function ItemReviewsBlock({
  reviews,
  rs,
  loading,
  compact,
  shareLink,
  focusReviewId,
  onFocusHandled,
}: {
  reviews: ItemReview[];
  rs?: { avg?: number | null; cnt?: number | null; days?: number | null } | null;
  loading: boolean;
  compact?: boolean;
  shareLink?: string | null;
  /** If set, flag the matching review for scroll-into-view + highlight. */
  focusReviewId?: number | null;
  /** Called after the focused review has been rendered, so the parent can
      clear the global focus atom and not re-trigger on every rerender. */
  onFocusHandled?: () => void;
}) {
  // Always render every review in the merged-detail blob. We used to truncate
  // to 5 in compact mode, but the full list is already cached and the user
  // should never see "+N more reviews" on mobile \u2014 it felt like a bug when the
  // section header says "100 reviews" but only shows 5.
  const shown = reviews;

  const focusMatched = focusReviewId != null && reviews.some((r) => r.id === focusReviewId);
  // Clear the focus atom once we've handed off the highlight flag to the
  // matching card (useEffect runs after render so the scroll can happen).
  useEffect(() => {
    if (focusMatched && onFocusHandled) {
      onFocusHandled();
    }
  }, [focusMatched, onFocusHandled]);

  return (
    <>
      <h3 className={compact
        ? "mb-1 text-xs font-medium uppercase tracking-wider text-muted"
        : "text-sm font-semibold text-foreground mb-1"
      }>
        Reviews
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
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted">No reviews available</p>
      ) : (
        <div className={compact ? "space-y-2" : "space-y-2"}>
          {shown.map((r) => (
            <ReviewCard
              key={r.id}
              review={r as Review}
              compact={compact}
              highlighted={focusReviewId != null && r.id === focusReviewId}
            />
          ))}
        </div>
      )}
      {shareLink && reviews.length >= 2 && (rs?.cnt ?? 0) > reviews.length && (
        <p className="ido-reviews-hint">Read more reviews at:</p>
      )}
    </>
  );
}

/* ── Scroll-spy tabs for item detail sections (mobile + desktop) ── */
type SectionId = "prices" | "description" | "reviews";
const SECTION_TAB_LABELS: Record<SectionId, string> = {
  prices: "Prices",
  description: "Description",
  reviews: "Reviews",
};

function ItemDetailTabs({
  scrollRef,
  refNum,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  refNum: string | number | null;
}) {
  const [active, setActive] = useState<SectionId>("prices");
  const manualRef = useRef(false);
  const manualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on item change
  useEffect(() => {
    setActive("prices");
  }, [refNum]);

  // Scroll-spy via IntersectionObserver (scrollRef is the root on desktop;
  // on mobile the panel itself scrolls, so fall back to viewport)
  useEffect(() => {
    const root = scrollRef.current;
    // Query sections inside root (or document if root isn't the scroller)
    const findSections = (): HTMLElement[] => {
      const scope: ParentNode = root ?? document;
      return Array.from(scope.querySelectorAll<HTMLElement>("[data-section-id]"));
    };

    let sections = findSections();
    if (sections.length === 0) {
      // Content may not have mounted yet — retry next frame
      const raf = requestAnimationFrame(() => {
        sections = findSections();
        if (sections.length) setup();
      });
      return () => cancelAnimationFrame(raf);
    }

    let observer: IntersectionObserver | null = null;
    const visible = new Map<string, number>();

    function pick() {
      if (manualRef.current) return;
      if (visible.size === 0) return;
      // Pick the section whose top is closest to (at or just above) the header offset
      const HEADER_OFFSET = 64;
      let bestId: SectionId | null = null;
      let bestTop = -Infinity;
      visible.forEach((top, id) => {
        if (top <= HEADER_OFFSET && top > bestTop) {
          bestTop = top;
          bestId = id as SectionId;
        }
      });
      if (!bestId) {
        // Nothing has crossed yet — pick the highest visible
        let lowest = Infinity;
        visible.forEach((top, id) => {
          if (top < lowest) { lowest = top; bestId = id as SectionId; }
        });
        if (bestId) setActive(bestId);
        return;
      }
      setActive(bestId);
    }

    function setup() {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = entry.target.getAttribute("data-section-id");
            if (!id) continue;
            if (entry.isIntersecting) {
              visible.set(id, entry.boundingClientRect.top);
            } else {
              visible.delete(id);
            }
          }
          // Refresh tops for all visible entries (scroll event isn't fired here)
          visible.forEach((_, id) => {
            const el = (root ?? document).querySelector<HTMLElement>(`[data-section-id="${id}"]`);
            if (el) visible.set(id, el.getBoundingClientRect().top);
          });
          pick();
        },
        { threshold: [0, 0.1, 0.25, 0.5, 0.9, 1] },
      );
      for (const s of sections) observer.observe(s);
    }

    setup();

    return () => {
      observer?.disconnect();
      visible.clear();
    };
  }, [scrollRef, refNum]);

  const scrollTo = (id: SectionId) => {
    const root = scrollRef.current ?? document;
    const target = (root as ParentNode).querySelector<HTMLElement>(`[data-section-id="${id}"]`);
    if (!target) return;
    setActive(id);
    manualRef.current = true;
    if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    manualTimerRef.current = setTimeout(() => { manualRef.current = false; }, 800);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="ido-tabs">
      {(Object.keys(SECTION_TAB_LABELS) as SectionId[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => scrollTo(key)}
          className={cx(
            "ido-tab",
            `ido-tab--${key}`,
            active === key && "ido-tab--active",
          )}
        >
          {SECTION_TAB_LABELS[key]}
        </button>
      ))}
    </div>
  );
}

/* ── Component ── */
export function ItemDetailOverlay() {
  const [refNum, setRefNum] = useAtom(expandedRefNumAtom);
  const [focusReviewId, setFocusReviewId] = useAtom(focusReviewIdAtom);
  const items = useAtomValue(itemsAtom);
  const sortedItems = useAtomValue(sortedItemsAtom);
  const setSellerModalId = useSetAtom(sellerModalIdAtom);
  const sellersMap = useAtomValue(sellersMapAtom);
  const addToBasket = useSetAtom(addToBasketAtom);
  const addToast = useAddToast();
  const { symbol: cSym, rate: cRate } = useAtomValue(currencyDisplayAtom);

  const [closing, setClosing] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lookup current item
  const item = useMemo(() => {
    if (!refNum) return null;
    return (
      items.find(
        (i) => String(i.refNum) === refNum || String(i.id) === refNum,
      ) ?? null
    );
  }, [items, refNum]);

  const isOpen = !!refNum;

  // Lock body scroll
  useBodyScrollLock(isOpen);

  // Core close: play animation then clear atom
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doClose = useCallback(() => {
    setClosing(true);
    closingTimerRef.current = setTimeout(() => {
      setRefNum(null);
      setClosing(false);
    }, 150);
  }, [setRefNum]);

  // Clean up timer on unmount
  useEffect(() => () => {
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
  }, []);

  // History state — pressing Back closes the overlay via onClose → doClose
  const { closeOverlay } = useHistoryState({
    id: "item-overlay",
    type: "modal",
    isOpen,
    onClose: doClose,
  });

  // Programmatic close — balances history first (history.back()),
  // then plays animation + clears atom via doClose.
  const close = useCallback(() => {
    if (isOpen) closeOverlay();
  }, [isOpen, closeOverlay]);

  // URL cosmetics — show /item/{ref} while overlay is open, restore original on close
  useEffect(() => {
    if (!refNum) return;
    const nativeReplace = History.prototype.replaceState;
    const originalUrl = window.location.href;
    const id = requestAnimationFrame(() => {
      nativeReplace.call(
        window.history,
        window.history.state,
        "",
        `/item/${refNum}`,
      );
    });
    return () => {
      cancelAnimationFrame(id);
      nativeReplace.call(window.history, window.history.state, "", originalUrl);
    };
  }, [refNum]);

  // Prev/next navigation
  const selfIndex = useMemo(() => {
    if (!refNum) return -1;
    return sortedItems.findIndex(
      (i) => String(i.refNum) === refNum || String(i.id) === refNum,
    );
  }, [refNum, sortedItems]);

  const hasPrev = selfIndex > 0;
  const hasNext = selfIndex >= 0 && selfIndex < sortedItems.length - 1;

  const gotoPrev = useCallback(() => {
    if (!hasPrev) return;
    const prev = sortedItems[selfIndex - 1];
    setRefNum(String(prev.refNum ?? prev.id));
  }, [hasPrev, sortedItems, selfIndex, setRefNum]);

  const gotoNext = useCallback(() => {
    if (!hasNext) return;
    const next = sortedItems[selfIndex + 1];
    setRefNum(String(next.refNum ?? next.id));
  }, [hasNext, sortedItems, selfIndex, setRefNum]);

  // Keyboard navigation
  useEffect(() => {
    if (!refNum) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        gotoPrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        gotoNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refNum, close, hasPrev, hasNext, gotoPrev, gotoNext]);

  // Reset scroll on item change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [refNum]);

  // ── Merged detail blob — complete item data + extras ──
  const market = useAtomValue(marketAtom);
  const [mergedDetail, setMergedDetail] = useState<MergedDetailBlob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!refNum || !market) {
      setMergedDetail(null);
      setDetailLoading(false);
      return;
    }
    detailAbortRef.current?.abort();
    const ac = new AbortController();
    detailAbortRef.current = ac;
    setDetailLoading(true);
    fetch(
      `/api/item-detail/${encodeURIComponent(refNum)}?mkt=${encodeURIComponent(market.toLowerCase())}`,
      { signal: ac.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((detail) => {
        if (!ac.signal.aborted) {
          setMergedDetail(detail);
          setDetailLoading(false);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setDetailLoading(false);
      });
    return () => ac.abort();
  }, [refNum, market]);

  // ── Effective item: atom (browse page) or merged detail (other pages) ──
  const displayItem: Item | null = item ?? mergedDetail;
  // Treat as loading if refNum is set but neither source resolved yet (avoids flash of "not found")
  const isLoading = detailLoading || (!!refNum && !item && !mergedDetail);

  // ── Gallery images ──
  const images = useMemo(() => {
    if (!displayItem) return [];
    const urls: string[] = [];
    const seen = new Set<string>();
    const add = (u: string) => {
      if (u && !seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    };
    if (displayItem.i) add(displayItem.i);
    if (displayItem.is) displayItem.is.forEach(add);
    return urls;
  }, [displayItem]);

  // ── Swiper state ──
  const [mainSwiper, setMainSwiper] = useState<SwiperInstance | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  // Reset swiper on item change
  useEffect(() => {
    setActiveSlide(0);
    if (mainSwiper) {
      try {
        mainSwiper.slideTo(0, 0);
      } catch {}
    }
  }, [refNum, mainSwiper]);

  // ── Zoom preview ──
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);
  const [startZoomIndex, setStartZoomIndex] = useState(0);

  const openZoom = useCallback(
    (index: number) => {
      setStartZoomIndex(index);
      setZoomSignal(Date.now());
    },
    [],
  );

  // ── Selected shipping cost (local to overlay) ──
  const [selectedShipCost, setSelectedShipCost] = useState(0);

  // ── Cart add indicator ──
  const [addedVariantKey, setAddedVariantKey] = useState<string | null>(null);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset shipping selection when item changes
  useEffect(() => {
    setSelectedShipCost(0);
  }, [refNum]);

  // ── Extras from merged detail ──
  const shipOptions = mergedDetail?.shOpts ?? [];
  const priceHistory = mergedDetail?.ph ?? [];

  // Derive last price from price history (replaces lp field)
  const lastPrice = useMemo(() => {
    if (priceHistory.length >= 2) {
      return priceHistory[priceHistory.length - 2].min;
    }
    return null;
  }, [priceHistory]);

  // ── Reviews from merged detail blob ──
  const itemReviews: ItemReview[] = useMemo(
    () => (mergedDetail?.reviews as ItemReview[] | undefined) ?? [],
    [mergedDetail],
  );

  // ── Variant rows for table ──
  const variantRows = useMemo(() => {
    if (!displayItem?.v || displayItem.v.length === 0) return null;
    // For weight-based categories a bare-number variant label ("7", "14 mixed") implies grams.
    const weightCats = new Set(["Flower", "Shake", "Hash", "Concentrates"]);
    const isWeightCat = weightCats.has(displayItem.c ?? "");
    const BARE_NUM_RE = /^\s*(\d+(?:\.\d+)?)(?:\s|$|[^a-zA-Z])/;
    return displayItem.v
      .filter((v) => v.usd > 0)
      .map((v, i) => {
        const parsed = parseVariant(v);
        let grams = parsed?.grams ?? null;
        if (grams == null && isWeightCat) {
          const label = v.dEn || v.d || "";
          const m = BARE_NUM_RE.exec(label);
          if (m) {
            const n = parseFloat(m[1]);
            if (Number.isFinite(n) && n > 0 && n <= 2000) grams = n;
          }
        }
        return {
          key: v.vid != null ? String(v.vid) : String(i),
          label: v.dEn || v.d || "—",
          price: v.usd,
          grams,
          ppg: grams != null && grams > 0 ? v.usd / grams : null,
        };
      });
  }, [displayItem?.v, displayItem?.c]);

  const bestValueKey = useMemo(() => {
    if (!variantRows || variantRows.length <= 1) return null;
    let best: { key: string; ppg: number } | null = null;
    for (const row of variantRows) {
      if (row.ppg != null && (!best || row.ppg < best.ppg)) {
        best = { key: row.key, ppg: row.ppg };
      }
    }
    return best?.key ?? null;
  }, [variantRows]);

  // Don't render if no refNum
  if (!refNum && !closing) return null;

  const name = displayItem ? decodeEntities(displayItem.n) : "";

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={cx("ido-backdrop", closing && "ido-backdrop--closing")}
        onMouseDown={() => close()}
      >
        {/* Nav wrapper — outside panel, with nav arrows */}
        <div className="ido-nav-wrapper">
          {/* Left nav */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={gotoPrev}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!hasPrev}
              aria-label="Previous item"
              className="ido-nav-zone"
            >
              <span className="ido-nav-btn">
                <ChevronLeft size={20} />
              </span>
            </button>
          </div>

          {/* Panel */}
          <div
            className={cx("ido-panel", closing && "ido-panel--closing")}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={name}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={close}
              className="ido-close"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            {displayItem ? (
              <>
              <div className="ido-grid">
                {/* ── Left: Gallery ── */}
                <div className="ido-left">
                  <div className="ido-image-area">
                    {images.length > 0 ? (
                      <>
                        <Swiper
                          modules={[Keyboard, EffectFade]}
                          effect="fade"
                          fadeEffect={{ crossFade: true }}
                          keyboard={{ enabled: true }}
                          spaceBetween={0}
                          slidesPerView={1}
                          onSwiper={setMainSwiper}
                          onSlideChange={(sw) =>
                            setActiveSlide(sw.activeIndex ?? 0)
                          }
                          className="ido-swiper"
                        >
                          {images.map((src, idx) => (
                            <SwiperSlide key={`${idx}-${src}`}>
                              <button
                                type="button"
                                onClick={() => openZoom(idx)}
                                className="w-full h-full focus:outline-none"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={src}
                                  alt={name}
                                  loading={idx === 0 ? "eager" : "lazy"}
                                  decoding="async"
                                  draggable={false}
                                />
                              </button>
                            </SwiperSlide>
                          ))}
                        </Swiper>

                        {/* Thumbnails (mobile: overlay at bottom, desktop: below swiper) */}
                        {images.length > 1 && (
                          <div className="absolute bottom-3 left-3 z-20 md:relative md:bottom-auto md:left-auto md:mt-3 md:flex md:justify-center">
                            <div className="ido-thumbs">
                              {images.map((src, idx) => (
                                <button
                                  key={`thumb-${idx}`}
                                  type="button"
                                  onClick={() =>
                                    mainSwiper?.slideTo(idx)
                                  }
                                  className={cx(
                                    "ido-thumb",
                                    activeSlide === idx && "ido-thumb--active",
                                  )}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={src}
                                    alt={`${name} ${idx + 1}`}
                                    loading="lazy"
                                    decoding="async"
                                    draggable={false}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center bg-surface rounded-lg">
                        <Package
                          size={64}
                          className="text-muted opacity-30"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Center: Item info ── */}
                <div className="ido-center" ref={scrollRef}>
                  {/* Header region (above sticky tabs) */}
                  <div className="ido-center__header">
                    {/* Category + subcategories */}
                    <div className="flex flex-wrap gap-1.5">
                      {displayItem.c && (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {displayItem.c}
                        </span>
                      )}
                      {displayItem.sc?.map((sc) => (
                        <span
                          key={sc}
                          className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted"
                        >
                          {sc}
                        </span>
                      ))}
                    </div>

                    {/* Name */}
                    <h2 className="text-xl font-bold text-foreground">
                      {name}
                    </h2>

                    {/* Seller */}
                    {displayItem.sn && (() => {
                      const sid = displayItem.sid != null ? String(displayItem.sid) : null;
                      const indexSeller = sid ? sellersMap.get(sid) : undefined;
                      const sellerImg = getSellerImageUrl(indexSeller?.imageUrl);
                      const sellerOnline = indexSeller?.online ?? null;
                      return (
                        <button
                          type="button"
                          className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
                          onClick={() => { if (sid) setSellerModalId(sid); }}
                        >
                          <SellerAvatarTooltip
                            sellerName={displayItem.sn}
                            imageUrl={sellerImg}
                            showInitialTooltip
                          >
                            <span className="relative inline-flex items-center justify-center size-6 rounded-full bg-surface text-xs font-medium text-foreground ring-1 ring-border overflow-hidden">
                              {sellerImg ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={sellerImg} alt="" className="w-full h-full object-cover" />
                              ) : (
                                displayItem.sn.charAt(0).toUpperCase()
                              )}
                              {sellerOnline === "today" && (
                                <span className="absolute -bottom-px -right-px size-2 rounded-full bg-emerald-500 ring-1 ring-background" />
                              )}
                            </span>
                          </SellerAvatarTooltip>
                          <span>
                            by{" "}
                            <span className="font-medium text-foreground">
                              {decodeEntities(displayItem.sn)}
                            </span>
                          </span>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Sticky scroll-spy tabs (direct child of scroll container) */}
                  <ItemDetailTabs scrollRef={scrollRef} refNum={refNum} />

                  {/* Sections wrapper */}
                  <div className="ido-center__body">

                    {/* ── Prices section ── */}
                    <section data-section-id="prices" className="ido-section">
                    {/* Price header */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-lg font-semibold ${selectedShipCost > 0 ? "text-amber-600 dark:text-amber-400" : "text-primary"}`}>
                        {fmtPrice(
                          displayItem.uMin != null ? displayItem.uMin + selectedShipCost : displayItem.uMin,
                          cSym,
                          cRate,
                        )}
                        {displayItem.uMax != null &&
                          displayItem.uMax !== displayItem.uMin &&
                          ` – ${fmtPrice(displayItem.uMax + selectedShipCost, cSym, cRate)}`}
                        {selectedShipCost > 0 && (
                          <Truck size={13} className="inline ml-1.5 -mt-0.5 opacity-70" />
                        )}
                      </span>
                      {lastPrice != null && displayItem.uMin != null && (() => {
                        const change = formatPriceChange(lastPrice, displayItem.uMin);
                        if (!change) return null;
                        const isDown = change.startsWith("\u2193");
                        return (
                          <span className={`ido-price-badge ${isDown ? "ido-price-badge--down" : "ido-price-badge--up"}`}>
                            {change}
                            <span className="ido-price-badge__was">
                              was {fmtPrice(lastPrice, cSym, cRate)}
                            </span>
                          </span>
                        );
                      })()}
                    </div>

                    {/* Variants + shipping card */}
                    {variantRows && variantRows.length > 0 && (
                      <div className="ido-card ido-card--variants">
                        <div className="ido-table__caption">
                          <span>Variants</span>
                          <span className="ido-table__count">{variantRows.length}</span>
                        </div>
                        <table className="ido-table">
                          {variantRows.some((r) => r.ppg != null) ? (
                            <thead>
                              <tr>
                                <th>Size</th>
                                <th>Price</th>
                                <th>
                                  <abbr title="Price per gram">/g</abbr>
                                </th>
                                <th className="sr-only">Add</th>
                              </tr>
                            </thead>
                          ) : (
                            <thead className="sr-only">
                              <tr>
                                <th>Variant</th>
                                <th>Price</th>
                                <th>Add</th>
                              </tr>
                            </thead>
                          )}
                          <tbody>
                            {variantRows.map((row) => {
                              const isBest = bestValueKey === row.key;
                              const totalPrice = row.price + selectedShipCost;
                              const totalPpg =
                                row.ppg != null && row.grams
                                  ? totalPrice / row.grams
                                  : row.ppg;
                              return (
                                <tr key={row.key}>
                                  <td>
                                    <span className="ido-table__format">
                                      {row.label}
                                      {isBest && (
                                        <span className="ido-best-value">
                                          <Award size={9} /> Best value
                                        </span>
                                      )}
                                    </span>
                                  </td>
                                  <td className={`ido-table__price${selectedShipCost > 0 ? " text-amber-600 dark:text-amber-400" : ""}`}>
                                    {fmtPrice(totalPrice, cSym, cRate)}
                                  </td>
                                  {variantRows.some((r) => r.ppg != null) && (
                                    <td className={`ido-table__ppu${selectedShipCost > 0 ? " text-amber-600 dark:text-amber-400" : ""}`}>
                                      {totalPpg != null
                                        ? fmtPrice(totalPpg, cSym, cRate)
                                        : "—"}
                                    </td>
                                  )}
                                  <td className="ido-table__action">
                                    <button
                                      type="button"
                                      className={`ido-add-btn${addedVariantKey === row.key ? " ido-add-btn--added" : ""}`}
                                      title="Add to basket"
                                      onClick={() => {
                                        const ref = String(displayItem.refNum ?? displayItem.id);
                                        addToBasket({
                                          refNum: ref,
                                          variantId: row.key,
                                          variantDesc: row.label,
                                          name: name,
                                          sellerName: displayItem.sn ?? "",
                                          qty: 1,
                                          priceUSD: row.price,
                                          shippingUsd: selectedShipCost > 0 ? selectedShipCost : shipOptions[0]?.cost ?? null,
                                          includeShip: selectedShipCost > 0,
                                          shOpts: shipOptions.length > 0 ? shipOptions : undefined,
                                          imageUrl: displayItem.i ?? null,
                                          sl: displayItem.sl ?? null,
                                        });
                                        if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
                                        setAddedVariantKey(row.key);
                                        addedTimerRef.current = setTimeout(() => setAddedVariantKey(null), 1200);
                                        addToast({
                                          message: `Added ${row.label} to basket`,
                                          variant: "success",
                                          duration: 2200,
                                        });
                                      }}
                                    >
                                      {addedVariantKey === row.key ? <Check size={14} /> : <Plus size={14} />}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Shipping options — selectable */}
                        <ShippingOptions
                          sh={displayItem.sh}
                          shipOptions={shipOptions}
                          cSym={cSym}
                          cRate={cRate}
                          setSelectedShipCost={setSelectedShipCost}
                        />
                      </div>
                    )}

                    {/* Review stats + timestamps (meta strip) */}
                    <div className="ido-meta-strip">
                      {displayItem.rs?.avg != null && (
                        <span className="ido-meta-strip__item">
                          <Star size={14} className="text-amber-500" />
                          <span className="ido-meta-strip__value">{displayItem.rs.avg.toFixed(1)}/10</span>
                          {displayItem.rs.cnt != null && (
                            <span className="ido-meta-strip__hint">({displayItem.rs.cnt})</span>
                          )}
                        </span>
                      )}
                      {displayItem.rs?.days != null && (
                        <span className="ido-meta-strip__item">
                          <Clock size={14} />
                          <span className="ido-meta-strip__value">{displayItem.rs.days.toFixed(1)}d</span>
                          <span className="ido-meta-strip__hint">avg delivery</span>
                        </span>
                      )}
                      {(!variantRows || variantRows.length === 0) && shipOptions.length > 0 && (
                        <span className="ido-meta-strip__item">
                          <Truck size={14} />
                          <span className="ido-meta-strip__value">
                            {shipOptions.some(o => o.cost === 0)
                              ? "Free shipping"
                              : `${fmtPrice(Math.min(...shipOptions.map(o => o.cost)), cSym, cRate)} – ${fmtPrice(Math.max(...shipOptions.map(o => o.cost)), cSym, cRate)}`}
                          </span>
                        </span>
                      )}
                      {displayItem.fsa && (
                        <span className="ido-meta-strip__item ido-meta-strip__item--muted">
                          <span className="ido-meta-strip__hint">Listed</span>
                          <span>{timeAgo(displayItem.fsa)}</span>
                        </span>
                      )}
                      {displayItem.lua && (
                        <span className="ido-meta-strip__item ido-meta-strip__item--muted">
                          <span className="ido-meta-strip__hint">Updated</span>
                          <span>{timeAgo(displayItem.lua)}</span>
                        </span>
                      )}
                    </div>
                    </section>

                    {/* ── Description section ── */}
                    <section data-section-id="description" className="ido-section">
                    {/* Description */}
                    <div className="ido-card">
                      <div className="ido-card__head">
                        <h3 className="ido-card__title">Description</h3>
                      </div>
                      <div className="ido-card__body">
                        {(mergedDetail?.d || displayItem.d) ? (
                          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                            {decodeEntities(mergedDetail?.d || displayItem.d || "")}
                          </p>
                        ) : (
                          <p className="text-sm text-muted italic">No description provided.</p>
                        )}
                      </div>
                    </div>

                    {/* Attributes */}
                    {displayItem.at && Object.keys(displayItem.at).length > 0 && (
                      <div className="ido-card">
                        <div className="ido-card__head">
                          <h3 className="ido-card__title">Attributes</h3>
                        </div>
                        <div className="ido-card__body">
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(displayItem.at).flatMap(([key, vals]) => {
                              const label = AT_LABELS[key] ?? key;
                              const values: (string | number | boolean)[] = Array.isArray(vals)
                                ? vals
                                : vals == null
                                  ? []
                                  : [vals as string | number | boolean];
                              // Boolean-true attrs (e.g. cbd, vegan, imported, fullMelt,
                              // terped) render as a single label-only chip.
                              if (values.length === 1 && typeof values[0] === "boolean") {
                                if (!values[0]) return [];
                                return [
                                  <span key={key} className="ido-attr-chip ido-attr-chip--flag">
                                    <span className="ido-attr-chip__val">{label}</span>
                                  </span>,
                                ];
                              }
                              return values
                                .filter((v) => v !== false && v != null && v !== "")
                                .map((val) => (
                                  <span key={`${key}-${val}`} className="ido-attr-chip">
                                    <span className="ido-attr-chip__key">{label}</span>
                                    <span className="ido-attr-chip__val">
                                      {formatAttrValue(key, val)}
                                    </span>
                                  </span>
                                ));
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Price History — rendered after Description so the
                        section doesn't steal visual attention from pricing. */}
                    {priceHistory.length > 1 && (
                      <div className="ido-card">
                        <div className="ido-card__head">
                          <h3 className="ido-card__title">Price History</h3>
                          <span className="ido-card__count">{priceHistory.length}</span>
                        </div>
                        <div className="ido-card__body">
                          <ul className="ido-price-history__list">
                            {[...priceHistory].reverse().map((snap, idx, arr) => {
                              const prev = arr[idx + 1];
                              const change = prev ? formatPriceChange(prev.min, snap.min) : null;
                              return (
                                <li key={snap.d} className="ido-price-history__entry">
                                  <time className="ido-price-history__date" dateTime={snap.d}>
                                    {formatDateTime(snap.d)}
                                  </time>
                                  <span className="ido-price-history__price">
                                    {fmtPrice(snap.min, cSym, cRate)}
                                    {snap.max !== snap.min && (
                                      <span className="ido-price-history__range">
                                        {" "}&ndash; {fmtPrice(snap.max, cSym, cRate)}
                                      </span>
                                    )}
                                  </span>
                                  {change ? (
                                    <span
                                      className={`ido-price-history__change ${
                                        change.startsWith("\u2193")
                                          ? "ido-price-history__change--down"
                                          : "ido-price-history__change--up"
                                      }`}
                                    >
                                      {change}
                                    </span>
                                  ) : (
                                    <span className="ido-price-history__change ido-price-history__change--first">
                                      First tracked
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    )}

                    </section>

                    {/* ── Reviews section (always renders on non-ultrawide) ── */}
                    <section data-section-id="reviews" className="ido-section 2xl:hidden">
                      <ItemReviewsBlock
                        reviews={itemReviews}
                        rs={displayItem.rs}
                        loading={detailLoading}
                        shareLink={displayItem.sl}
                        focusReviewId={focusReviewId}
                        onFocusHandled={() => setFocusReviewId(null)}
                        compact
                      />
                    </section>

                    {/* Suggest link — mobile/tablet only. On desktop (2xl) it lives
                        at the bottom-left of the reviews column instead. */}
                    <div className="flex justify-end pt-1 2xl:hidden">
                      <SuggestLink refNum={displayItem.refNum ?? displayItem.id} iconOnly />
                    </div>
                  </div>
                </div>

                {/* ── Right: Reviews (ultrawide only) ── */}
                <div className="ido-right">
                  <ItemReviewsBlock
                    reviews={itemReviews}
                    rs={displayItem.rs}
                    loading={detailLoading}
                    shareLink={displayItem.sl}
                    focusReviewId={focusReviewId}
                    onFocusHandled={() => setFocusReviewId(null)}
                  />
                  {/* Desktop-only flag/report button pinned bottom-left of the
                      reviews column, mirroring the LittleBiggy button anchored
                      bottom-right of the panel. */}
                  <div className="ido-suggest-bottom">
                    <SuggestLink refNum={displayItem.refNum ?? displayItem.id} iconOnly />
                  </div>
                </div>
              </div>

              {/* Absolute "View on LittleBiggy" button (bottom-right of panel) */}
              {displayItem.sl && (
                <a
                  href={displayItem.sl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ido-lb-btn"
                >
                  <span className="ido-lb-btn__label">View on LittleBiggy</span>
                  <span className="ido-lb-btn__arrow" aria-hidden="true">→</span>
                </a>
              )}
              </>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted">Item not found.</p>
              </div>
            )}
          </div>

          {/* Right nav */}
          <div className="flex items-center justify-start">
            <button
              type="button"
              onClick={gotoNext}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!hasNext}
              aria-label="Next item"
              className="ido-nav-zone"
            >
              <span className="ido-nav-btn">
                <ChevronRight size={20} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ImageZoomPreview — lazy-loaded portal */}
      {images.length > 0 && (
        <Suspense fallback={null}>
          <ImageZoomPreview
            imageUrls={images}
            alt={name}
            openSignal={zoomSignal}
            startIndex={startZoomIndex}
          />
        </Suspense>
      )}
    </>
  );
}

/* ── Shipping options selector ── */
function ShippingOptions({
  sh,
  shipOptions,
  cSym,
  cRate,
  setSelectedShipCost,
}: {
  sh: Item["sh"];
  shipOptions: { label: string; cost: number }[];
  cSym: string;
  cRate: number;
  setSelectedShipCost: (v: number) => void;
}) {
  // Build display options. Real R2 labels (deduped) are preserved exactly
  // as the seller provided them — this is what the user cares about.
  // A synthetic "No shipping" chip is prepended (selected by default) so
  // users can see the base product price without shipping baked in. If
  // every real option is free (or sh.free with no real labels), the
  // "No shipping" chip is omitted since it's redundant.
  const options = useMemo(() => {
    const result: { label: string; value: number }[] = [];

    if (shipOptions.length > 0) {
      const deduped: { label: string; value: number }[] = [];
      for (const opt of shipOptions) {
        const cost = opt.cost ?? 0;
        if (deduped.some((r) => r.label === opt.label)) continue;
        deduped.push({ label: opt.label, value: cost });
      }
      const allFree = deduped.every((o) => o.value === 0);
      if (!allFree) result.push({ label: "No shipping", value: 0 });
      result.push(...deduped);
      return result;
    }

    // Fallback to aggregate sh.min/max when we have no real labels
    if (!sh) return result;
    if (sh.free) {
      result.push({ label: "Free shipping", value: 0 });
      return result;
    }
    const hasMin = sh.min != null && sh.min > 0;
    const hasMax = sh.max != null && sh.max > 0;
    if (hasMin || hasMax) result.push({ label: "No shipping", value: 0 });
    if (hasMin && hasMax && sh.max !== sh.min) {
      result.push({ label: "Cheapest", value: sh.min! });
      result.push({ label: "Highest", value: sh.max! });
    } else if (hasMin) {
      result.push({ label: "Shipping", value: sh.min! });
    } else if (hasMax) {
      result.push({ label: "Shipping", value: sh.max! });
    }
    return result;
  }, [sh, shipOptions]);

  // Selected index — default 0 ("No shipping" when present, else cheapest)
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Notify parent of the selected cost whenever options change or idx changes
  useEffect(() => {
    if (options.length === 0) {
      setSelectedShipCost(0);
      return;
    }
    const idx = Math.min(selectedIdx, options.length - 1);
    setSelectedShipCost(options[idx]?.value ?? 0);
  }, [options, selectedIdx, setSelectedShipCost]);

  if (options.length === 0) return null;

  return (
    <div className="ido-ship">
      <div className="ido-ship__head">
        <Truck size={13} className="ido-ship__icon" />
        <span className="ido-ship__label">Shipping</span>
      </div>
      <div className="ido-ship__chips">
        {options.map((opt, idx) => {
          const isSelected = selectedIdx === idx;
          const isNone = opt.label === "No shipping";
          const isFree = !isNone && opt.value === 0;
          const isPaid = !isNone && !isFree;
          return (
            <button
              key={`${opt.label}-${idx}`}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`ido-ship__chip${isSelected ? " ido-ship__chip--selected" : ""}${isNone ? " ido-ship__chip--none" : ""}${isFree ? " ido-ship__chip--free" : ""}${isPaid ? " ido-ship__chip--paid" : ""}`}
              title={opt.label}
            >
              <span className="ido-ship__chip-label">{opt.label}</span>
              {!isNone && (
                <span className="ido-ship__chip-cost">
                  {isFree ? "Free" : fmtPrice(opt.value, cSym, cRate)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
