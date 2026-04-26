"use client";

import { useAtom, useAtomValue } from "jotai";
import { Flag, Star, ThumbsUp, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Review, ReviewCard } from "@/components/ReviewCard";

import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { useHistoryState } from "@/hooks/useHistoryState";
import historyManager from "@/lib/historyManager";
import { getSellerImageUrl } from "@/lib/images";
import {
  categoryAtom,
  expandedRefNumAtom,
  marketAtom,
  selectedSellersAtom,
  sellerModalIdAtom,
  sellersMapAtom,
} from "@/store/atoms";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

/* ── Seller detail shape from R2 shared/sellers/{id}.json ── */
interface SellerReview {
  id: number;
  created: number;
  rating: number;
  daysToArrive: number | null;
  segments: { type: string; value: string }[];
  item: { refNum: string; name: string; id: number; imageUrl?: string };
  itemImage?: string;
}

interface SellerDetail {
  sellerId: string;
  sellerName: string;
  sellerUrl: string;
  imageUrl: string | null;
  sellerImageUrl: string | null;
  online: string | null;
  sellerOnline: string | null;
  sellerJoined: string | null;
  manifesto: string | null;
  share: string | null;
  overview: {
    itemsCount?: number;
    numberOfReviews?: number;
    averageDaysToArrive?: number;
  } | null;
  reviews: SellerReview[];
  reviewsMeta: { fetched: number; updatedAt?: string } | null;
}

/** Rating-based badge color (matches old biggyindex review-panel-N pattern) */
function ratingBucketClass(rating: number): string {
  if (rating <= 2)
    return "border-red-400/40 bg-red-500/10 dark:border-red-500/30 dark:bg-red-500/15";
  if (rating <= 4)
    return "border-orange-400/40 bg-orange-500/10 dark:border-orange-500/30 dark:bg-orange-500/15";
  if (rating <= 5)
    return "border-yellow-400/40 bg-yellow-500/10 dark:border-yellow-500/30 dark:bg-yellow-500/15";
  if (rating <= 7)
    return "border-lime-400/40 bg-lime-500/10 dark:border-lime-500/30 dark:bg-lime-500/15";
  if (rating <= 8)
    return "border-emerald-400/40 bg-emerald-500/10 dark:border-emerald-500/30 dark:bg-emerald-500/15";
  return "border-sky-400/40 bg-sky-500/10 dark:border-sky-500/30 dark:bg-sky-500/15";
}

/* ── Helpers ── */

/* ── Community feedback actions ── */
const FEEDBACK_API = process.env.NEXT_PUBLIC_SUGGESTIONS_API ?? "";
type FeedbackKind = "endorse" | "report";

