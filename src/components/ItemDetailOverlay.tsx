"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Award,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Star,
  Truck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Fragment,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ItemDetailGallery } from "@/components/ItemDetailGallery";
import { ItemDetailTabs } from "@/components/ItemDetailTabs";
import {
  type ItemReview,
  ItemReviewsBlock,
} from "@/components/ItemReviewsBlock";
import { LinkedText } from "@/components/LinkedText";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { ShowOriginalToggle } from "@/components/ShowOriginalToggle";
import { SuggestLink } from "@/components/SuggestLink";
import { useAddToast } from "@/components/Toast";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useHistoryState } from "@/hooks/useHistoryState";
import { useLBGuideGate } from "@/hooks/useLBGuideGate";
import { cx } from "@/lib/cn";
import {
  decodeEntities,
  fmtPrice,
  formatDateTime,
  formatPriceRangeChange,
  formatPriceRangeValue,
} from "@/lib/format";
import {
  getItemGalleryImages,
  getItemPrimaryImage,
  getSellerImageUrl,
} from "@/lib/images";
import { getLittleBiggyItemUrl } from "@/lib/tracking/littlebiggy";
import type { Item, MergedDetailBlob } from "@/lib/types";
import {
  itemVariantContext,
  parseVariant,
  pricePerUnit,
  UNIT_DISPLAY_LABEL,
} from "@/lib/variants";
import {
  addToBasketAtom,
  currencyDisplayAtom,
  expandedRefNumAtom,
  focusReviewIdAtom,
  forceEnglishAtom,
  itemsAtom,
  marketAtom,
  sellerModalIdAtom,
  sellersMapAtom,
  sortedItemsAtom,
} from "@/store/atoms";

/* ── Helpers ── */

/* Human-friendly labels + value formatters for item attributes (`at` field).
   `cbd` and `imported` were dropped — too many false positives, and "imported"
   is implicit for non-domestic items (already conveyed by the ships-from
   flag). The crawler's pipeline.ts also drops these at index time. */
const ATTR_LABEL_KEYS = new Set<string>([
  "effect",
  "grow",
  "micron",
  "origin",
  "fullMelt",
  "mg",
  "vegan",
  "mlSize",
  "purity",
  "delta",
  "terped",
  "species",
]);

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

function variantDisplayLabel(
  variant: NonNullable<Item["v"]>[number],
  forceEnglish: boolean,
): string {
  return forceEnglish
    ? variant.dEn || variant.d || ""
    : variant.d || variant.dEn || "";
}

type DetailRelativeAge = {
  unit: "minutes" | "hours" | "days" | "months";
  count: number;
};

function relativeAge(
  iso: string | null | undefined,
  now: number | null,
): DetailRelativeAge | null {
  if (now == null) return null;
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  const ms = Math.max(0, now - ts);
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return { unit: "minutes", count: mins };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { unit: "hours", count: hrs };
  const days = Math.floor(hrs / 24);
  if (days < 30) return { unit: "days", count: days };
  const months = Math.floor(days / 30);
  return { unit: "months", count: months };
}

