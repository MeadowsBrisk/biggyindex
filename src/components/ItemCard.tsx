"use client";

import { useSetAtom } from "jotai";
import { EyeOff, Filter, Heart, Package, Star, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  lazy,
  memo,
  type MouseEvent as ReactMouseEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { useAddToast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { useEntryAnimation } from "@/hooks/useEntryAnimation";
import { useLBGuideGate } from "@/hooks/useLBGuideGate";
import { getItemBrowseMeta, type ItemIndex } from "@/lib/browse/item-index";
import { MARKETS } from "@/lib/constants";
import { decodeEntities, formatDateTime } from "@/lib/format";
import {
  getItemGalleryImages,
  getItemPrimaryImage,
  getSellerImageUrl,
} from "@/lib/images";
import { formatShipFrom, shipFromCode } from "@/lib/shipFrom";
import { normalizeLittleBiggyUrl } from "@/lib/tracking/littlebiggy";
import type { Item, Seller } from "@/lib/types";
import {
  cheapestPpu,
  formatWeight,
  itemVariantContext,
  parseVariant,
  pricePerGram,
  pricePerUnit,
  UNIT_DISPLAY_LABEL,
  variantPpu,
} from "@/lib/variants";
import {
  bucketGrams,
  expandedRefNumAtom,
  selectedSellersAtom,
  sellerModalIdAtom,
  toggleBookmarkAtom,
  toggleHiddenSellerAtom,
} from "@/store/atoms";

/** Shared config lifted from ItemGrid — avoids per-card atom subscriptions. */
export interface CardConfig {
  currentMarket: string;
  cSym: string;
  cRate: number;
  sellersMap: Map<string, Seller>;
  selectedSellers: string[];
  globalWeights: number[];
  includeShipping: boolean;
  pauseGifs: boolean;
  thumbAspect: string;
  activeCategory: string;
  itemIndex: ItemIndex;
  clientNow: number | null;
}

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

interface ItemCardProps {
  item: Item;
  priority?: boolean;
  config: CardConfig;
  isBookmarked: boolean;
}

/* ── Expand arrow (diagonal, with fly-out/fly-in transition on hover) ── */
const arrowPath = <path d="M7 17L17 7M17 7H7M17 7v10" />;

function ExpandArrow() {
  return (
    <span className="card-content__icon" aria-hidden="true">
      {/* Outgoing arrow: slides up-right + fades out */}
      <span className="card-arrow card-arrow--out">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {arrowPath}
        </svg>
      </span>
      {/* Incoming arrow: slides in from bottom-left + fades in */}
      <span className="card-arrow card-arrow--in">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {arrowPath}
        </svg>
      </span>
    </span>
  );
}

/* ── First crawl batch cutoff — items with fsa on or before this date
   were already on the marketplace when we started crawling (2025-08-31)
   and don't have meaningful "listed" dates ── */
const FIRST_CRAWL_TS = new Date("2025-09-01T00:00:00Z").getTime();

type RelativeAge = {
  unit: "minutes" | "hours" | "days" | "months";
  count: number;
};

/* ── Relative time (lightweight, no deps) ── */
function relativeAge(
  iso: string | null | undefined,
  now: number | null,
): RelativeAge | null {
  if (now == null) return null;
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  if (ts < FIRST_CRAWL_TS) return null; // Pre-dates our crawling — no real listed date
  const ms = now - ts;
  if (ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return { unit: "minutes", count: mins };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { unit: "hours", count: hrs };
  const days = Math.floor(hrs / 24);
  if (days < 30) return { unit: "days", count: days };
  const months = Math.floor(days / 30);
  return { unit: "months", count: months };
}

/* ── Format price with currency symbol + rate ── */
function fmtPrice(
  min: number | null | undefined,
  max: number | null | undefined,
  sym: string,
  rate: number,
): string {
  if (min == null) return "N/A";
  const lo = `${sym}${(min * rate).toFixed(2)}`;
  if (max != null && max !== min)
    return `${lo} – ${sym}${(max * rate).toFixed(2)}`;
  return lo;
}

/* ── Check if shipping origin is domestic ── */
function isDomestic(
  sf: string | null | undefined,
  marketCode: string,
): boolean {
  if (!sf) return false;
  const market = MARKETS.find((m) => m.code === marketCode);
  if (!market) return false;
  return sf.toLowerCase() === market.name.toLowerCase();
}

/**
 * Card pill — shows category · subcategory with an optional strain group dot.
 * When browsing inside a category, shows just the subcategory (or category if no sub).
 * Strain group (Indica/Sativa/Hybrid) shown as a small colored dot for Flower, Shake, Hash.
 */
function CardPill({
  item,
  activeCategory,
}: {
  item: Item;
  activeCategory: string;
}) {
  const tCategories = useTranslations("categories");
  const inCategory = activeCategory !== "All" && item.c === activeCategory;
  const firstSub = item.sc?.[0];
  const cat = item.c ?? "Other";

  // Effect group from attributes (Indica/Sativa/Hybrid) — only show when browsing Flower/Shake
  const group =
    activeCategory === "Flower" || activeCategory === "Shake"
      ? (item.at?.effect?.[0] ?? null)
      : null;

  // Build label: "Category · Sub" when browsing All, just "Sub" or "Category" when inside a category
  let label: string;
  if (inCategory) {
    label = firstSub ?? tCategories(cat);
  } else {
    label = firstSub ? `${tCategories(cat)} · ${firstSub}` : tCategories(cat);
  }

  return (
    <span className="card-pill card-pill--image glass text-[10px] font-medium pointer-events-auto">
      {group && (
        <span
          className={`card-pill__group-dot card-pill__group-dot--${group.toLowerCase()}`}
        />
      )}
      {label}
    </span>
  );
}

/**
 * Low-confidence badge — only renders when categorization confidence is very low (cf < 0.5).
 * Shares the card-pill styling so it sits flush next to the category pill. A single
 * "?" glyph tinted amber; tooltip carries the full explanation on hover.
 */
function LowConfidenceBadge({ cf }: { cf?: number | null }) {
  const t = useTranslations("browse.card");
  if (cf == null || cf >= 0.5) return null;
  const pct = Math.round(cf * 100);
  return (
    <Tooltip
      content={t("lowConfidence", { percent: pct })}
      side="bottom"
      delay={300}
    >
      <span
        className="card-pill card-pill--image glass text-[10px] font-semibold pointer-events-auto text-amber-500"
        aria-label={t("lowConfidenceAria", { percent: pct })}
      >
        ?
      </span>
    </Tooltip>
  );
}

/**
 * Product card — food-agg structure adapted for cannabis marketplace.
 * Uses item-card CSS classes from styles/elements/item-card.css.
 */
function ItemCardInner({
  item,
  priority,
  config,
  isBookmarked,
}: ItemCardProps) {
  const {
    ref: entryRef,
    entered,
    scrollReveal,
    animDone,
  } = useEntryAnimation();
  const href = item.refNum ? `/item/${item.refNum}` : `/item/${item.id}`;
  const hasVariants = !!item.v && item.v.length > 1;
  const hasImage = !!(item.i || item.ih);
  const {
    currentMarket,
    cSym,
    cRate,
    sellersMap,
    selectedSellers,
    globalWeights,
    includeShipping,
    pauseGifs,
    thumbAspect,
    activeCategory,
    itemIndex,
    clientNow,
  } = config;
  const setSellerModalId = useSetAtom(sellerModalIdAtom);
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const setSelectedSellers = useSetAtom(selectedSellersAtom);
  const toggleHiddenSeller = useSetAtom(toggleHiddenSellerAtom);
  const t = useTranslations("browse.card");
  const seller =
    item.sid != null ? sellersMap.get(String(item.sid)) : undefined;
  const sellerAvatarUrl = getSellerImageUrl(seller?.imageUrl);

  // Bookmarks
  const toggleBookmark = useSetAtom(toggleBookmarkAtom);
  const addToast = useAddToast();
  const itemMeta = useMemo(
    () => getItemBrowseMeta(itemIndex, item),
    [itemIndex, item],
  );
  const variantContext = useMemo(() => itemVariantContext(item), [item]);
  const itemKey = itemMeta.bookmarkKey;
  const littleBiggyUrl = useMemo(
    () => (item.sl ? normalizeLittleBiggyUrl(item.sl) : null),
    [item.sl],
  );
  const littleBiggyEvent = useMemo(() => {
    if (!littleBiggyUrl) return null;
    return {
      id: String(item.refNum ?? item.id),
      url: littleBiggyUrl,
      n: decodeEntities(item.n),
      sid: item.sid != null ? String(item.sid) : undefined,
      sn: item.sn ?? undefined,
      c: item.c ?? undefined,
      mkt: currentMarket,
    };
  }, [
    currentMarket,
    item.c,
    item.id,
    item.n,
    item.refNum,
    item.sid,
    item.sn,
    littleBiggyUrl,
  ]);
  const gateLittleBiggyClick = useLBGuideGate(littleBiggyEvent);
  const handleLittleBiggyClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>) => {
      event.stopPropagation();
      gateLittleBiggyClick(event);
    },
    [gateLittleBiggyClick],
  );

  // Zoom preview signal — increment to open (lazy-loaded on first click)
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);
  const zoomImages = useMemo(() => {
    return getItemGalleryImages(item, "full", { forceStatic: pauseGifs });
  }, [item, pauseGifs]);

  const openZoom = useCallback(() => {
    if (hasImage) setZoomSignal((s) => (s ?? 0) + 1);
  }, [hasImage]);

  // Group variants by weight (e.g. 3.5g, 7g, 14g, 28g)
  const weightGroups = hasVariants ? itemMeta.weightGroups : null;

  // Fallback for non-weight variants (ml, packs, carts, etc.) —
  // used when weightGroups is null so non-weight items still get row 2 chips.
  const quantityGroups =
    hasVariants && !weightGroups ? itemMeta.quantityGroups : null;

  // Auto-select weight: when only 1 weight tier exists, or global filter narrows to 1
  const autoGrams = useMemo(() => {
    if (!weightGroups) return null;
    // Single weight tier with multiple strains — auto-select it
    if (weightGroups.length === 1) return weightGroups[0].grams;
    if (globalWeights.length !== 1) return null;
    const bucket = globalWeights[0];
    const match = weightGroups.find((wg) => bucketGrams(wg.grams) === bucket);
    return match ? match.grams : null;
  }, [globalWeights, weightGroups]);

  const [manualGrams, setManualGrams] = useState<number | null>(null);
  const selectedGrams = manualGrams ?? autoGrams;
  const [selectedStrain, setSelectedStrain] = useState<string | null>(null);
  // Quantity-group selection for non-weight variants (ml, packs, carts, etc.)
  const [selectedQtyKey, setSelectedQtyKey] = useState<string | null>(null);
  const activeQtyGroup = useMemo(() => {
    if (!quantityGroups || !selectedQtyKey) return null;
    return quantityGroups.find((g) => g.key === selectedQtyKey) ?? null;
  }, [quantityGroups, selectedQtyKey]);

  // Settings
  const aspectClass =
    thumbAspect === "4:3"
      ? "aspect-[4/3]"
      : thumbAspect === "3:2"
        ? "aspect-[3/2]"
        : "aspect-square";

  // CDN image URLs — hash raw URLs to R2 CDN paths.
  // Animated GIFs use anim.webp unless the user has paused GIFs.
  const thumbSrc = getItemPrimaryImage(item, "thumb", {
    forceStatic: pauseGifs,
  });
  const galleryThumbs = useMemo(
    () => getItemGalleryImages(item, "thumb", { forceStatic: pauseGifs }),
    [item, pauseGifs],
  );
  const hoverSrc = galleryThumbs[1] ?? null;

  const activeGroup = useMemo(() => {
    if (!weightGroups || selectedGrams == null) return null;
    return weightGroups.find((g) => g.grams === selectedGrams) ?? null;
  }, [weightGroups, selectedGrams]);

  const handleWeightClick = useCallback(
    (e: React.MouseEvent, grams: number) => {
      e.preventDefault();
      e.stopPropagation();
      setManualGrams((prev) => (prev === grams ? null : grams));
      // Reconcile the strain selection: keep it if the new weight still
      // carries it, otherwise clear. Symmetric to handleStrainClick so the
      // user can pick strain → weight or weight → strain in any order.
      setSelectedStrain((prev) => {
        if (!prev || !weightGroups) return prev;
        const wg = weightGroups.find((g) => g.grams === grams);
        if (!wg) return prev;
        const stillCarries = wg.strains.some(
          (s) => s.toLowerCase() === prev.toLowerCase(),
        );
        return stillCarries ? prev : null;
      });
    },
    [weightGroups],
  );

  const handleStrainClick = useCallback(
    (e: React.MouseEvent, strain: string) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedStrain((prev) => {
        const next = prev === strain ? null : strain;
        // If selecting a strain, reconcile weight selection
        if (next && weightGroups) {
          const strainLower = next.toLowerCase();
          const matching = weightGroups.filter((g) =>
            g.strains.some((s) => s.toLowerCase() === strainLower),
          );
          if (matching.length === 1) {
            // Only one weight carries this strain — auto-select it
            setManualGrams(matching[0].grams);
          } else if (manualGrams != null) {
            // Multiple (or zero) matches — clear if current weight is incompatible
            if (!matching.some((g) => g.grams === manualGrams)) {
              setManualGrams(null);
            }
          }
        }
        return next;
      });
    },
    [weightGroups, manualGrams],
  );

  const handleQtyClick = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedQtyKey((prev) => (prev === key ? null : key));
  }, []);

  // Strains to display: narrow to active weight group when selected.
  // We don't dedup against the item name — the spacer row guarantees alignment
  // so it's better to fill that space with the strain chip than leave it blank.
  const displayStrains = useMemo(() => {
    if (activeGroup) return activeGroup.strains;
    if (weightGroups) {
      const set = new Set<string>();
      for (const wg of weightGroups) for (const s of wg.strains) set.add(s);
      return Array.from(set);
    }
    if (quantityGroups) {
      const set = new Set<string>();
      for (const qg of quantityGroups) for (const s of qg.strains) set.add(s);
      return Array.from(set);
    }
    return [];
  }, [activeGroup, weightGroups, quantityGroups]);

  // Single-variant parsed payload (used for spacer + strain chip + size label).
  const singleVariantParsed = useMemo(() => {
    if (weightGroups || quantityGroups) return null;
    return itemMeta.singleVariantParsed;
  }, [weightGroups, quantityGroups, itemMeta]);

  // Whether the non-weight (quantity) row should render chips.
  // Either ≥2 tiers, OR a single tier with ≥2 distinct strains (chocolate-bars case).
  const showQuantityRow =
    !!quantityGroups &&
    (quantityGroups.length > 1 ||
      (quantityGroups.length === 1 && quantityGroups[0].strains.length >= 2));

  // Strain → price map for displaying prices in strain pills when a weight is selected
  const strainPriceMap = useMemo(() => {
    if (!activeGroup || !item.v) return null;
    const map = new Map<string, number>();
    for (const v of item.v) {
      const pv = parseVariant(v, variantContext);
      if (pv && pv.grams === activeGroup.grams && pv.strain) {
        map.set(pv.strain.toLowerCase(), v.usd);
      }
    }
    return map.size > 0 ? map : null;
  }, [activeGroup, item.v, variantContext]);

  // (grams → price) and (qtyKey → price) for the currently selected strain.
  // Lets weight / quantity buttons show the exact strain price instead of a
  // cross-strain range once the user has picked a strain.
  const strainWeightPrice = useMemo(() => {
    if (!selectedStrain || !item.v) return null;
    const strainLower = selectedStrain.toLowerCase();
    const map = new Map<number, number>();
    for (const v of item.v) {
      const pv = parseVariant(v, variantContext);
      if (!pv || pv.grams == null) continue;
      if (pv.strain?.toLowerCase() !== strainLower) continue;
      const prev = map.get(pv.grams);
      if (prev == null || v.usd < prev) map.set(pv.grams, v.usd);
    }
    return map.size > 0 ? map : null;
  }, [selectedStrain, item.v, variantContext]);

  const strainQtyPrice = useMemo(() => {
    if (!selectedStrain || !item.v) return null;
    const strainLower = selectedStrain.toLowerCase();
    const map = new Map<string, number>();
    for (const v of item.v) {
      const pv = parseVariant(v, variantContext);
      if (!pv) continue;
      if (pv.strain?.toLowerCase() !== strainLower) continue;
      const key = `${pv.qty}:${pv.unit}`;
      const prev = map.get(key);
      if (prev == null || v.usd < prev) map.set(key, v.usd);
    }
    return map.size > 0 ? map : null;
  }, [selectedStrain, item.v, variantContext]);

  // When a strain is selected, compute which weight tiers carry that strain
  // so we can dim weight buttons that don't have it.
  const strainAvailableGrams = useMemo(() => {
    if (!selectedStrain || !weightGroups) return null;
    const strainLower = selectedStrain.toLowerCase();
    const set = new Set<number>();
    for (const wg of weightGroups) {
      if (wg.strains.some((s) => s.toLowerCase() === strainLower)) {
        set.add(wg.grams);
      }
    }
    return set;
  }, [selectedStrain, weightGroups]);

  // Clear weight selection if strain makes it unavailable
  // (done in handleStrainClick instead of useEffect to avoid cascading renders)

  // Display price: show range until a weight or quantity is selected
  const displayPrice = activeGroup
    ? activeGroup.price
    : activeQtyGroup
      ? activeQtyGroup.price
      : item.uMin;
  const displayPriceMax = activeGroup
    ? activeGroup.priceMax
    : activeQtyGroup
      ? activeQtyGroup.priceMax
      : item.uMax;

  // If strain is also selected, find exact price via parseVariant matching
  const exactPrice = useMemo(() => {
    if (!activeGroup || !selectedStrain) return null;
    const strainLower = selectedStrain.toLowerCase();
    const match = item.v?.find((v) => {
      const pv = parseVariant(v, variantContext);
      if (!pv) return false;
      return (
        pv.grams === activeGroup.grams &&
        pv.strain?.toLowerCase() === strainLower
      );
    });
    return match?.usd ?? null;
  }, [activeGroup, selectedStrain, item.v, variantContext]);

  // Shipping
  const shippingIsFree = item.sh?.free === 1;
  const shippingCost = useMemo(() => {
    if (shippingIsFree || item.sh?.min == null) return null;
    const minLocal = Math.round(item.sh.min * cRate);
    const maxLocal =
      item.sh.max != null ? Math.round(item.sh.max * cRate) : null;
    if (maxLocal != null && maxLocal !== minLocal) {
      return `${cSym}${minLocal} – ${cSym}${maxLocal}`;
    }
    return `${cSym}${minLocal}`;
  }, [shippingIsFree, item.sh, cSym, cRate]);
  const domestic = isDomestic(item.sf, currentMarket);

  // Shipping surcharge for "include shipping" mode (USD, added to prices)
  const shipSurcharge =
    includeShipping && !shippingIsFree && item.sh?.min != null
      ? item.sh.min
      : 0;

  // PPU — show for selected weight chip (price/g), selected quantity chip
  // (price/unit, e.g. "£29.62/cart"), or cheapest PPU overall across any unit
  // (g, pc, joint, cart, …). Shared `cheapestPpu` handles unit-grouping so a
  // 10-pack doesn't get compared to a 5g jar. When no strain/weight/qty is
  // selected we return a min/max range matching the price range shown above.
  const ppu = useMemo<{
    value: number;
    valueMax?: number;
    unit: string;
  } | null>(() => {
    if (activeGroup) {
      const priceMin = (exactPrice ?? activeGroup.price) + shipSurcharge;
      const perGramMin = pricePerGram(priceMin, activeGroup.grams);
      if (perGramMin == null) return null;
      // If the user hasn't pinned a strain yet and the weight tier spans a
      // range, show /g min-max so the ppu tracks the headline price.
      if (exactPrice == null && activeGroup.priceMax !== activeGroup.price) {
        const perGramMax = pricePerGram(
          activeGroup.priceMax + shipSurcharge,
          activeGroup.grams,
        );
        if (perGramMax != null && perGramMax !== perGramMin) {
          return { value: perGramMin, valueMax: perGramMax, unit: "g" };
        }
      }
      return { value: perGramMin, unit: "g" };
    }
    if (activeQtyGroup) {
      const priceMin = activeQtyGroup.price + shipSurcharge;
      const ppuMin = pricePerUnit(priceMin, activeQtyGroup);
      if (ppuMin == null) return null;
      if (activeQtyGroup.priceMax !== activeQtyGroup.price) {
        const ppuMax = pricePerUnit(
          activeQtyGroup.priceMax + shipSurcharge,
          activeQtyGroup,
        );
        if (ppuMax != null && ppuMax !== ppuMin) {
          return {
            value: ppuMin,
            valueMax: ppuMax,
            unit: activeQtyGroup.unit,
          };
        }
      }
      return { value: ppuMin, unit: activeQtyGroup.unit };
    }
    const best = cheapestPpu(item.v, shipSurcharge, variantContext);
    if (!best) return null;
    // Compute max ppu in the same unit-group for range display.
    let maxPpu = best.ppu;
    for (const v of item.v ?? []) {
      const r = variantPpu(v, shipSurcharge, variantContext);
      if (r && r.unit === best.unit && r.ppu > maxPpu) maxPpu = r.ppu;
    }
    return maxPpu > best.ppu
      ? { value: best.ppu, valueMax: maxPpu, unit: best.unit }
      : { value: best.ppu, unit: best.unit };
  }, [
    activeGroup,
    activeQtyGroup,
    exactPrice,
    item.v,
    shipSurcharge,
    variantContext,
  ]);

  // Timestamps
  const listedAge = relativeAge(item.fsa, clientNow);
  const updated =
    item.lua && item.lur && item.lur !== "N"
      ? relativeAge(item.lua, clientNow)
      : null;
  const formatAge = useCallback(
    (age: RelativeAge) => t(`time.${age.unit}Ago`, { count: age.count }),
    [t],
  );

  // Is price a range (different min/max)?
  const priceIsRange =
    displayPriceMax != null &&
    displayPrice != null &&
    displayPriceMax !== displayPrice;

  // ── Drag-to-scroll for variant strips (food-agg PillRow pattern) ──
  const strainStripRef = useRef<HTMLDivElement>(null);
  const weightStripRef = useRef<HTMLDivElement>(null);

  // Double-rAF: batch layout reads (scrollWidth) separately from DOM writes (dataset)
  // to avoid read→write→read forced reflow across 50+ cards mounting simultaneously.
  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      const results: [HTMLDivElement, boolean][] = [];
      for (const el of [strainStripRef.current, weightStripRef.current]) {
        if (!el) continue;
        results.push([el, el.scrollWidth > el.clientWidth]);
      }
      requestAnimationFrame(() => {
        if (cancelled) return;
        for (const [el, scrollable] of results) {
          el.dataset.scrollable = scrollable ? "true" : "false";
          el.dataset.scrolled = "false";
          el.dataset.atEnd = !scrollable
            ? "true"
            : el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
              ? "true"
              : "false";
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [displayStrains, weightGroups, quantityGroups, showQuantityRow]);

  const handleStripScroll = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>) => {
      const el = ref.current;
      if (!el) return;
      el.dataset.scrolled = el.scrollLeft > 2 ? "true" : "false";
      el.dataset.atEnd =
        el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 ? "true" : "false";
    },
    [],
  );

  // Auto-scroll weight strip to show the selected pill
  useEffect(() => {
    if (selectedGrams == null) return;
    const el = weightStripRef.current;
    if (!el) return;
    const idx =
      weightGroups?.findIndex((wg) => wg.grams === selectedGrams) ?? -1;
    if (idx < 0) return;
    const btn = el.children[idx] as HTMLElement | undefined;
    if (!btn) return;
    const left =
      btn.offsetLeft - el.offsetLeft - el.clientWidth / 2 + btn.offsetWidth / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [selectedGrams, weightGroups]);

  const handleStripMouseDown = useCallback(
    (e: React.MouseEvent, ref: React.RefObject<HTMLDivElement | null>) => {
      const el = ref.current;
      if (!el || el.scrollWidth <= el.clientWidth) return;
      const startX = e.pageX;
      const scrollLeft = el.scrollLeft;
      let dragging = false;
      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.pageX - startX;
        if (!dragging && Math.abs(dx) < 4) return;
        dragging = true;
        el.scrollLeft = scrollLeft - dx * 1.5;
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [],
  );

  return (
    <article
      ref={entryRef}
      className={`item-card group${isBookmarked ? " bookmark-card-ring" : ""}`}
      data-entered={entered}
      data-scroll-reveal={scrollReveal}
      data-animated={animDone}
    >
      <div
        className={`item-card-inner${isBookmarked ? " bookmark-card-inner" : ""}`}
      >
        {/* ── Image ── */}
        <div className={`item-card-image ${aspectClass}`}>
          <button
            type="button"
            onClick={openZoom}
            className="block h-full w-full cursor-zoom-in"
            aria-label={t("preview", { item: decodeEntities(item.n) })}
          >
            {hasImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbSrc}
                  alt={decodeEntities(item.n)}
                  loading={priority ? "eager" : "lazy"}
                  fetchPriority={priority ? "high" : undefined}
                  sizes="(min-width: 2560px) 17vw, (min-width: 1920px) 20vw, (min-width: 1440px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="card-image card-image--primary"
                />
                {/* Second image hover — always rendered if available */}
                {hoverSrc && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={hoverSrc}
                    alt=""
                    loading="lazy"
                    sizes="(min-width: 2560px) 17vw, (min-width: 1920px) 20vw, (min-width: 1440px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="card-image card-image--hover"
                  />
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Package size={48} />
              </div>
            )}
          </button>

          {/* Zoom preview portal — lazy loaded on first click */}
          {zoomSignal != null && (
            <Suspense fallback={null}>
              <ImageZoomPreview
                imageUrl={getItemPrimaryImage(item, "full", {
                  forceStatic: pauseGifs,
                })}
                imageUrls={zoomImages.length > 0 ? zoomImages : undefined}
                alt={decodeEntities(item.n)}
                openSignal={zoomSignal}
              />
            </Suspense>
          )}

          {/* Category / subcategory pill + bookmark button overlay */}
          <div className="card-controls absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2 pointer-events-none">
            <div className="flex items-start gap-1">
              <CardPill item={item} activeCategory={activeCategory} />
              <LowConfidenceBadge cf={item.cf} />
            </div>
            <Tooltip
              content={
                isBookmarked ? t("removeBookmark") : t("bookmarkProduct")
              }
              side="left"
              delay={350}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  addToast({
                    message: isBookmarked
                      ? t("bookmarkRemoved")
                      : t("bookmarked"),
                    variant: "success",
                    duration: 1800,
                  });
                  toggleBookmark(itemKey);
                }}
                className={`bookmark-btn pointer-events-auto${isBookmarked ? " bookmark-active-btn always-show" : ""}`}
                aria-label={
                  isBookmarked ? t("removeBookmark") : t("bookmarkProduct")
                }
              >
                <Heart
                  size={16}
                  className={isBookmarked ? "fill-current" : ""}
                />
              </button>
            </Tooltip>
          </div>

          {/* LittleBiggy outbound (bottom-right of image, reveals on hover) */}
          {littleBiggyUrl && (
            <a
              href={littleBiggyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleLittleBiggyClick}
              aria-label={t("viewOnLittleBiggy", {
                item: decodeEntities(item.n),
              })}
              className="card-lb-btn"
            >
              <span>Little Biggy</span>
              <span className="card-lb-btn__arrow" aria-hidden="true">
                →
              </span>
            </a>
          )}
        </div>

        {/* ── Body ── */}
        <div className="p-1.5 pt-1">
          <div className="pb-20 lg:pb-15 flex flex-col">
            {/* Clickable content → opens detail modal */}
            <a
              href={href}
              onClick={(e) => {
                // Middle-click / ctrl-click → let browser open in new tab
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey)
                  return;
                e.preventDefault();
                setRefNum(String(item.refNum ?? item.id));
              }}
              className="card-content"
            >
              <div className="card-content__inner">
                <div className="card-content__header">
                  <span className="card-content__title-row">
                    <h3
                      className="card-content__title"
                      title={decodeEntities(item.n)}
                    >
                      {decodeEntities(item.n)}
                    </h3>
                    {item.rs?.avg != null && item.rs.avg > 0 && (
                      <span
                        className={`card-item-rating${item.rs.avg < 8 ? " card-item-rating--low" : ""}`}
                      >
                        <Star size={9} className="fill-current" />
                        {item.rs.avg.toFixed(1)}
                        {item.rs.cnt != null && item.rs.cnt > 0 && (
                          <span className="card-item-rating__count">
                            ({item.rs.cnt})
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  <ExpandArrow />
                </div>
                <p
                  className={`card-content__description mt-3${item.d ? "" : " empty"}`}
                >
                  {item.d ? decodeEntities(item.d) : ""}
                </p>
              </div>
            </a>

            <div className="item-info-wrap px-2">
              {/* Seller row */}
              <div className="seller-card mt-2">
                <SellerAvatarTooltip
                  sellerName={item.sn ?? "?"}
                  imageUrl={sellerAvatarUrl}
                  showInitialTooltip
                >
                  <span className="seller-card__avatar" aria-hidden="true">
                    {seller?.online === "today" && (
                      <span
                        className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-green-500 ring-[1.5px] ring-card"
                        title={t("onlineToday")}
                      />
                    )}
                    {sellerAvatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={sellerAvatarUrl}
                        alt={item.sn ?? ""}
                        className="w-full h-full rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      (item.sn ?? "?").charAt(0)
                    )}
                  </span>
                </SellerAvatarTooltip>
                <span className="seller-card__body">
                  <span className="seller-card__name-row">
                    <button
                      type="button"
                      className="seller-card__name hover:text-primary transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (item.sid != null)
                          setSellerModalId(String(item.sid));
                      }}
                    >
                      {item.sn}
                    </button>
                    {seller?.averageRating != null && (
                      <span className="seller-card__badge seller-card__badge--rating">
                        <Star size={9} className="fill-current" />{" "}
                        {seller.averageRating.toFixed(1)}
                      </span>
                    )}
                    {shippingIsFree ? (
                      <span className="seller-card__badge seller-card__badge--free">
                        <Truck size={10} /> {t("freeShipping")}
                      </span>
                    ) : shippingCost ? (
                      <span className="seller-card__badge seller-card__badge--shipping">
                        <Truck size={10} /> {shippingCost}
                      </span>
                    ) : null}
                  </span>
                  <span className="seller-card__meta">
                    {/* "Ships from <flag>" — flag replaces the country word for
                        compactness; tooltip shows the full country name. */}
                    {item.sf &&
                      !domestic &&
                      (() => {
                        const code = shipFromCode(item.sf);
                        const full = formatShipFrom(item.sf);
                        return (
                          <Tooltip content={full}>
                            <span
                              className="seller-card__ship-flag"
                              aria-label={t("shipsFromAria", {
                                country: full,
                              })}
                            >
                              <span>{t("shipsFrom")}</span>
                              {code ? (
                                <CountryFlag code={code} size={12} />
                              ) : (
                                <span>{full}</span>
                              )}
                            </span>
                          </Tooltip>
                        );
                      })()}
                    {(seller?.averageDaysToArrive ?? item.rs?.days) != null && (
                      <span className="seller-card__domain">
                        {t("deliveryDays", {
                          count: Math.round(
                            seller?.averageDaysToArrive ?? item.rs!.days!,
                          ),
                        })}
                      </span>
                    )}
                    {item.sid != null &&
                      (() => {
                        const sid = String(item.sid);
                        const isFiltered =
                          selectedSellers.length === 1 &&
                          selectedSellers[0] === sid;
                        return (
                          <span className="seller-card__actions">
                            <button
                              type="button"
                              className="seller-card__action"
                              title={
                                isFiltered
                                  ? t("showAllSellers")
                                  : t("onlySeller", { seller: item.sn ?? "" })
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedSellers(isFiltered ? [] : [sid]);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              <Filter size={8} />
                              {isFiltered ? t("all") : t("only")}
                            </button>
                            <button
                              type="button"
                              className="seller-card__action seller-card__action--hide"
                              title={t("hideSeller", { seller: item.sn ?? "" })}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (isFiltered) setSelectedSellers([]);
                                toggleHiddenSeller(sid);
                              }}
                            >
                              <EyeOff size={8} /> {t("hide")}
                            </button>
                          </span>
                        );
                      })()}
                  </span>
                </span>
              </div>

              {/* ── Strain spacer: reserves strain-row height when no strains,
                    so variant chip rows align across neighbouring cards ── */}
              {displayStrains.length === 0 &&
                !singleVariantParsed?.strain &&
                ((weightGroups && weightGroups.length > 1) ||
                  showQuantityRow ||
                  (item.v && item.v.length === 1 && !!item.v[0].d)) && (
                  <div className="pill-row-spacer mt-3" aria-hidden="true" />
                )}

              {/* ── Strain buttons (row 1) — scrollable strip ── */}
              {displayStrains.length > 0 && (
                <div className="pill-row mt-3">
                  <div className="pill-row__track">
                    <div
                      ref={strainStripRef}
                      className="pill-row__scroll"
                      onMouseDown={(e) =>
                        handleStripMouseDown(e, strainStripRef)
                      }
                      onScroll={() => handleStripScroll(strainStripRef)}
                    >
                      {displayStrains.map((strain) => {
                        const strainUsd = strainPriceMap?.get(
                          strain.toLowerCase(),
                        );
                        return (
                          <button
                            type="button"
                            key={strain}
                            className={`card-pill card-pill--strain${selectedStrain === strain ? " card-pill--selected" : ""}`}
                            onClick={(e) => handleStrainClick(e, strain)}
                          >
                            {decodeEntities(strain)}
                            {strainUsd != null && (
                              <span className="card-pill--strain__price">
                                {cSym}
                                {(strainUsd * cRate).toFixed(0)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="pill-row__overflow" aria-hidden="true">
                      <span className="pill-row__overflow-count">
                        <span>→</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Weight buttons (row 2) — scrollable strip, hidden when only 1 weight tier ── */}
              {weightGroups && weightGroups.length > 1 && (
                <div className="pill-row mt-2">
                  <div className="pill-row__track">
                    <div
                      ref={weightStripRef}
                      className="pill-row__scroll"
                      onMouseDown={(e) =>
                        handleStripMouseDown(e, weightStripRef)
                      }
                      onScroll={() => handleStripScroll(weightStripRef)}
                    >
                      {weightGroups.map((wg) => {
                        const isSelected = activeGroup?.grams === wg.grams;
                        const isUnavailable =
                          strainAvailableGrams != null &&
                          !strainAvailableGrams.has(wg.grams);
                        // When a strain is picked, show its specific price for
                        // this weight instead of the cross-strain range.
                        const strainPrice =
                          strainWeightPrice?.get(wg.grams) ?? null;
                        const hasRange = wg.price !== wg.priceMax;
                        return (
                          <button
                            type="button"
                            key={wg.grams}
                            className={`variant-size-btn${isSelected ? " variant-size-btn--selected" : ""}${isUnavailable ? " variant-size-btn--unavailable" : ""}`}
                            onClick={(e) => handleWeightClick(e, wg.grams)}
                          >
                            <span className="variant-size-btn__size">
                              {wg.originalLabel
                                ? decodeEntities(wg.originalLabel)
                                : formatWeight(wg.grams)}
                            </span>
                            <span className="variant-size-btn__price">
                              {strainPrice != null
                                ? `${cSym}${(strainPrice * cRate).toFixed(2)}`
                                : hasRange
                                  ? `${cSym}${(wg.price * cRate).toFixed(0)} – ${cSym}${(wg.priceMax * cRate).toFixed(0)}`
                                  : `${cSym}${(wg.price * cRate).toFixed(2)}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="pill-row__overflow" aria-hidden="true">
                      <span className="pill-row__overflow-count">
                        <span>→</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Non-weight variants (ml, packs, carts, etc.) — clickable, updates price.
                  Renders for ≥2 tiers OR a single tier with ≥2 strains
                  (e.g. "1 bar weed bar", "1 bar shroom bar" → one tier, two strains). */}
              {!weightGroups && showQuantityRow && (
                <div className="pill-row mt-2">
                  <div className="pill-row__track">
                    <div
                      ref={weightStripRef}
                      className="pill-row__scroll"
                      onMouseDown={(e) =>
                        handleStripMouseDown(e, weightStripRef)
                      }
                      onScroll={() => handleStripScroll(weightStripRef)}
                    >
                      {quantityGroups.map((qg) => {
                        const isSelected = selectedQtyKey === qg.key;
                        const strainPrice = strainQtyPrice?.get(qg.key) ?? null;
                        const hasRange = qg.price !== qg.priceMax;
                        return (
                          <button
                            type="button"
                            key={qg.key}
                            className={`variant-size-btn${isSelected ? " variant-size-btn--selected" : ""}`}
                            onClick={(e) => handleQtyClick(e, qg.key)}
                          >
                            <span className="variant-size-btn__size">
                              {decodeEntities(qg.originalLabel || qg.label)}
                            </span>
                            <span className="variant-size-btn__price">
                              {strainPrice != null
                                ? `${cSym}${(strainPrice * cRate).toFixed(2)}`
                                : hasRange
                                  ? `${cSym}${(qg.price * cRate).toFixed(0)} – ${cSym}${(qg.priceMax * cRate).toFixed(0)}`
                                  : `${cSym}${(qg.price * cRate).toFixed(2)}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="pill-row__overflow" aria-hidden="true">
                      <span className="pill-row__overflow-count">
                        <span>→</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Single-variant fallback — parse if possible, else show raw text.
                  If the parser extracted a strain, render it as a chip in the strain row
                  (covers "5 1g jetty solventless" where the item name lacks the strain). */}
              {!weightGroups &&
                !quantityGroups &&
                item.v &&
                item.v.length === 1 &&
                item.v[0].d &&
                (() => {
                  const pv = singleVariantParsed;
                  const rawSizeLabel = pv
                    ? pv.originalLabel || pv.weightLabel
                    : item.v[0].d;
                  const sizeLabel = rawSizeLabel
                    ? decodeEntities(rawSizeLabel)
                    : rawSizeLabel;
                  return (
                    <>
                      {pv?.strain && (
                        <div className="pill-row mt-3">
                          <div className="pill-row__track">
                            <div className="pill-row__scroll">
                              <span className="card-pill card-pill--strain">
                                {decodeEntities(pv.strain)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="variant-select mt-3">
                        <div className="variant-pill-row">
                          <span className="variant-size-btn">
                            <span className="variant-size-btn__size">
                              {sizeLabel}
                            </span>
                            <span className="variant-size-btn__price">
                              {cSym}
                              {(item.v[0].usd * cRate).toFixed(2)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </>
                  );
                })()}
            </div>
          </div>
        </div>

        {/* ── Footer gradient: price + timestamps ── */}
        <div className="card-footer-gradient absolute inset-x-0 bottom-0 pb-3 pt-2 px-3 z-40">
          <div className="flex w-full items-end justify-between">
            {/* Price area */}
            <div className="card-price-area">
              <div className="card-price-row">
                <span
                  className={`${priceIsRange ? "card-price-main card-price-main--range" : "card-price-main"}${shipSurcharge > 0 ? " text-amber-600 dark:text-amber-400" : ""}`}
                >
                  {exactPrice != null
                    ? `${cSym}${((exactPrice + shipSurcharge) * cRate).toFixed(2)}`
                    : fmtPrice(
                        displayPrice != null
                          ? displayPrice + shipSurcharge
                          : displayPrice,
                        displayPriceMax != null
                          ? displayPriceMax + shipSurcharge
                          : displayPriceMax,
                        cSym,
                        cRate,
                      )}
                  {shipSurcharge > 0 && (
                    <Truck
                      size={11}
                      className="inline ml-1 -mt-0.5 opacity-70"
                    />
                  )}
                </span>
                {ppu != null && (
                  <span className="card-price-ppg">
                    {ppu.valueMax != null
                      ? /* PPU is inverted vs total price (bulk = lower /unit).
                           Render max→min so it visually aligns with the price
                           range above (cheap-total ↔ highest-ppu on the left). */
                        `${cSym}${(ppu.valueMax * cRate).toFixed(2)} – ${cSym}${(ppu.value * cRate).toFixed(2)}`
                      : `${cSym}${(ppu.value * cRate).toFixed(2)}`}
                    /{UNIT_DISPLAY_LABEL[ppu.unit] ?? ppu.unit}
                  </span>
                )}
              </div>
            </div>

            {/* Timestamps */}
            {clientNow == null ? (
              <div
                className="flex flex-col items-end gap-1 opacity-0"
                aria-hidden="true"
              >
                <span className="text-[10px] leading-none">0</span>
                <span className="text-[10px] leading-none">0</span>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-1">
                {updated && (
                  <span
                    className="text-[10px] leading-none text-muted-foreground cursor-default"
                    title={
                      item.lua
                        ? item.lur && item.lur !== "N"
                          ? `${formatDateTime(item.lua)} (${item.lur})`
                          : formatDateTime(item.lua)
                        : undefined
                    }
                  >
                    {t("updated", { time: formatAge(updated) })}
                  </span>
                )}
                {listedAge ? (
                  <span
                    className="text-[10px] leading-none text-muted-foreground cursor-default"
                    title={item.fsa ?? undefined}
                  >
                    {t("listed", { time: formatAge(listedAge) })}
                  </span>
                ) : (
                  <span className="text-[10px] leading-none text-muted-foreground cursor-default">
                    {t("listedUnknown")}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export const ItemCard = memo(ItemCardInner);