function SellerFeedbackActions({
  sellerId,
  sellerName,
}: {
  sellerId: string;
  sellerName: string;
}) {
  const [submitted, setSubmitted] = useState<Record<FeedbackKind, boolean>>({
    endorse: false,
    report: false,
  });
  const [busy, setBusy] = useState<FeedbackKind | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSubmitted({
        endorse: !!localStorage.getItem(`bi:sf:endorse:${sellerId}`),
        report: !!localStorage.getItem(`bi:sf:report:${sellerId}`),
      });
    } catch {
      /* ignore */
    }
    setReportOpen(false);
    setReason("");
    setMessage(null);
  }, [sellerId]);

  const submit = useCallback(
    async (kind: FeedbackKind, reasonText?: string) => {
      if (!FEEDBACK_API) {
        setMessage("Feedback endpoint not configured.");
        return;
      }
      setBusy(kind);
      setMessage(null);
      try {
        const res = await fetch(`${FEEDBACK_API}/seller-feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sellerId,
            sellerName,
            kind,
            reason: reasonText || undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          duplicate?: boolean;
        };
        if (!res.ok) {
          if (res.status === 429) {
            setMessage(
              "You've hit the hourly limit (20 per hour). Try again later.",
            );
          } else {
            setMessage(data.error ?? `HTTP ${res.status}`);
          }
        } else {
          try {
            localStorage.setItem(
              `bi:sf:${kind}:${sellerId}`,
              String(Date.now()),
            );
          } catch {
            /* ignore */
          }
          setSubmitted((s) => ({ ...s, [kind]: true }));
          setMessage(
            data.duplicate
              ? "Thanks — your vote was added to an existing report."
              : "Thanks — a moderator will review.",
          );
          if (kind === "report") setReportOpen(false);
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Network error");
      } finally {
        setBusy(null);
      }
    },
    [sellerId, sellerName],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitted.endorse || busy !== null}
          onClick={() => submit("endorse")}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-muted hover:text-emerald-500 hover:border-emerald-500/40 disabled:opacity-60 disabled:cursor-default transition-colors"
        >
          <ThumbsUp size={12} />
          {submitted.endorse
            ? "Endorsed"
            : busy === "endorse"
              ? "Submitting…"
              : "Endorse seller"}
        </button>
        <button
          type="button"
          disabled={submitted.report || busy !== null}
          onClick={() => setReportOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-muted hover:text-red-500 hover:border-red-500/40 disabled:opacity-60 disabled:cursor-default transition-colors"
        >
          <Flag size={12} />
          {submitted.report ? "Reported" : "Report seller"}
        </button>
      </div>

      {reportOpen && !submitted.report && (
        <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            rows={3}
            placeholder="What did you notice? (scam, fake reviews, shipping issue…)"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-foreground outline-none focus:border-primary/40"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => submit("report", reason.trim())}
              className="rounded-md bg-red-500/90 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
            >
              {busy === "report" ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </div>
      )}

      {message && <p className="text-xs text-muted">{message}</p>}
    </div>
  );
}

/* ── Component ── */
export function SellerModal() {
  const [sellerId, setSellerId] = useAtom(sellerModalIdAtom);
  const sellersMap = useAtomValue(sellersMapAtom);
  const market = useAtomValue(marketAtom);
  const [, setRefNum] = useAtom(expandedRefNumAtom);
  const [, setSelectedSellers] = useAtom(selectedSellersAtom);
  const [, setCategory] = useAtom(categoryAtom);

  const [detail, setDetail] = useState<SellerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  /**
   * Review rating filter.
   *  - null: show all
   *  - number: exact rating bucket (1..10) — click a rating pill
   *  - "low": any rating <= 5 — click the "X low ratings" pill
   */
  const [ratingFilter, setRatingFilter] = useState<number | "low" | null>(null);
  const [avatarZoomSignal, setAvatarZoomSignal] = useState<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Seller from the index (instant)
  const indexSeller = sellerId ? sellersMap.get(sellerId) : undefined;
  const name = detail?.sellerName ?? indexSeller?.name ?? "Seller";
  const initial = name.charAt(0).toUpperCase();

  // Fetch detail on open
  useEffect(() => {
    if (!sellerId) {
      setDetail(null);
      setRatingFilter(null);
      return;
    }
    detailAbortRef.current?.abort();
    const ac = new AbortController();
    detailAbortRef.current = ac;
    setLoading(true);
    const mkt = String(market || "GB").toLowerCase();
    fetch(
      `/api/seller/${encodeURIComponent(String(sellerId))}?mkt=${encodeURIComponent(mkt)}`,
      { signal: ac.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!ac.signal.aborted) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [sellerId, market]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setSellerId(null);
    }, 150);
  }, [setSellerId]);

  // Register with history manager so pressing Back closes the modal
  // (rather than navigating away). Nested zoom overlays push their own entry
  // on top — so Back closes zoom first, then a second Back closes this modal.
  const { closeOverlay: closeViaHistory } = useHistoryState({
    id: `seller-modal-${sellerId ?? "none"}`,
    type: "modal",
    isOpen: !!sellerId && !closing,
    onClose: close,
    closeStrategy: "back",
  });

  // Escape to close
  useEffect(() => {
    if (!sellerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViaHistory();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sellerId, closeViaHistory]);

  // Lock body scroll
  useEffect(() => {
    if (!sellerId) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sellerId]);

  // Image from detail — optimized via CDN
  const rawImg = detail?.sellerImageUrl ?? detail?.imageUrl ?? null;
  const img = getSellerImageUrl(rawImg) ?? null;

  // Share link (matches old-biggyindex: prefer share, fall back to sellerUrl)
  const shareLink = useMemo(() => {
    if (!detail) return null;
    if (typeof detail.share === "string" && detail.share) return detail.share;
    if (detail.sellerUrl) return detail.sellerUrl;
    return null;
  }, [detail]);

  // Online status
  const online =
    detail?.sellerOnline ?? detail?.online ?? indexSeller?.online ?? null;

  // Reviews
  const reviews = useMemo(() => detail?.reviews ?? [], [detail]);

  // Rating distribution + low-rating warning
  const ratingStats = useMemo(() => {
    const out = {
      total: 0,
      buckets: [] as { rating: number; count: number }[],
      recentNegatives: 0,
    };
    if (reviews.length === 0) return out;
    const counts = new Map<number, number>();
    for (const r of reviews) {
      const bucket = Math.round(r.rating);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      if (bucket <= 5) out.recentNegatives++;
    }
    out.buckets = Array.from(counts.entries())
      .map(([rating, count]) => ({ rating, count }))
      .sort((a, b) => a.rating - b.rating);
    out.total = reviews.length;
    return out;
  }, [reviews]);

  // Stats
  const itemsCount =
    detail?.overview?.itemsCount ?? indexSeller?.itemsCount ?? null;
  const avgDays =
    detail?.overview?.averageDaysToArrive ??
    indexSeller?.averageDaysToArrive ??
    null;
  const avgRating = indexSeller?.averageRating ?? null;
  const numReviews =
    detail?.overview?.numberOfReviews ?? indexSeller?.numberOfReviews ?? null;

  const filterBySeller = useCallback(() => {
    if (!sellerId) return;
    const onBrowse = pathname?.endsWith("/browse");
    if (onBrowse) {
      // Already on /browse — just tweak atoms, no navigation/scroll jump.
      setSelectedSellers([sellerId]);
      setCategory("All");
      closeViaHistory();
      return;
    }
    // Navigate to /browse with the seller in the URL. Intentionally do NOT
    // touch atoms here — on the source page (e.g. /sellers) UrlSync Phase 2
    // would immediately race router.push and clobber the destination URL.
    // /browse's DataLoader reads ?sellers= on mount and hydrates the atom.
    historyManager.remove(`seller-modal-${sellerId}`);
    setSellerId(null);
    router.push(`/browse?sellers=${encodeURIComponent(sellerId)}`);
  }, [
    sellerId,
    pathname,
    setSelectedSellers,
    setCategory,
    closeViaHistory,
    setSellerId,
    router,
  ]);

  if (!sellerId) return null;

  return (
    <div
      ref={backdropRef}
      className={`modal-backdrop${closing ? " modal-backdrop--closing" : ""}`}
      style={{ zIndex: 210 }}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) closeViaHistory();
      }}
    >
      <div
        className={`modal-panel modal-panel--xl${closing ? " modal-panel--closing" : ""}`}
        style={{
          height: "min(90vh, 800px)",
          maxHeight: "calc(100dvh - 2rem)",
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={closeViaHistory}
          className="ido-close"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-0 h-full">
          {/* ── Left column: seller info ── */}
          <div className="min-w-0 p-5 md:overflow-y-auto md:border-r border-[var(--border)]">
            {/* Identity */}
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <SellerAvatarTooltip
                  sellerName={name}
                  imageUrl={img}
                  tooltipSize={200}
                >
                  <button
                    type="button"
                    onClick={() =>
                      img && setAvatarZoomSignal((s) => (s ?? 0) + 1)
                    }
                    disabled={!img}
                    aria-label={
                      img ? `Zoom ${name}'s profile image` : undefined
                    }
                    className={`w-20 h-20 rounded-xl overflow-hidden bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center transition-shadow ${
                      img
                        ? "cursor-zoom-in hover:shadow-md hover:border-primary/40"
                        : "cursor-default"
                    }`}
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt={name}
                        className="w-full h-full object-cover"
                        loading="eager"
                      />
                    ) : loading ? (
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--primary)]" />
                    ) : (
                      <span className="text-2xl font-bold text-muted">
                        {initial}
                      </span>
                    )}
                  </button>
                </SellerAvatarTooltip>
                {avatarZoomSignal != null && img && (
                  <Suspense fallback={null}>
                    <ImageZoomPreview
                      imageUrl={img}
                      alt={name}
                      openSignal={avatarZoomSignal}
                    />
                  </Suspense>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-foreground truncate">
                  {name}
                </h2>
                <div className="mt-1 text-xs text-muted flex items-center gap-3 flex-wrap">
                  {online && (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`size-1.5 rounded-full ${online === "today" ? "bg-emerald-500" : "bg-yellow-500"}`}
                      />
                      {online === "today"
                        ? "Online today"
                        : `Last seen ${online}`}
                    </span>
                  )}
                  {detail?.sellerJoined && (
                    <span>Joined {detail.sellerJoined}</span>
                  )}
                </div>

                {/* Stats row */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  {itemsCount != null && (
                    <button
                      type="button"
                      onClick={filterBySeller}
                      className="hover:text-primary transition-colors cursor-pointer"
                    >
                      {itemsCount} items
                    </button>
                  )}
                  {numReviews != null && <span>{numReviews} reviews</span>}
                  {avgRating != null && (
                    <span className="inline-flex items-center gap-0.5">
                      <Star
                        size={10}
                        className="fill-current text-yellow-500"
                      />
                      {avgRating.toFixed(1)}/10
                    </span>
                  )}
                  {avgDays != null && (
                    <span>~{Math.round(avgDays)}d delivery</span>
                  )}
                </div>
              </div>
            </div>

            {/* Manifesto */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                About
              </h3>
              {loading && !detail ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 bg-[var(--surface)] rounded w-5/6" />
                  <div className="h-3 bg-[var(--surface)] rounded w-3/4" />
                  <div className="h-3 bg-[var(--surface)] rounded w-2/3" />
                </div>
              ) : detail?.manifesto ? (
                <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
                  {detail.manifesto}
                </p>
              ) : (
                <p className="text-xs italic text-muted">
                  No description available
                </p>
              )}
            </div>

            {/* Community feedback */}
            {sellerId && (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <SellerFeedbackActions
                  sellerId={String(sellerId)}
                  sellerName={name}
                />
              </div>
            )}
          </div>

          {/* ── Right column: reviews ── */}
          <div className="min-w-0 flex flex-col min-h-0 overflow-hidden relative">
            {/* Reviews header (pr-14 reserves space for the close X) */}
            <div className="sticky top-0 z-10 bg-[var(--card)] border-b border-[var(--border)] px-5 py-3 pr-14">
              <h3 className="text-sm font-semibold text-foreground">Reviews</h3>
              <div className="text-[11px] text-muted flex items-baseline justify-between gap-3">
                <span>
                  {loading
                    ? "Loading..."
                    : `${reviews.length} recent${numReviews && numReviews > reviews.length ? ` (${numReviews} total)` : ""}`}
                </span>
                {avgDays != null && (
                  <span>~{Math.round(avgDays)}d avg delivery</span>
                )}
              </div>
              {ratingStats.total > 0 && (
                <div className="mt-2 rating-pill-group">
                  {ratingStats.recentNegatives > 0 &&
                    (() => {
                      const isActive = ratingFilter === "low";
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            setRatingFilter(isActive ? null : "low")
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-shadow cursor-pointer ${
                            ratingStats.recentNegatives > 6
                              ? "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-200"
                              : "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200"
                          } ${isActive ? "ring-2 ring-primary/50" : "hover:brightness-110"}`}
                          title={`${isActive ? "Remove" : "Apply"} low-rating filter (≤ 5/10) — ${ratingStats.recentNegatives} review${ratingStats.recentNegatives === 1 ? "" : "s"}`}
                        >
                          <span
                            className={`inline-block size-2 rounded-full ${ratingStats.recentNegatives > 6 ? "bg-red-500" : "bg-amber-500"}`}
                          />
                          {ratingStats.recentNegatives} low rating
                          {ratingStats.recentNegatives === 1 ? "" : "s"}
                        </button>
                      );
                    })()}
                  {ratingStats.buckets.map((b) => {
                    const isActive = ratingFilter === b.rating;
                    return (
                      <button
                        key={b.rating}
                        type="button"
                        onClick={() =>
                          setRatingFilter(isActive ? null : b.rating)
                        }
                        className={`rating-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-[11px] cursor-pointer ${
                          isActive
                            ? "rating-pill--active ring-2 ring-primary/50 " +
                              ratingBucketClass(b.rating)
                            : ratingBucketClass(b.rating)
                        }`}
                        title={`${isActive ? "Remove filter" : "Filter"}: ${b.count} review${b.count === 1 ? "" : "s"} rated ${b.rating}/10`}
                      >
                        <span className="font-semibold">{b.rating}/10</span>
                        <span className="opacity-80">{b.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reviews list */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-3 space-y-3">
              {loading && reviews.length === 0 ? (
                <div className="space-y-4 animate-pulse">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-3 bg-[var(--surface)] rounded w-1/4" />
                      <div className="h-3 bg-[var(--surface)] rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <p className="text-sm text-muted italic py-8 text-center">
                  No reviews yet
                </p>
              ) : (
                (() => {
                  const displayed =
                    ratingFilter == null
                      ? reviews
                      : ratingFilter === "low"
                        ? reviews.filter((r) => Math.round(r.rating) <= 5)
                        : reviews.filter(
                            (r) => Math.round(r.rating) === ratingFilter,
                          );
                  const emptyLabel =
                    ratingFilter === "low" ? "low-rated" : `${ratingFilter}/10`;
                  return displayed.length === 0 ? (
                    <p className="text-sm text-muted italic py-8 text-center">
                      No {emptyLabel} reviews
                    </p>
                  ) : (
                    displayed.map((review) => (
                      <ReviewCard
                        key={review.id}
                        review={review as Review}
                        itemImageUrl={review.item?.imageUrl ?? review.itemImage}
                        onItemClick={(ref) => {
                          setSellerId(null);
                          setRefNum(ref);
                        }}
                      />
                    ))
                  );
                })()
              )}
              {shareLink &&
                numReviews != null &&
                numReviews > reviews.length && (
                  <p className="ido-reviews-hint">Read more reviews at:</p>
                )}
              <div className="pb-16" />
            </div>

            {/* Outbound "Visit {seller}" button — reuses ItemDetailOverlay LB button */}
            {shareLink && (
              <a
                href={shareLink}
                target="_blank"
                rel="noopener noreferrer"
                className="ido-lb-btn"
                aria-label={`Visit ${name} on LittleBiggy`}
              >
                <span className="ido-lb-btn__label">Visit {name}</span>
                <span className="ido-lb-btn__arrow" aria-hidden="true">
                  →
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