/* ── Component ── */
export function ItemDetailOverlay() {
  const t = useTranslations("item.detail");
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
  useEffect(
    () => () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    },
    [],
  );

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
  const forceEnglish = useAtomValue(forceEnglishAtom);
  const [mergedDetail, setMergedDetail] = useState<MergedDetailBlob | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const detailAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!refNum || !market) {
      const frame = window.requestAnimationFrame(() => {
        setMergedDetail(null);
        setDetailLoading(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    detailAbortRef.current?.abort();
    const ac = new AbortController();
    detailAbortRef.current = ac;
    const loadingFrame = window.requestAnimationFrame(() => {
      if (!ac.signal.aborted) setDetailLoading(true);
    });
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
    return () => {
      window.cancelAnimationFrame(loadingFrame);
      ac.abort();
    };
  }, [refNum, market]);

  // ── Effective item: atom (browse page) or merged detail (other pages) ──
  const displayItem: Item | null = item ?? mergedDetail;
  const [clientNow, setClientNow] = useState<number | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setClientNow(Date.now());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Treat as loading if refNum is set but neither source resolved yet (avoids flash of "not found")
  const isLoading = detailLoading || (!!refNum && !item && !mergedDetail);
  const littleBiggyUrl = displayItem
    ? getLittleBiggyItemUrl(displayItem)
    : null;
  const littleBiggyEvent = useMemo(() => {
    if (!displayItem || !littleBiggyUrl) return null;
    return {
      id: String(displayItem.refNum ?? displayItem.id),
      url: littleBiggyUrl,
      n: decodeEntities(displayItem.n),
      sid: displayItem.sid != null ? String(displayItem.sid) : undefined,
      sn: displayItem.sn ?? undefined,
      c: displayItem.c ?? undefined,
      mkt: market,
    };
  }, [displayItem, littleBiggyUrl, market]);
  const gateLittleBiggyClick = useLBGuideGate(littleBiggyEvent);
  const handleLittleBiggyClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.stopPropagation();
      gateLittleBiggyClick(event);
    },
    [gateLittleBiggyClick],
  );

  // ── Gallery images ──
  const images = useMemo(() => {
    if (!displayItem) return [];
    return getItemGalleryImages(displayItem);
  }, [displayItem]);

  // ── Selected shipping cost (local to overlay) ──
  const [selectedShipCost, setSelectedShipCost] = useState(0);

  // ── Cart add indicator ──
  const [addedVariantKey, setAddedVariantKey] = useState<string | null>(null);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset shipping selection when item changes
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSelectedShipCost(0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [refNum]);

  // ── Extras from merged detail ──
  const shipOptions =
    (forceEnglish && mergedDetail?.shOptsEn?.length
      ? mergedDetail.shOptsEn
      : mergedDetail?.shOpts) ?? [];
  const hasSelectableShipping =
    shipOptions.length > 0 ||
    !!(
      displayItem?.sh &&
      (displayItem.sh.free ||
        (displayItem.sh.min != null && displayItem.sh.min > 0) ||
        (displayItem.sh.max != null && displayItem.sh.max > 0))
    );
  const priceHistory = useMemo(
    () => mergedDetail?.ph ?? [],
    [mergedDetail?.ph],
  );

  const latestPriceChange = (() => {
    if (priceHistory.length < 2 || displayItem?.uMin == null) return null;

    const previous = priceHistory[priceHistory.length - 2];
    const latest = priceHistory[priceHistory.length - 1];
    const currentMax = displayItem.uMax ?? displayItem.uMin;
    if (latest.min !== displayItem.uMin || latest.max !== currentMax)
      return null;

    const change = formatPriceRangeChange(previous, latest);
    return change ? { previous, change } : null;
  })();

  // ── Reviews from merged detail blob ──
  const itemReviews: ItemReview[] = useMemo(
    () => (mergedDetail?.reviews as ItemReview[] | undefined) ?? [],
    [mergedDetail],
  );

  // ── Variant rows for table ──
  // PPU (price-per-unit) is computed via shared `pricePerUnit` from
  // @/lib/variants — the same helper ItemCard and atoms use. It works for
  // any parsed unit (g, ml, mg, pc, joint, cart, pod, …) and returns null
  // when not meaningful (single ambiguous packaging units, etc.).
  const variantContext = useMemo(
    () => (displayItem ? itemVariantContext(displayItem) : null),
    [displayItem],
  );
  const variantRows = useMemo(() => {
    if (!displayItem?.v || displayItem.v.length === 0) return null;
    // For weight-based categories a bare-number variant label ("7", "14 mixed") implies grams.
    const weightCats = new Set(["Flower", "Shake", "Hash", "Concentrates"]);
    const isWeightCat = weightCats.has(displayItem.c ?? "");
    const BARE_NUM_RE = /^\s*(\d+(?:\.\d+)?)(?:\s|$|[^a-zA-Z])/;
    return displayItem.v
      .filter((v) => v.usd > 0)
      .map((v, i) => {
        const parsed = parseVariant(v, variantContext);
        let grams = parsed?.grams ?? null;
        let effectiveParsed: { unit: string; qty: number } | null = parsed;
        // Weight-category fallback: bare-number labels ("7", "14 mixed") are grams.
        if (grams == null && isWeightCat) {
          const label = v.dEn || v.d || "";
          const m = BARE_NUM_RE.exec(label);
          if (m) {
            const n = parseFloat(m[1]);
            if (Number.isFinite(n) && n > 0 && n <= 2000) {
              grams = n;
              effectiveParsed = { unit: "g", qty: n };
            }
          }
        }
        const ppu = pricePerUnit(v.usd, effectiveParsed);
        const unit = effectiveParsed?.unit ?? null;
        return {
          key: v.vid != null ? String(v.vid) : String(i),
          label: decodeEntities(variantDisplayLabel(v, forceEnglish) || "—"),
          price: v.usd,
          grams,
          ppu,
          qty: effectiveParsed?.qty ?? null,
          unit,
          unitLabel: unit ? (UNIT_DISPLAY_LABEL[unit] ?? unit) : null,
        };
      });
  }, [displayItem, forceEnglish, variantContext]);

  const bestValueKey = useMemo(() => {
    if (!variantRows || variantRows.length <= 1) return null;
    // Only compare rows with the same unit — it's meaningless to call a
    // 10-pack "best value" against a 5g variant. Within each unit group,
    // pick the cheapest PPU.
    const byUnit = new Map<string, { key: string; ppu: number }[]>();
    for (const row of variantRows) {
      if (row.ppu == null || row.unit == null) continue;
      const arr = byUnit.get(row.unit) ?? [];
      arr.push({ key: row.key, ppu: row.ppu });
      byUnit.set(row.unit, arr);
    }
    let best: { key: string; ppu: number } | null = null;
    for (const arr of byUnit.values()) {
      if (arr.length <= 1) continue;
      for (const r of arr) {
        if (!best || r.ppu < best.ppu) best = r;
      }
    }
    return best?.key ?? null;
  }, [variantRows]);

  // Don't render if no refNum
  if (!refNum && !closing) return null;

  const name = displayItem
    ? decodeEntities(
        (forceEnglish && displayItem.nEn ? displayItem.nEn : displayItem.n) ||
          "",
      )
    : "";

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
              aria-label={t("previousItem")}
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
              aria-label={t("close")}
            >
              <X size={16} />
            </button>

            {displayItem ? (
              <>
                <div className="ido-grid">
                  {/* ── Left: Gallery ── */}
                  <div className="ido-left">
                    <div className="ido-image-area">
                      <ItemDetailGallery
                        images={images}
                        alt={name}
                        itemKey={refNum}
                      />
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

                      {/* Name + global Show-in-English toggle. The
                          toggle lives next to the name (top of the panel)
                          rather than in the description heading because
                          it now affects the WHOLE site (item card names,
                          card descriptions, variant labels, etc.) — not
                          just this overlay's description. */}
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-xl font-bold text-foreground flex-1 min-w-0">
                          {name}
                        </h2>
                        <ShowOriginalToggle className="mt-1 shrink-0" />
                      </div>

                      {/* Seller */}
                      {displayItem.sn &&
                        (() => {
                          const sid =
                            displayItem.sid != null
                              ? String(displayItem.sid)
                              : null;
                          const indexSeller = sid
                            ? sellersMap.get(sid)
                            : undefined;
                          const sellerImg = getSellerImageUrl(
                            indexSeller?.imageUrl,
                          );
                          const sellerOnline = indexSeller?.online ?? null;
                          return (
                            <button
                              type="button"
                              className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
                              onClick={() => {
                                if (sid) setSellerModalId(sid);
                              }}
                            >
                              <SellerAvatarTooltip
                                sellerName={displayItem.sn}
                                imageUrl={sellerImg}
                                showInitialTooltip
                              >
                                <span className="relative inline-flex items-center justify-center size-6 rounded-full bg-surface text-xs font-medium text-foreground ring-1 ring-border overflow-hidden">
                                  {sellerImg ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={sellerImg}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    displayItem.sn.charAt(0).toUpperCase()
                                  )}
                                  {sellerOnline === "today" && (
                                    <span className="absolute -bottom-px -right-px size-2 rounded-full bg-emerald-500 ring-1 ring-background" />
                                  )}
                                </span>
                              </SellerAvatarTooltip>
                              <span>
                                {t("by")}{" "}
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
                          <span
                            className={`text-lg font-semibold ${selectedShipCost > 0 ? "text-amber-600 dark:text-amber-400" : "text-primary"}`}
                          >
                            {fmtPrice(
                              displayItem.uMin != null
                                ? displayItem.uMin + selectedShipCost
                                : displayItem.uMin,
                              cSym,
                              cRate,
                            )}
                            {displayItem.uMax != null &&
                              displayItem.uMax !== displayItem.uMin &&
                              ` – ${fmtPrice(displayItem.uMax + selectedShipCost, cSym, cRate)}`}
                            {selectedShipCost > 0 && (
                              <Truck
                                size={13}
                                className="inline ml-1.5 -mt-0.5 opacity-70"
                              />
                            )}
                          </span>
                          {latestPriceChange &&
                            (() => {
                              const isDown =
                                latestPriceChange.change.startsWith("\u2193");
                              return (
                                <span
                                  className={`ido-price-badge ${isDown ? "ido-price-badge--down" : "ido-price-badge--up"}`}
                                >
                                  {latestPriceChange.change}
                                  <span className="ido-price-badge__was">
                                    {t("wasPrice", {
                                      price: formatPriceRangeValue(
                                        latestPriceChange.previous,
                                        cSym,
                                        cRate,
                                      ),
                                    })}
                                  </span>
                                </span>
                              );
                            })()}
                        </div>

                        {/* Variants + shipping card */}
                        {variantRows &&
                          variantRows.length > 0 &&
                          (() => {
                            // Dominant unit across rows for the header label.
                            // If units are mixed we still show a generic "/unit".
                            const hasAnyPpu = variantRows.some(
                              (r) => r.ppu != null,
                            );
                            const units = new Set(
                              variantRows
                                .map((r) => r.unitLabel)
                                .filter((u): u is string => u != null),
                            );
                            const headerUnit =
                              units.size === 1
                                ? [...units][0]
                                : t("variants.unit");
                            return (
                              <div className="ido-card ido-card--variants">
                                <div className="ido-table__caption">
                                  <span>{t("variants.heading")}</span>
                                  <span className="ido-table__count">
                                    {variantRows.length}
                                  </span>
                                </div>
                                <table className="ido-table">
                                  {hasAnyPpu ? (
                                    <thead>
                                      <tr>
                                        <th>{t("variants.size")}</th>
                                        <th>{t("variants.price")}</th>
                                        <th>
                                          <abbr
                                            title={t("variants.pricePerUnit", {
                                              unit: headerUnit,
                                            })}
                                          >
                                            /{headerUnit}
                                          </abbr>
                                        </th>
                                        <th className="sr-only">
                                          {t("variants.add")}
                                        </th>
                                      </tr>
                                    </thead>
                                  ) : (
                                    <thead className="sr-only">
                                      <tr>
                                        <th>{t("variants.variant")}</th>
                                        <th>{t("variants.price")}</th>
                                        <th>{t("variants.add")}</th>
                                      </tr>
                                    </thead>
                                  )}
                                  <tbody>
                                    {variantRows.map((row) => {
                                      const isBest = bestValueKey === row.key;
                                      const totalPrice =
                                        row.price + selectedShipCost;
                                      // Recompute PPU with shipping surcharge folded in
                                      // for display consistency when user picks a paid
                                      // shipping option.
                                      const totalPpu =
                                        row.ppu != null &&
                                        row.qty != null &&
                                        row.qty > 0
                                          ? totalPrice / row.qty
                                          : row.ppu;
                                      return (
                                        <tr key={row.key}>
                                          <td>
                                            <span className="ido-table__format">
                                              {row.label}
                                              {isBest && (
                                                <span className="ido-best-value">
                                                  <Award size={9} />
                                                  {t("variants.bestValue")}
                                                </span>
                                              )}
                                            </span>
                                          </td>
                                          <td
                                            className={`ido-table__price${selectedShipCost > 0 ? " text-amber-600 dark:text-amber-400" : ""}`}
                                          >
                                            {fmtPrice(totalPrice, cSym, cRate)}
                                          </td>
                                          {hasAnyPpu && (
                                            <td
                                              className={`ido-table__ppu${selectedShipCost > 0 ? " text-amber-600 dark:text-amber-400" : ""}`}
                                            >
                                              {totalPpu != null
                                                ? fmtPrice(
                                                    totalPpu,
                                                    cSym,
                                                    cRate,
                                                  )
                                                : "—"}
                                            </td>
                                          )}
                                          <td className="ido-table__action">
                                            <button
                                              type="button"
                                              className={`ido-add-btn${addedVariantKey === row.key ? " ido-add-btn--added" : ""}`}
                                              title={t("variants.addToBasket")}
                                              onClick={() => {
                                                const ref = String(
                                                  displayItem.refNum ??
                                                    displayItem.id,
                                                );
                                                addToBasket({
                                                  refNum: ref,
                                                  variantId: row.key,
                                                  variantDesc: row.label,
                                                  name: name,
                                                  sellerName:
                                                    displayItem.sn ?? "",
                                                  qty: 1,
                                                  priceUSD: row.price,
                                                  shippingUsd:
                                                    hasSelectableShipping
                                                      ? selectedShipCost
                                                      : null,
                                                  includeShip:
                                                    hasSelectableShipping,
                                                  shOpts:
                                                    shipOptions.length > 0
                                                      ? shipOptions
                                                      : undefined,
                                                  imageUrl:
                                                    getItemPrimaryImage(
                                                      displayItem,
                                                      "thumb",
                                                      { forceStatic: true },
                                                    ) ??
                                                    displayItem.i ??
                                                    null,
                                                  sl: displayItem.sl ?? null,
                                                });
                                                if (addedTimerRef.current)
                                                  clearTimeout(
                                                    addedTimerRef.current,
                                                  );
                                                setAddedVariantKey(row.key);
                                                addedTimerRef.current =
                                                  setTimeout(
                                                    () =>
                                                      setAddedVariantKey(null),
                                                    1200,
                                                  );
                                                addToast({
                                                  message: t(
                                                    "variants.addedToBasket",
                                                    { variant: row.label },
                                                  ),
                                                  variant: "success",
                                                  duration: 2200,
                                                });
                                              }}
                                            >
                                              {addedVariantKey === row.key ? (
                                                <Check size={14} />
                                              ) : (
                                                <Plus size={14} />
                                              )}
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>

                                {/* Shipping options — selectable */}
                                <ShippingOptions
                                  key={refNum}
                                  sh={displayItem.sh}
                                  shipOptions={shipOptions}
                                  cSym={cSym}
                                  cRate={cRate}
                                  setSelectedShipCost={setSelectedShipCost}
                                />
                              </div>
                            );
                          })()}

                        {/* Review stats + timestamps (meta strip)
                        Layout: 2x2 grid on mobile/tablet, 4-in-a-row on wide
                        screens. Each cell is a uniform "stat" with a subtle
                        icon, a small label, and a bold primary value so the
                        grouping reads cleanly regardless of column count. */}
                        <div className="ido-meta-strip">
                          <div className="ido-meta-cells">
                            {displayItem.rs?.avg != null && (
                              <div className="ido-meta-cell">
                                <Star
                                  size={14}
                                  className="ido-meta-cell__icon text-amber-500"
                                />
                                <div className="ido-meta-cell__body">
                                  <span className="ido-meta-cell__label">
                                    {t("meta.rating")}
                                  </span>
                                  <span className="ido-meta-cell__value">
                                    {displayItem.rs.avg.toFixed(1)}
                                    <span className="ido-meta-cell__unit">
                                      /10
                                    </span>
                                    {displayItem.rs.cnt != null && (
                                      <span className="ido-meta-cell__sub">
                                        {" "}
                                        ({displayItem.rs.cnt})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            )}
                            {displayItem.rs?.days != null && (
                              <div className="ido-meta-cell">
                                <Truck
                                  size={14}
                                  className="ido-meta-cell__icon"
                                />
                                <div className="ido-meta-cell__body">
                                  <span className="ido-meta-cell__label">
                                    {t("meta.avgDelivery")}
                                  </span>
                                  <span className="ido-meta-cell__value">
                                    {displayItem.rs.days.toFixed(1)}
                                    <span className="ido-meta-cell__unit">
                                      d
                                    </span>
                                  </span>
                                </div>
                              </div>
                            )}
                            {displayItem.fsa && (
                              <div className="ido-meta-cell">
                                <Calendar
                                  size={14}
                                  className="ido-meta-cell__icon"
                                />
                                <div className="ido-meta-cell__body">
                                  <span className="ido-meta-cell__label">
                                    {t("meta.listed")}
                                  </span>
                                  <span className="ido-meta-cell__value">
                                    {(() => {
                                      const age = relativeAge(
                                        displayItem.fsa,
                                        clientNow,
                                      );
                                      return age
                                        ? t(`time.${age.unit}Ago`, {
                                            count: age.count,
                                          })
                                        : null;
                                    })()}
                                  </span>
                                </div>
                              </div>
                            )}
                            {displayItem.lua && (
                              <div className="ido-meta-cell">
                                <RefreshCw
                                  size={14}
                                  className="ido-meta-cell__icon"
                                />
                                <div className="ido-meta-cell__body">
                                  <span className="ido-meta-cell__label">
                                    {t("meta.updated")}
                                  </span>
                                  <span className="ido-meta-cell__value">
                                    {(() => {
                                      const age = relativeAge(
                                        displayItem.lua,
                                        clientNow,
                                      );
                                      return age
                                        ? t(`time.${age.unit}Ago`, {
                                            count: age.count,
                                          })
                                        : null;
                                    })()}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Last-update reason from the crawler
                              (e.g. "Images changed, -3 variants"). Stamped on
                              the item's index entry as `lur` whenever the diff
                              detector catches a meaningful change. Rendered as
                              a full-width note inside the card, divided from
                              the stat cells, so it always shows in full (vital
                              info) and wraps freely without distorting the
                              flexible stat cells above. */}
                          {displayItem.lua && displayItem.lur && (
                            <p className="ido-meta-reason">
                              <RefreshCw
                                size={12}
                                className="ido-meta-reason__icon"
                              />
                              <span>{displayItem.lur}</span>
                            </p>
                          )}
                        </div>
                      </section>

                      {/* ── Description section ── */}
                      <section
                        data-section-id="description"
                        className="ido-section"
                      >
                        {/* Description */}
                        <div className="ido-card">
                          <div className="ido-card__head flex items-center justify-between gap-2">
                            <h3 className="ido-card__title">
                              {t("description.heading")}
                            </h3>
                            {/* ShowOriginalToggle moved to top of overlay
                                (next to item name) — it's a global toggle
                                now, not just for description, so the new
                                placement is more discoverable. */}
                          </div>
                          <div className="ido-card__body">
                            {(() => {
                              const desc = forceEnglish
                                ? mergedDetail?.dEn ||
                                  displayItem.dEn ||
                                  mergedDetail?.d ||
                                  displayItem.d
                                : mergedDetail?.d || displayItem.d;
                              return desc ? (
                                <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                                  <LinkedText text={desc} />
                                </p>
                              ) : (
                                <p className="text-sm text-muted italic">
                                  {t("description.noneProvided")}
                                </p>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Attributes — spec-sheet layout: one row per attribute
                        key (Effect, Grow, Origin, …) with a compact label
                        column and a wrapping row of value chips. Much more
                        readable than a wall of key+value chips. */}
                        {displayItem.at &&
                          Object.keys(displayItem.at).length > 0 &&
                          (() => {
                            type AttrRow = {
                              key: string;
                              label: string;
                              chips: React.ReactNode[];
                            };
                            const rows: AttrRow[] = [];
                            const flags: React.ReactNode[] = [];
                            for (const [key, vals] of Object.entries(
                              displayItem.at,
                            )) {
                              if (key === "tier") continue;
                              const label = ATTR_LABEL_KEYS.has(key)
                                ? t(`attributes.labels.${key}`)
                                : key;
                              const values: (string | number | boolean)[] =
                                Array.isArray(vals)
                                  ? vals
                                  : vals == null
                                    ? []
                                    : [vals as string | number | boolean];
                              // Boolean-true attrs (CBD, Vegan, etc) collapse to a single flag chip
                              if (
                                values.length === 1 &&
                                typeof values[0] === "boolean"
                              ) {
                                if (values[0]) {
                                  flags.push(
                                    <span key={key} className="ido-attr-flag">
                                      {label}
                                    </span>,
                                  );
                                }
                                continue;
                              }
                              const chips = values
                                .filter(
                                  (v) => v !== false && v != null && v !== "",
                                )
                                .map((val) => (
                                  <span
                                    key={`${key}-${val}`}
                                    className="ido-attr-val"
                                  >
                                    {formatAttrValue(key, val)}
                                  </span>
                                ));
                              if (chips.length > 0)
                                rows.push({ key, label, chips });
                            }
                            if (rows.length === 0 && flags.length === 0)
                              return null;
                            return (
                              <div className="ido-card">
                                <div className="ido-card__head">
                                  <h3 className="ido-card__title">
                                    {t("attributes.heading")}
                                  </h3>
                                </div>
                                <div className="ido-card__body">
                                  {rows.length > 0 && (
                                    <dl className="ido-attr-grid">
                                      {rows.map((row) => (
                                        <Fragment key={row.key}>
                                          <dt className="ido-attr-grid__label">
                                            {row.label}
                                          </dt>
                                          <dd className="ido-attr-grid__values">
                                            {row.chips}
                                          </dd>
                                        </Fragment>
                                      ))}
                                    </dl>
                                  )}
                                  {flags.length > 0 && (
                                    <div className="ido-attr-flags">
                                      {flags}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                        {/* Price History — rendered after Description so the
                        section doesn't steal visual attention from pricing. */}
                        {priceHistory.length > 1 && (
                          <div className="ido-card">
                            <div className="ido-card__head">
                              <h3 className="ido-card__title">
                                {t("priceHistory.heading")}
                              </h3>
                              <span className="ido-card__count">
                                {priceHistory.length}
                              </span>
                            </div>
                            <div className="ido-card__body">
                              <ul className="ido-price-history__list">
                                {[...priceHistory]
                                  .reverse()
                                  .map((snap, idx, arr) => {
                                    const prev = arr[idx + 1];
                                    const change = prev
                                      ? formatPriceRangeChange(prev, snap)
                                      : null;
                                    return (
                                      <li
                                        key={snap.d}
                                        className="ido-price-history__entry"
                                      >
                                        <time
                                          className="ido-price-history__date"
                                          dateTime={snap.d}
                                        >
                                          {formatDateTime(snap.d)}
                                        </time>
                                        <span className="ido-price-history__price">
                                          {fmtPrice(snap.min, cSym, cRate)}
                                          {snap.max !== snap.min && (
                                            <span className="ido-price-history__range">
                                              {" "}
                                              &ndash;{" "}
                                              {fmtPrice(snap.max, cSym, cRate)}
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
                                        ) : prev ? null : (
                                          <span className="ido-price-history__change ido-price-history__change--first">
                                            {t("priceHistory.firstTracked")}
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

                      {/* ── Reviews section (always renders on non-ultrawide) ──
                        Wrapped in an .ido-card so it visually matches the
                        Description / Attributes / Price History cards and
                        reads as a distinct container on mobile. */}
                      <section
                        data-section-id="reviews"
                        className="ido-section 2xl:hidden"
                      >
                        <div className="ido-card">
                          <div className="ido-card__body">
                            <ItemReviewsBlock
                              reviews={itemReviews}
                              rs={displayItem.rs}
                              loading={detailLoading}
                              shareLink={displayItem.sl}
                              focusReviewId={focusReviewId}
                              onFocusHandled={() => setFocusReviewId(null)}
                              compact
                            />
                          </div>
                        </div>
                      </section>

                      {/* Suggest link — mobile/phone only (<48rem) is rendered
                        inside the fixed bottom action bar (.ido-mobile-actions).
                        On tablet+ it lives at the bottom-left of the panel,
                        mirroring the LittleBiggy button on the bottom-right. */}
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
                  </div>
                </div>

                {/* Flag/report button — pinned bottom-left of the panel on
                  tablet+, mirroring the LittleBiggy button anchored on the
                  bottom-right. Absolute to .ido-panel so it stays put while
                  either column scrolls. */}
                <div className="ido-suggest-bottom">
                  <SuggestLink
                    refNum={displayItem.refNum ?? displayItem.id}
                    iconOnly
                  />
                </div>

                {/* ── Mobile bottom action bar (<48rem) ──
                  Fixed to the viewport: Suggest icon + Prev / Next + LB CTA.
                  Mirrors the old-biggyindex pattern so users always have
                  navigation and the outbound CTA in reach. Hidden at md+. */}
                <div className="ido-mobile-actions">
                  <SuggestLink
                    refNum={displayItem.refNum ?? displayItem.id}
                    iconOnly
                  />
                  <div className="ido-mobile-actions__nav">
                    <button
                      type="button"
                      onClick={gotoPrev}
                      disabled={!hasPrev}
                      aria-label={t("previousItem")}
                      className="ido-mobile-actions__nav-btn"
                    >
                      <ChevronLeft size={14} aria-hidden="true" />
                      <span>{t("prev")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={gotoNext}
                      disabled={!hasNext}
                      aria-label={t("nextItem")}
                      className="ido-mobile-actions__nav-btn"
                    >
                      <span>{t("next")}</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {littleBiggyUrl && (
                    <a
                      href={littleBiggyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleLittleBiggyClick}
                      className="ido-mobile-actions__lb"
                    >
                      <span>{t("viewOnLittleBiggy")}</span>
                      <span className="ido-lb-btn__arrow" aria-hidden="true">
                        →
                      </span>
                    </a>
                  )}
                </div>

                {/* Absolute "View on LittleBiggy" button (bottom-right of panel, md+) */}
                {littleBiggyUrl && (
                  <a
                    href={littleBiggyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleLittleBiggyClick}
                    className="ido-lb-btn"
                  >
                    <span className="ido-lb-btn__label">
                      {t("viewOnLittleBiggy")}
                    </span>
                    <span className="ido-lb-btn__arrow" aria-hidden="true">
                      →
                    </span>
                  </a>
                )}
              </>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted">{t("itemNotFound")}</p>
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
              aria-label={t("nextItem")}
              className="ido-nav-zone"
            >
              <span className="ido-nav-btn">
                <ChevronRight size={20} />
              </span>
            </button>
          </div>
        </div>
      </div>
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
  const t = useTranslations("item.detail.shipping");
  // Build display options from real R2 labels or aggregate fallbacks. The
  // cheapest real option is first and selected by default, matching the basket.
  const options = useMemo(() => {
    const result: { label: string; value: number }[] = [];

    if (shipOptions.length > 0) {
      const deduped: { label: string; value: number }[] = [];
      for (const opt of shipOptions) {
        const cost = opt.cost ?? 0;
        if (deduped.some((r) => r.label === opt.label)) continue;
        deduped.push({ label: opt.label, value: cost });
      }
      deduped.sort((a, b) => a.value - b.value);
      result.push(...deduped);
      return result;
    }

    // Fallback to aggregate sh.min/max when we have no real labels
    if (!sh) return result;
    if (sh.free) {
      result.push({ label: t("freeShipping"), value: 0 });
      return result;
    }
    const hasMin = sh.min != null && sh.min > 0;
    const hasMax = sh.max != null && sh.max > 0;
    if (hasMin && hasMax && sh.max !== sh.min) {
      result.push({ label: t("cheapest"), value: sh.min! });
      result.push({ label: t("highest"), value: sh.max! });
    } else if (hasMin) {
      result.push({ label: t("shipping"), value: sh.min! });
    } else if (hasMax) {
      result.push({ label: t("shipping"), value: sh.max! });
    }
    return result;
  }, [sh, shipOptions, t]);

  // Selected index — default 0 (cheapest real shipping option when present)
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
        <span className="ido-ship__label">{t("label")}</span>
      </div>
      <div className="ido-ship__chips">
        {options.map((opt, idx) => {
          const isSelected = selectedIdx === idx;
          const isFree = opt.value === 0;
          const isPaid = !isFree;
          return (
            <button
              key={`${opt.label}-${idx}`}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`ido-ship__chip${isSelected ? " ido-ship__chip--selected" : ""}${isFree ? " ido-ship__chip--free" : ""}${isPaid ? " ido-ship__chip--paid" : ""}`}
              title={opt.label}
            >
              <span className="ido-ship__chip-label">{opt.label}</span>
              <span className="ido-ship__chip-cost">
                {isFree ? t("free") : fmtPrice(opt.value, cSym, cRate)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
