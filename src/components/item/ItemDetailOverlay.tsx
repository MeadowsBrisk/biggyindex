"use client";
import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue } from 'jotai';
import { useSetAtom } from 'jotai';
import { useUpdateReason } from '@/hooks/useUpdateReason';
import {
  expandedRefNumAtom,
  itemsAtom,
  sortedItemsAtom,
  sortedItemsMapAtom,
  includeShippingPrefAtom,
  favouritesSetAtom,
  toggleFavouriteAtom,
  categoryAtom,
  selectedSubcategoriesAtom,
  includedSellersAtom,
  excludedSellersAtom,
  isLoadingAtom,
} from '@/store/atoms';
import { addToBasketAtom } from '@/store/atoms';
import { showToastAtom } from '@/store/atoms';
import { useItemDetail } from '@/hooks/useItemDetail';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useHistoryState } from '@/hooks/useHistoryState';
import { motion, AnimatePresence } from 'framer-motion';
import { decodeEntities } from '@/lib/core/format';
import { relativeCompact } from '@/lib/ui/relativeTimeCompact';
import { VanIcon } from '@/components/common/icons';
import ImageZoomPreview from '@/components/item/ImageZoomPreview';
import SellerPill from '@/components/seller/SellerPill';
import ReviewsList, { REVIEWS_DISPLAY_LIMIT } from '@/components/reviews/ReviewsList';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Keyboard, EffectFade, FreeMode } from 'swiper/modules';
import 'swiper/css/effect-fade';
import 'swiper/css';
import 'swiper/css/free-mode';
import 'swiper/css/navigation';
import { useExchangeRates, convertToGBP } from '@/hooks/useExchangeRates';
import { roundDisplayGBP } from '@/lib/pricing/priceDisplay';
import { formatUSD } from '@/lib/pricing/priceDisplay';
import { perUnitSuffix } from '@/hooks/usePerUnitLabel';
import { useDisplayCurrency, useForceEnglish } from '@/providers/IntlProvider';
import { classForReviewScore, panelClassForReviewScore } from '@/theme/reviewScoreColors';
import formatDescription from '@/lib/ui/formatDescription';
import { countryLabelFromSource, normalizeShipFromCode } from '@/lib/market/countries';
import { getMarketFromPath } from '@/lib/market/market';
import { proxyImage } from '@/lib/ui/images';
import cn from '@/lib/core/cn';
import ShareMenu from '@/components/actions/ShareMenu';
import EndorseButton from '@/components/actions/EndorseButton';
import MobileTabs from '@/components/item/item-detail/MobileTabs';
import MobileActionsFab from '@/components/item/item-detail/MobileActionsFab';
import DesktopHeaderActions from '@/components/item/item-detail/DesktopHeaderActions';
import TabletActionsDock from '@/components/item/item-detail/TabletActionsDock';
import VariantPriceList from '@/components/item/VariantPriceList';
import InBasketIndicator from '@/components/item/InBasketIndicator';
import ItemGallerySwiper from '@/components/item/item-detail/ItemGallerySwiper';
import ItemVariantPanel from '@/components/item/item-detail/ItemVariantPanel';
import ShippingOptionsPanel from '@/components/item/item-detail/ShippingOptionsPanel';
import ReviewsSection from '@/components/item/item-detail/ReviewsSection';
import { variantRangeText } from '@/lib/pricing/variantPricingDisplay';
import { useTranslations, useFormatter } from 'next-intl';
import { translateCategoryAndSubs } from '@/lib/taxonomy/taxonomyLabels';
// Use shared buttons to avoid duplication across card/overlay
import FavButton from '@/components/actions/FavButton';
import { useParallax } from '@/hooks/useParallax';
import { useScreenSize } from '@/hooks/useScreenSize';

const ParallaxImage = ({ src, alt, className, onClick, rootRef, enabled, loading, decoding, draggable }: any) => {
  const { ref } = useParallax({
    root: rootRef,
    enabled,
    strength: 40,
    axis: 'y'
  });

  // Remove transition classes when parallax is active to prevent lag
  const displayClass = enabled
    ? className.replace(/transition-transform|duration-900|ease-out/g, '').trim()
    : className;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={enabled ? (ref as any) : undefined}
      src={src}
      alt={alt}
      className={displayClass}
      onClick={onClick}
      loading={loading}
      decoding={decoding}
      draggable={draggable}
    />
  );
};

export default function ItemDetailOverlay() {
  const { isMobile } = useScreenSize();
  const tItem = useTranslations('Item');
  const tOv = useTranslations('Overlay');
  const tCats = useTranslations('Categories');
  const tCountries = useTranslations('Countries');
  const tUnits = useTranslations('Units');
  const fmt = useFormatter();
  const [refNum, setRefNum] = useAtom(expandedRefNumAtom);
  const items = useAtomValue(itemsAtom);
  const sortedItems = useAtomValue(sortedItemsAtom);
  const sortedItemsMap = useAtomValue(sortedItemsMapAtom);

  // Get unit labels for per-unit suffix translation
  const unitLabels = React.useMemo(() => {
    try {
      const keys = ['g', 'mg', 'ml', 'kg', 'oz', 'joint', 'item', 'tab', 'cap', 'gummy', 'pk', 'pc', 'bottle', 'jar', 'bar', 'chew', 'square', 'star', 'x'];
      const labels: Record<string, string> = {};
      for (const k of keys) {
        try { labels[k] = tUnits(k); } catch { labels[k] = k; }
      }
      return labels;
    } catch {
      return undefined;
    }
  }, [tUnits]);

  // Wrapped perUnitSuffix with unit labels
  const perUnitSuffixWithLabels = React.useCallback(
    (desc: string, price: number | null, currency?: any) => perUnitSuffix(desc, price, currency, unitLabels),
    [unitLabels]
  );

  // O(1) lookup using Map - only runs when refNum or map changes
  const baseItem = useMemo(() => {
    if (!refNum) return null;
    return sortedItemsMap.get(String(refNum)) || null;
  }, [refNum, sortedItemsMap]);

  // Compute prev/next lazily only when navigation buttons are clicked
  // This avoids building a full index on every overlay open
  const gotoPrev = React.useCallback(() => {
    if (!refNum) return;
    const key = String(refNum);
    const idx = (sortedItems as any[]).findIndex((it: any) => String(it.refNum || it.id) === key);
    if (idx > 0) {
      const prev = sortedItems[idx - 1];
      setRefNum(String(prev.refNum || prev.id));
      try { window.history?.replaceState?.({ __overlay: true }, '', window.location.href); } catch { }
    }
  }, [refNum, sortedItems, setRefNum]);

  const gotoNext = React.useCallback(() => {
    if (!refNum) return;
    const key = String(refNum);
    const idx = (sortedItems as any[]).findIndex((it: any) => String(it.refNum || it.id) === key);
    if (idx >= 0 && idx < sortedItems.length - 1) {
      const next = sortedItems[idx + 1];
      setRefNum(String(next.refNum || next.id));
      try { window.history?.replaceState?.({ __overlay: true }, '', window.location.href); } catch { }
    }
  }, [refNum, sortedItems, setRefNum]);

  // For arrow button visibility, compute index only once per refNum
  const selfIndex = useMemo(() => {
    if (!refNum) return -1;
    const key = String(refNum);
    return (sortedItems as any[]).findIndex((it: any) => String(it.refNum || it.id) === key);
  }, [refNum, sortedItems]);

  const hasPrev = selfIndex > 0;
  const hasNext = selfIndex >= 0 && selfIndex < sortedItems.length - 1;

  // Pass baseItem.lua to enable smart cache invalidation - if item was updated in index, refetch detail
  const { detail, loading, error, reload } = useItemDetail(refNum as any, baseItem?.lua || undefined);
  useBodyScrollLock(!!refNum);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openPreviewSignal, setOpenPreviewSignal] = useState<any>(null);
  const [zoomOpen, setZoomOpen] = useState(false);

  // Track the originally opened item to detect navigation
  const initialRefNumRef = useRef<string | null>(null);
  useEffect(() => {
    if (refNum && !initialRefNumRef.current) {
      initialRefNumRef.current = String(refNum);
    } else if (!refNum) {
      initialRefNumRef.current = null;
    }
  }, [refNum]);

  const close = useCallback(({ skipScroll }: { skipScroll?: boolean } = {}) => {
    const current = refNum;
    const didNavigate = initialRefNumRef.current && current && String(current) !== initialRefNumRef.current;
    setRefNum(null as any);

    // Only scroll to card if user navigated to a different item
    if (!skipScroll && didNavigate && typeof document !== 'undefined' && current) {
      requestAnimationFrame(() => {
        try {
          const esc = typeof CSS?.escape === 'function' ? CSS.escape : (s: string) => s.replace(/"/g, '\\"');
          const el = document.querySelector(`[data-ref="${esc(String(current))}"]`);
          el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        } catch { }
      });
    }
  }, [setRefNum, refNum]);

  // Use centralized history manager
  useHistoryState({
    id: `item-${refNum}`,
    type: 'item',
    isOpen: !!refNum,
    onClose: () => close({})
  });

  // Listen for external close requests
  useEffect(() => {
    if (!refNum) return;
    const onCloseReq = (evt: any) => {
      const skipScroll = evt && typeof evt === 'object' && evt.detail && evt.detail.skipScroll;
      if (refNum) close({ skipScroll });
    };
    window.addEventListener('lb:close-item-overlay' as any, onCloseReq as any);
    return () => {
      window.removeEventListener('lb:close-item-overlay' as any, onCloseReq as any);
    };
  }, [refNum, close]);

  // Hooks that must not be conditionally skipped (declare before any early return)
  const images = useMemo(() => {
    const dImgs = Array.isArray(detail?.imageUrls) ? detail.imageUrls : [];
    const bImgs = Array.isArray((baseItem as any)?.is) ? (baseItem as any).is : [];
    // BUG-002: Fallback to shipping blob SEO images for unavailable items
    const shipSeoImgs = Array.isArray((detail as any)?._shipSeo?.is) ? (detail as any)._shipSeo.is : [];
    const primary = (baseItem as any)?.i || (detail as any)?.imageUrl || (detail as any)?._shipSeo?.i;
    let list = dImgs.length ? dImgs : (bImgs.length ? bImgs : shipSeoImgs);
    if ((!list || list.length === 0) && primary) list = [primary];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const src of list as string[]) {
      if (typeof src === 'string' && src && !seen.has(src)) { seen.add(src); out.push(src); }
    }
    return out;
  }, [detail, baseItem]);
  // Reset any stale zoom-open signal whenever a new refNum (overlay instance) appears
  useEffect(() => { setOpenPreviewSignal(null); }, [refNum]);
  // Clear any review gallery when switching items
  // Clear any review gallery when switching items
  useEffect(() => { setReviewGallery && setReviewGallery(null); }, [refNum]);

  // Reset scroll position on navigation
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [refNum]);

  // Use DB flag to determine if images are optimized in R2 (io=1)
  // If not flagged, assume origin (no proxy) to avoid 404s
  const isOptimized = (baseItem as any)?.io === 1;

  const [activeSlide, setActiveSlide] = useState(0);
  const [mainSwiper, setMainSwiper] = useState<any>(null);
  const rates = useExchangeRates();
  const { currency: ctxCurrency } = useDisplayCurrency();
  const displayCurrency = ctxCurrency || 'GBP';
  // Shipping options (detail) for inclusion toggle
  const shippingOptions = useMemo(() => {
    const shipping = (detail as any)?.shipping;
    const opts = Array.isArray(shipping?.options) ? shipping.options : [];
    return opts.filter((o: any) => typeof o.cost === 'number');
  }, [detail]);
  const allShippingFree = shippingOptions.length > 0 && shippingOptions.every((o: any) => o.cost === 0);
  const [includeShipping, setIncludeShipping] = useAtom(includeShippingPrefAtom);
  const [selectedShipIdx, setSelectedShipIdx] = useState<number | null>(null);
  // Select multiple variants and add with a single action
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<any>>(new Set());
  // Allow selection even when shipping is free via a simulate basket mode
  const [selectionMode, setSelectionMode] = useState(false);
  const toggleVariantSelected = useCallback((vid: any) => {
    setSelectedVariantIds((prev) => {
      const next = new Set(prev);
      if (next.has(vid)) next.delete(vid); else next.add(vid);
      return next;
    });
  }, []);
  // no sorting UI for variants to keep it simple
  // Favourite state + actions (defined early to avoid TDZ in effects)
  const toggleFav = useSetAtom(toggleFavouriteAtom);
  // Use shared Set atom for O(1) lookup instead of per-item selectAtom
  const favSet = useAtomValue(favouritesSetAtom);
  const isFav = baseItem ? favSet.has((baseItem as any).id) : false;
  const addToBasket = useSetAtom(addToBasketAtom);
  const showToast = useSetAtom(showToastAtom);
  // basketItems removed - now handled by isolated InBasketIndicator component

  // BUG-002: Extract SEO fallback from shipping blob for unavailable items
  const shipSeo = (detail as any)?._shipSeo;

  const resolvedSellerName = useMemo(() => {
    if (typeof (detail as any)?.sellerName === 'string' && (detail as any).sellerName) return decodeEntities((detail as any).sellerName);
    if ((detail as any)?.seller && typeof (detail as any).seller.name === 'string' && (detail as any).seller.name) return decodeEntities((detail as any).seller.name);
    if (typeof (baseItem as any)?.sn === 'string' && (baseItem as any).sn) return decodeEntities((baseItem as any).sn);
    if (typeof (baseItem as any)?.sellerName === 'string' && (baseItem as any).sellerName) return decodeEntities((baseItem as any).sellerName);
    // BUG-002: Fallback to shipping blob SEO
    if (typeof shipSeo?.sn === 'string' && shipSeo.sn) return decodeEntities(shipSeo.sn);
    return '';
  }, [detail, baseItem, shipSeo]);
  const resolvedSellerUrl = useMemo(() => {
    if (typeof (detail as any)?.sellerUrl === 'string' && (detail as any).sellerUrl) return (detail as any).sellerUrl;
    if ((detail as any)?.seller && typeof (detail as any).seller.url === 'string' && (detail as any).seller.url) return (detail as any).seller.url;
    if (typeof (baseItem as any)?.sellerUrl === 'string' && (baseItem as any).sellerUrl) return (baseItem as any).sellerUrl;
    if (typeof (baseItem as any)?.url === 'string' && (baseItem as any).url) return (baseItem as any).url;
    return null;
  }, [detail, baseItem]);
  const resolvedSellerOnline = (baseItem as any)?.sellerOnline || (detail as any)?.sellerOnline || null;
  const hasSellerInfo = resolvedSellerName.trim().length > 0;

  // Reset selection state when opening a different item to avoid stale selections
  useEffect(() => {
    setSelectedVariantIds(new Set());
    setSelectionMode(false);
  }, [refNum]);

  // When detail updates or shipping options change, reset selection if needed
  useEffect(() => {
    // Defer logic until detail loaded so we don't clobber persisted preference during initial skeleton
    if (!detail) return;
    if (!includeShipping) { setSelectedShipIdx(null); return; }
    if (shippingOptions.length === 0) { setSelectedShipIdx(null); return; }
    if (selectedShipIdx == null || !shippingOptions[selectedShipIdx]) {
      // Prefer a free option if present; else choose the cheapest paid; else first option
      const freeIdx = shippingOptions.findIndex((o: any) => typeof o.cost === 'number' && o.cost === 0);
      if (freeIdx >= 0) { setSelectedShipIdx(freeIdx); return; }
      let cheapestIdx = -1; let cheapest = Infinity;
      for (let i = 0; i < shippingOptions.length; i++) {
        const o = shippingOptions[i];
        if (!o || typeof (o as any).cost !== 'number' || !((o as any).cost >= 0)) continue;
        if ((o as any).cost < cheapest) { cheapest = (o as any).cost; cheapestIdx = i; }
      }
      setSelectedShipIdx(cheapestIdx >= 0 ? cheapestIdx : 0);
    }
  }, [detail, shippingOptions, includeShipping, selectedShipIdx]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!refNum) return;
    function onKey(e: any) {
      if (zoomOpen) return; // Let ImageZoomPreview handle its own keys
      if (e.key === 'Escape') {
        e.preventDefault();
        close({});
      } else if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        gotoPrev();
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        gotoNext();
      } else if (e.key.toLowerCase() === 'f' && baseItem) {
        e.preventDefault();
        toggleFav((baseItem as any).id);
      }
    }
    window.addEventListener('keydown', onKey as any);
    return () => window.removeEventListener('keydown', onKey as any);
  }, [refNum, close, gotoPrev, gotoNext, baseItem, toggleFav, zoomOpen, hasPrev, hasNext]);

  // Force English preference for item content
  const { forceEnglish } = useForceEnglish();

  // Name: use English original (nEn) when forceEnglish is enabled
  // BUG-002: Fall back to detail.n, then _shipSeo.n if baseItem is missing (item delisted)
  const name = decodeEntities(
    forceEnglish && (baseItem as any)?.nEn
      ? (baseItem as any).nEn
      : (baseItem as any)?.n || (detail as any)?.n || shipSeo?.n || (detail as any)?.name || 'Item'
  );

  // Full description: 
  // - If forceEnglish: always use English (descriptionFull/description from detail, or dEn/d from baseItem)
  // - Else for non-GB: prefer translated, fall back to English
  const market = typeof window !== 'undefined' ? getMarketFromPath(window.location.pathname) : 'GB';
  const description = useMemo(() => {
    // If forcing English, use English content
    if (forceEnglish) {
      return (detail as any)?.descriptionFull || (detail as any)?.description || (baseItem as any)?.dEn || (baseItem as any)?.d || '';
    }
    // For non-GB markets, prefer translated content
    if (market !== 'GB' && (detail as any)?.descriptionTranslated) {
      return (detail as any).descriptionTranslated;
    }
    // Fall back to English
    return (detail as any)?.descriptionFull || (detail as any)?.description || (baseItem as any)?.d || '';
  }, [forceEnglish, detail, baseItem, market]);

  const reviews = (detail as any)?.reviews || [];
  const globalLoading = useAtomValue(isLoadingAtom);
  const hasVariants = Array.isArray((detail as any)?.variants) ? (detail as any).variants.length > 0 : Array.isArray((baseItem as any)?.v) && (baseItem as any).v.length > 0;
  const hasImages = images.length > 0;
  // BUG-002: Show unavailable banner if item exists in shared blob but NOT in current index
  // This happens when an item is delisted - we have detail from blob but no baseItem from index
  // Also check _shipSeo.n from shipping blob as fallback
  const showUnavailableBanner = Boolean(
    !loading && !globalLoading && !error && detail &&
    !baseItem &&  // Not in indexed_items.json (delisted)
    ((detail as any).n || (detail as any).name || shipSeo?.n)  // But we have a name from shared blob or shipping blob
  );
  const [reviewGallery, setReviewGallery] = useState<any>(null); // review image zoom state
  const reviewMeta = (detail as any)?.reviewsMeta;
  // BUG-002: Fallback to _shipSeo for category/subcategories when item is unavailable
  const category = (baseItem as any)?.c || shipSeo?.c || null;
  const subcategories = Array.isArray((baseItem as any)?.sc) ? (baseItem as any).sc : (Array.isArray(shipSeo?.sc) ? shipSeo.sc : []);
  const shipsFrom = (baseItem as any)?.sf || null;
  const lastUpdatedAt = (baseItem as any)?.lua || null;
  const lastUpdateReason = (baseItem as any)?.lur || null;
  const compactUpdateReason = useUpdateReason(lastUpdateReason);
  const createdAt = (baseItem as any)?.fsa || (detail as any)?.createdAt || null;
  const shippingRange = (() => {
    const sh = (baseItem as any)?.sh;
    const minShip = sh?.min ?? (baseItem as any)?.minShip ?? null;
    const maxShip = sh?.max ?? (baseItem as any)?.maxShip ?? null;
    if (minShip == null && maxShip == null) return null;
    return { minShip, maxShip };
  })();
  // BUG-002: Fall back to detail.sl from shared blob for referral link when item is delisted
  const sl = (baseItem as any)?.sl || (detail as any)?.sl || (detail as any)?.share?.shortLink || (detail as any)?.url || (refNum ? `https://littlebiggy.net/item/${refNum}/view/p` : null);
  // const sl = baseItem?.url || detail?.url || null;
  // Build shareable public link with canonical /item/[ref] (keep in-app deep-link via /?ref for internal state)
  const shareRef = refNum as any;
  const shareUrl = typeof window !== 'undefined'
    ? (new URL(`/item/${encodeURIComponent(shareRef)}`, window.location.origin)).toString()
    : '';
  const [shareOpen, setShareOpen] = useState(false);
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeShare = useCallback(() => setShareOpen(false), []);
  // Mobile FAB for actions
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setFabOpen(false); }, [refNum]);
  useEffect(() => {
    function onDocDown(e: any) {
      if (!shareOpen) return;
      const t = e.target;
      const inBtn = shareBtnRef.current && (shareBtnRef.current as any).contains(t);
      // Also check if click is within ShareMenu (it stops propagation but we need to check containment)
      const inMenu = (t as any).closest('[role="menu"]');
      if (!inBtn && !inMenu) setShareOpen(false);
    }
    document.addEventListener('mousedown', onDocDown as any);
    return () => document.removeEventListener('mousedown', onDocDown as any);
  }, [shareOpen]);
  // Close FAB when clicking/tapping outside of its container, but not when interacting with its buttons (they stop propagation)
  useEffect(() => {
    if (!fabOpen) return;
    const onDown = (e: any) => {
      const t = e.target;
      if (fabRef.current && !(fabRef.current as any).contains(t)) {
        setFabOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown as any);
    document.addEventListener('touchstart', onDown as any, { passive: true } as any);
    return () => {
      document.removeEventListener('mousedown', onDown as any);
      document.removeEventListener('touchstart', onDown as any);
    };
  }, [fabOpen]);
  // Compute shipping USD once for pricing utilities
  const selectedShippingUsd = useMemo(() => {
    if (!includeShipping && !selectionMode) return null;
    const opt = (selectedShipIdx != null) ? shippingOptions[selectedShipIdx] : null;
    const c = opt && typeof (opt as any).cost === 'number' ? (opt as any).cost : null;
    return c == null ? null : c;
  }, [includeShipping, selectionMode, selectedShipIdx, shippingOptions]);

  const showSelection = includeShipping || selectionMode;

  // Support both minified (v) and full (variants) keys from baseItem
  const baseVariants = Array.isArray((baseItem as any)?.v) ? (baseItem as any).v : Array.isArray((baseItem as any)?.variants) ? (baseItem as any).variants : [];

  // Variant price range for summary using shared utility (matches list logic exactly)
  const variantPriceRangeText = useMemo(() => {
    if (baseVariants.length === 0) return '';
    return variantRangeText({
      variants: baseVariants,
      displayCurrency,
      rates,
      shippingUsd: selectedShippingUsd as any,
      includeShipping: includeShipping || selectionMode,
      selectedVariantIds,
    });
  }, [baseVariants, displayCurrency, rates, selectedShippingUsd, includeShipping, selectionMode, selectedVariantIds]);

  // Total for selected variants, using same displayed-amount logic
  const selectedTotalText = useMemo(() => {
    if (baseVariants.length === 0 || selectedVariantIds.size === 0) return '';
    const sel = selectedVariantIds;
    // Sum in USD for accurate conversion/formatting
    let totalUSD = 0;
    for (let i = 0; i < baseVariants.length; i++) {
      const v = baseVariants[i];
      const vid = v.vid ?? v.id ?? i;
      if (!sel.has(vid)) continue;
      const baseUsd = (typeof v.usd === 'number' && isFinite(v.usd)) ? v.usd : (typeof v.baseAmount === 'number' && isFinite(v.baseAmount)) ? v.baseAmount : null;
      if (baseUsd == null) continue;
      const amtUSD = (function () {
        // reuse displayedUSDForVariant logic equivalent: base + allocated shipping
        let a = baseUsd as number;
        if ((includeShipping || selectionMode) && typeof (selectedShippingUsd as any) === 'number' && isFinite(selectedShippingUsd as any)) {
          const count = sel.size || 0;
          if (count === 0) a += (selectedShippingUsd as any);
          else if (sel.has(vid)) a += ((selectedShippingUsd as any) / count);
        }
        return a;
      })();
      if (typeof amtUSD === 'number' && isFinite(amtUSD)) totalUSD += amtUSD;
    }
    if (!(totalUSD > 0)) return '';
    return formatUSD(totalUSD, displayCurrency as any, rates as any, { decimals: 2, ceilNonUSD: false } as any);
  }, [baseVariants, selectedVariantIds, displayCurrency, rates, selectedShippingUsd, includeShipping, selectionMode]);


  // Unified compact relative time using translation abbreviations
  const tRel = useTranslations('Rel');
  const shortTimeAgo = useCallback((ts?: number | null) => {
    if (ts == null) return '';
    return relativeCompact(ts, tRel as any);
  }, [tRel]);
  const fullTimeAgo = useCallback((ts?: number | null) => {
    if (ts == null) return '';
    return relativeCompact(ts, tRel as any);
  }, [tRel]);

  // (favourite state defined earlier)

  // Seller include/exclude (no scale animations)
  const [included, setIncluded] = useAtom(includedSellersAtom);
  const [excluded, setExcluded] = useAtom(excludedSellersAtom);
  const lowerSeller = ((baseItem as any)?.sn || (baseItem as any)?.sellerName || '').toLowerCase();
  const isIncluded = (included as any[]).includes(lowerSeller);
  const isExcluded = (excluded as any[]).includes(lowerSeller);
  const onToggleInclude = useCallback(() => {
    if (!lowerSeller) return;
    if (isIncluded) setIncluded((included as any[]).filter((e: any) => e !== lowerSeller) as any);
    else { setIncluded([...(included as any[]), lowerSeller] as any); if ((excluded as any[]).includes(lowerSeller)) setExcluded((excluded as any[]).filter((e: any) => e !== lowerSeller) as any); }
  }, [lowerSeller, isIncluded, included, setIncluded, excluded, setExcluded]);
  const onToggleExclude = useCallback(() => {
    if (!lowerSeller) return;
    if (isExcluded) setExcluded((excluded as any[]).filter((e: any) => e !== lowerSeller) as any);
    else { setExcluded([...(excluded as any[]), lowerSeller] as any); if ((included as any[]).includes(lowerSeller)) setIncluded((included as any[]).filter((e: any) => e !== lowerSeller) as any); }
  }, [lowerSeller, isExcluded, excluded, setExcluded, included, setIncluded]);

  // Category filtering from chips
  const [, setCategory] = useAtom(categoryAtom);
  const [, setSubs] = useAtom(selectedSubcategoriesAtom);
  const goCategory = useCallback((cat?: string) => { if (!cat) return; setCategory(cat as any); (setSubs as any)([] as any); setRefNum(null as any); }, [setCategory, setSubs, setRefNum]);
  const clickSub = useCallback((sub?: string) => { if (!sub) return; setCategory(((category as any) || (baseItem as any)?.c || 'All') as any); (setSubs as any)((curr: any[]) => curr.includes(sub) ? curr.filter((s: any) => s !== sub) : [...curr, sub]); setRefNum(null as any); }, [setCategory, setSubs, setRefNum, category, baseItem]);

  // Early-out render after all hooks are declared to keep hooks order stable
  if (!refNum) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="backdrop"
          ref={backdropRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] md:z-[100] bg-black/60 dark:bg-black/65 backdrop-blur-sm flex items-start md:items-center justify-center p-2 md:p-2 lg:p-4 overflow-hidden md:overflow-y-auto"
          onMouseDown={(e) => { if (e.target === backdropRef.current) close(); }}
        >

          {/* Grid wrapper to place full-height nav zones outside the panel */}
          <div className="w-full h-full md:w-full lg:w-auto grid grid-cols-1 md:grid-cols-[40px_minmax(0,1fr)_40px] lg:grid-cols-[80px_minmax(0,auto)_80px] md:gap-0.5 lg:gap-2 items-start md:items-center justify-center">
            {/* Left nav zone (md+) */}
            <div className="hidden md:flex h-full items-center justify-end">
              <button
                onClick={gotoPrev}
                aria-label={tOv('previousItemAria')}
                disabled={!hasPrev}
                className={cn(
                  "w-full h-full flex items-center justify-center group select-none",
                  hasPrev ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                )}
              >
                <span className="rounded-full md:p-2 lg:p-3 backdrop-blur-sm bg-black/35 text-white border border-white/15 shadow-sm group-hover:bg-black/45 transition-colors">‹</span>
              </button>
            </div>

            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className={cn(
                "relative w-full overlay-inner-border md:max-w-6xl 2xl:w-[calc(100vw-208px)] 2xl:max-w-[1500px] h-full md:min-h-[70vh] md:h-[90vh] md:max-h-[95vh] 2xl:h-[90vh] flex flex-col min-h-0",
                isFav && "fav-card-ring"
              )}
            >
              <div className={cn('overlay-inner', 'flex flex-col min-h-0 flex-1')}>

                {/* Absolute close button (no header for more image space) */}
                <button
                  onClick={() => close()}
                  aria-label={tOv('close')}
                  className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100/90 dark:bg-gray-800/80 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 backdrop-blur focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500"
                >×</button>
                {/* (nav arrows moved outside the panel) */}
                {/* Content grid: 2 cols desktop, 3 cols on ultrawide */}
                <div className="flex-1 min-h-0 md:overflow-hidden grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-[460px_1fr_360px] gap-6 pl-[6px] py-[6px]">
                  {/* Column 1: gallery */}
                  <div ref={scrollRef} className="w-full flex-shrink-0 flex flex-col gap-3 min-h-0 overflow-y-auto custom-scroll pr-1 pb-1 md:pb-10 2xl:pb-0">
                    {images.length > 0 ? (
                      <>
                        <div
                          className={cn(
                            "image-border flex-shrink-0",
                            isFav && "fav-thumb-shadow"
                          )}
                          style={{ '--image-border-radius': '0.5rem', '--image-border-padding': '2.5px' } as React.CSSProperties}
                        >
                          <div
                            className={cn(
                              "image-border-inner relative group border bg-gray-100 dark:bg-gray-800",
                              isFav ? "fav-thumb-border" : 'border-gray-200 dark:border-gray-700'
                            )}
                          >
                            {/* Fav button on image for sub-ultrawide screens */}
                            <div className="absolute right-2 top-2 z-10 hidden md:block 2xl:hidden">
                              {baseItem && <FavButton itemId={(baseItem as any).id} />}
                            </div>
                            <Swiper
                              modules={[Keyboard, EffectFade]}
                              effect="fade"
                              fadeEffect={{ crossFade: true }}
                              keyboard={{ enabled: true }}
                              spaceBetween={0}
                              slidesPerView={1}
                              onSwiper={setMainSwiper}
                              onSlideChange={(sw) => setActiveSlide((sw as any).activeIndex || 0)}
                              className="w-full aspect-[4/3] md:aspect-[16/9] lg:aspect-square minimal-swiper"
                            >
                              {images.map((src, idx) => (
                                <SwiperSlide key={idx + src} className="!h-full">
                                  <button
                                    type="button"
                                    onClick={() => { setReviewGallery(null); setOpenPreviewSignal({ ts: Date.now(), index: idx, guard: refNum }); }}
                                    className="w-full h-full focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={isOptimized ? proxyImage(src) : src}
                                      data-original-src={src}
                                      alt={name}
                                      loading={idx === 0 ? 'eager' : 'lazy'}
                                      decoding="async"
                                      draggable={false}
                                      className="object-cover w-full h-full select-none cursor-zoom-in group-hover:scale-[1.04] transition-transform duration-500"
                                      onError={(e) => {
                                        const t = e.currentTarget;
                                        const o = t.getAttribute('data-original-src');
                                        if (o && t.src !== o) { t.src = o; t.removeAttribute('data-original-src'); }
                                      }}
                                    />
                                  </button>
                                </SwiperSlide>
                              ))}
                            </Swiper>

                            {/* Mobile Thumbnails Overlay (Absolute Bottom Left) */}
                            {images.length > 1 && (
                              <div
                                className="absolute bottom-3 left-3 z-20 md:hidden"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex gap-2 p-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 shadow-lg">
                                  {images.map((src, idx) => (
                                    <button
                                      key={'mobile-thumb-' + idx}
                                      type="button"
                                      onClick={() => mainSwiper && (mainSwiper as any).slideTo(idx)}
                                      className={cn(
                                        'relative w-12 h-12 rounded-lg overflow-hidden border transition-all active:scale-95',
                                        activeSlide === idx
                                          ? 'ring-2 ring-blue-500 border-transparent shadow-md'
                                          : 'border-white/10 opacity-80 hover:opacity-100 hover:border-white/30'
                                      )}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={isOptimized ? proxyImage(src, 112) : src}
                                        data-original-src={src}
                                        alt="thumb"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          const t = e.currentTarget;
                                          const o = t.getAttribute('data-original-src');
                                          if (o && t.src !== o) { t.src = o; t.removeAttribute('data-original-src'); }
                                        }}
                                      />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        {images.length > 1 && (
                          <div className="hidden md:block">
                            <Swiper
                              modules={[FreeMode]}
                              spaceBetween={8}
                              slidesPerView={Math.min(images.length, 6)}
                              freeMode
                              watchSlidesProgress
                            >
                              {images.map((src, idx) => (
                                <SwiperSlide key={'thumb-' + idx} className="!w-auto">
                                  <button
                                    type="button"
                                    onClick={() => mainSwiper && (mainSwiper as any).slideTo(idx)}
                                    className={cn(
                                      'relative w-14 h-14 rounded overflow-hidden border',
                                      activeSlide === idx
                                        ? 'ring-2 ring-blue-500 border-transparent'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                    )}
                                    aria-label={tOv('goToImage', { num: idx + 1 })}
                                    title={tOv('imageNum', { num: idx + 1 })}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={isOptimized ? proxyImage(src, 112) : src}
                                      data-original-src={src}
                                      alt="thumb"
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        const t = e.currentTarget;
                                        const o = t.getAttribute('data-original-src');
                                        if (o && t.src !== o) { t.src = o; t.removeAttribute('data-original-src'); }
                                      }}
                                    />
                                  </button>
                                </SwiperSlide>
                              ))}
                            </Swiper>
                          </div>
                        )}

                        {/* Mobile: name/seller and actions under the swiper */}
                        <div className="block md:hidden">
                          <div className="mt-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100 leading-snug" title={name}>{name}</h2>
                              <div className="mt-1 flex items-center flex-wrap gap-2 text-[11px] text-gray-600 dark:text-gray-300">
                                {hasSellerInfo && (
                                  <>
                                    <span className="italic opacity-90">{tItem('seller')}</span>
                                    <SellerPill sellerName={resolvedSellerName} sellerUrl={resolvedSellerUrl || undefined} sellerOnline={resolvedSellerOnline as any} />
                                  </>
                                )}
                                {shipsFrom && (() => {
                                  const code = normalizeShipFromCode(String(shipsFrom));
                                  let label: string | null = null;
                                  if (code) { try { label = tCountries(code); } catch { } }
                                  return (
                                    <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" />{label || countryLabelFromSource(String(shipsFrom))}</span>
                                  );
                                })()}
                                {lastUpdatedAt ? (
                                  <span className="text-[10px] opacity-70">{tItem('updated', { time: relativeCompact(lastUpdatedAt as any, tRel as any) })}{compactUpdateReason ? ` (${compactUpdateReason})` : ''}</span>
                                ) : createdAt ? (
                                  <span className="text-[10px] opacity-70">{tItem('created', { time: shortTimeAgo(createdAt) })}</span>
                                ) : null}
                              </div>
                              {(category || (subcategories && subcategories.length > 0)) && (
                                <div className="mt-1 text-[11px] italic text-gray-600 dark:text-gray-300 truncate">
                                  <span className="opacity-80">{tOv('categoryLabel')}</span>
                                  <span className="ml-1">{translateCategoryAndSubs({ tCats, category, subcategories }).join(', ')}</span>
                                </div>
                              )}
                            </div>
                            {/* Actions moved to mobile FAB to save space */}
                            <div className="shrink-0 hidden" />
                          </div>

                          {/* Mobile tabs: Prices / Description / Reviews */}
                          <MobileTabs
                            key={refNum}
                            baseItem={baseItem}
                            rates={rates}
                            includeShipping={includeShipping}
                            setIncludeShipping={setIncludeShipping}
                            shippingOptions={shippingOptions}
                            allShippingFree={allShippingFree}
                            selectedShipIdx={selectedShipIdx}
                            setSelectedShipIdx={setSelectedShipIdx}
                            variantPriceRangeText={variantPriceRangeText}
                            perUnitSuffix={perUnitSuffixWithLabels}
                            reviews={reviews}
                            loading={loading}
                            error={!!error}
                            reload={reload}
                            fullTimeAgo={fullTimeAgo}
                            onReviewImageClick={(images: string[], index: number) => { setOpenPreviewSignal(null); setReviewGallery({ images, index, ts: Date.now(), guard: refNum }); }}
                            description={description}
                            convertToGBP={convertToGBP}
                            roundDisplayGBP={roundDisplayGBP}
                            ReviewsList={ReviewsList}
                            formatDescription={formatDescription}
                            sl={sl}
                            displayName={name}
                            leadImage={images?.[0] || (baseItem as any)?.i}
                          />
                          {/* Mobile actions toggle moved to bottom-left absolute (same bottom offset as Biggy), mobile only */}
                        </div>
                      </>
                    ) : (
                      <div
                        className="image-border"
                        style={{ '--image-border-radius': '0.5rem', '--image-border-padding': '2.5px' } as React.CSSProperties}
                      >
                        <div className="image-border-inner relative w-full aspect-square flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800">
                          <div className="w-12 h-12 rounded-full border-4 border-gray-300 dark:border-gray-600 border-t-blue-500 animate-spin" />
                        </div>
                      </div>
                    )}
                    {/* Bullets removed in favor of thumbnails */}
                    {/* Hidden trigger gallery component */}
                    {images.length > 0 && (
                      <ImageZoomPreview
                        key={(refNum as any) + '-seller'}
                        imageUrl={images[0]}
                        imageUrls={images}
                        alt={name}
                        openSignal={openPreviewSignal}
                        hideTrigger
                        onOpenChange={setZoomOpen}
                        guardKey={refNum as any}
                      />
                    )}
                    {reviewGallery && reviewGallery.images && reviewGallery.images.length > 0 && (
                      <ImageZoomPreview
                        key={(refNum as any) + '-review-' + reviewGallery.ts}
                        imageUrl={reviewGallery.images[reviewGallery.index]}
                        imageUrls={reviewGallery.images}
                        alt={name + ' review image'}
                        openSignal={reviewGallery}
                        hideTrigger
                        onOpenChange={(o) => { setZoomOpen(o); if (!o) setReviewGallery(null); }}
                        guardKey={refNum as any}
                      />
                    )}
                    {/* Variant prices (per-unit) with large range - extracted for performance */}
                    <ItemVariantPanel
                      baseItem={baseItem}
                      baseVariants={baseVariants}
                      rates={rates}
                      displayCurrency={displayCurrency}
                      includeShipping={includeShipping}
                      setIncludeShipping={setIncludeShipping}
                      shippingOptions={shippingOptions}
                      allShippingFree={allShippingFree}
                      selectedShipIdx={selectedShipIdx}
                      selectedShippingUsd={selectedShippingUsd}
                      perUnitSuffix={perUnitSuffixWithLabels}
                      name={name}
                      resolvedSellerName={resolvedSellerName}
                      images={images}
                      sl={sl}
                    />
                    {/* Shipping options - extracted for performance */}
                    <ShippingOptionsPanel
                      options={(detail as any)?.shipping?.options || []}
                      loading={loading}
                      detail={detail}
                      includeShipping={includeShipping}
                      allShippingFree={allShippingFree}
                      selectedShipIdx={selectedShipIdx}
                      setSelectedShipIdx={setSelectedShipIdx}
                      displayCurrency={displayCurrency}
                      rates={rates}
                    />

                  </div>
                  {/* Column 2: details & description + reviews (hidden for mobile; reviews hidden on 2xl) */}
                  <div className="hidden md:block flex-1 min-w-0 md:overflow-y-auto custom-scroll pr-1 space-y-4 xl:pr-4 pb-32 md:pb-13 2xl:pb-32">
                    {/* Sticky header on ultrawide: share, title, shipping info, category */}
                    <div className="2xl:sticky 2xl:top-0 2xl:z-10 2xl:bg-white/85 2xl:dark:bg-[#0f1725]/85 2xl:backdrop-blur-md 2xl:border-b 2xl:border-gray-200/70 2xl:dark:border-gray-700/70 2xl:pt-2 2xl:pb-2">
                      <div className="hidden md:flex pt-1 items-start justify-between gap-3 md:pr-10 2xl:pr-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-lg md:text-xl text-gray-900 dark:text-gray-100 leading-snug" title={name}>{name}</h2>
                          </div>
                          <div className="mt-1 flex items-center flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
                            {hasSellerInfo && (
                              <>
                                <span className="italic opacity-90">{tItem('seller')}</span>
                                <SellerPill sellerName={resolvedSellerName} sellerUrl={resolvedSellerUrl || undefined} sellerOnline={resolvedSellerOnline as any} />
                              </>
                            )}
                            {shipsFrom && (() => {
                              const code = normalizeShipFromCode(String(shipsFrom));
                              let label: string | null = null;
                              if (code) { try { label = tCountries(code); } catch { } }
                              return (
                                <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" />{label || countryLabelFromSource(String(shipsFrom))}</span>
                              );
                            })()}
                            {lastUpdatedAt ? (
                              <span className="text-[11px] opacity-70 2xl:mt-[2px]">{tItem('updated', { time: relativeCompact(lastUpdatedAt as any, tRel as any) })}{compactUpdateReason ? ` (${compactUpdateReason})` : ''}</span>
                            ) : createdAt ? (
                              <span className="text-[11px] opacity-70 2xl:mt-[2px]">{tItem('created', { time: shortTimeAgo(createdAt) })}</span>
                            ) : null}
                          </div>
                        </div>
                        {/* Actions on ultrawide header only; on md/lg moved below shipping */}
                        <DesktopHeaderActions
                          baseItem={baseItem}
                          isFav={isFav as any}
                          toggleFav={toggleFav}
                          shareOpen={shareOpen}
                          setShareOpen={setShareOpen}
                          shareBtnRef={shareBtnRef}
                          shareUrl={shareUrl}
                        />
                      </div>
                      {(category || subcategories.length > 0) && (
                        <div className="mt-[0.2em] text-xs italic text-gray-600 dark:text-gray-300">
                          <span className="opacity-80">{tOv('categoryLabel')}</span>
                          <span className="ml-1">{translateCategoryAndSubs({ tCats, category, subcategories }).join(', ')}</span>
                        </div>
                      )}
                      {showUnavailableBanner && (
                        <div className="mt-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-100/80 dark:bg-orange-950/40 border border-orange-300/70 dark:border-orange-700/60 rounded-md px-2 py-1.5 flex flex-wrap items-center gap-2 max-w-xl">
                          <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-orange-500 dark:bg-orange-400" />
                          <span className="font-semibold">{tOv('itemUnavailableTitle')}</span>
                          <span className="opacity-80">{tOv('itemUnavailableDesc')}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1" data-nosnippet>{tOv('description')}</h3>
                      {loading && !detail && (
                        <div className="animate-pulse space-y-2">
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                        </div>
                      )}
                      {!loading && description && formatDescription(description)}
                      {!loading && !description && <div className="text-xs italic text-gray-400">{tOv('noDescription')}</div>}
                    </div>

                    {/* Reviews (non-ultrawide) - extracted for performance */}
                    <ReviewsSection
                      reviews={reviews}
                      baseItem={baseItem}
                      reviewMeta={reviewMeta}
                      loading={loading && !detail}
                      error={error}
                      reload={reload}
                      fullTimeAgo={fullTimeAgo}
                      onImageClick={(src: string, images: string[], index: number) => { setOpenPreviewSignal(null); setReviewGallery({ images, index, ts: Date.now(), guard: refNum }); }}
                      sl={sl}
                    />
                  </div>
                  {/* Column 3 (ultrawide): reviews - extracted for performance */}
                  <div className="hidden 2xl:block min-w-0 md:overflow-y-auto custom-scroll pr-1 pt-6 pb-13">
                    <ReviewsSection
                      reviews={reviews}
                      baseItem={baseItem}
                      reviewMeta={reviewMeta}
                      loading={loading && !detail}
                      error={error}
                      reload={reload}
                      fullTimeAgo={fullTimeAgo}
                      onImageClick={(src: string, images: string[], index: number) => { setOpenPreviewSignal(null); setReviewGallery({ images, index, ts: Date.now(), guard: refNum }); }}
                      sl={sl}
                      ultrawide
                    />
                  </div>
                </div>
                {/* Tablet/desktop actions dock (md to xl): bottom-left of overlay */}
                <TabletActionsDock
                  baseItem={baseItem}
                  isFav={isFav as any}
                  toggleFav={toggleFav}
                  shareOpen={shareOpen}
                  setShareOpen={setShareOpen}
                  shareBtnRef={shareBtnRef}
                  shareUrl={shareUrl}
                />

                {/* Floating biggy button (shipping info removed per design) */}
                {sl && (
                  <div className="hidden md:block pointer-events-none absolute right-3 bottom-25 md:right-3 md:bottom-3 xl:right-10 z-20">
                    <a
                      href={sl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pointer-events-auto group/button inline-flex items-center gap-2 text-sm font-semibold tracking-wide bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-full px-5 py-2.5 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300"
                    >
                      <span>Little Biggy</span>
                      <span className="inline-block text-lg leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1">→</span>
                    </a>
                  </div>
                )}

                {/* Mobile actions are now in the fixed bottom bar */}
                {/* Mobile Prev/Next rendered via portal so it's fixed to the viewport, not the transformed panel */}

              </div>
            </motion.div>

            {/* Right nav zone (md+) */}
            <div className="hidden md:flex h-full items-center justify-start">
              <button
                onClick={gotoNext}
                aria-label={tOv('nextItemAria')}
                disabled={!hasNext}
                className={cn(
                  "w-full h-full flex items-center justify-center group select-none",
                  hasNext ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                )}
              >
                <span className="rounded-full md:p-2 lg:p-3 backdrop-blur-sm bg-black/35 text-white border border-white/15 shadow-sm group-hover:bg-black/45 transition-colors">›</span>
              </button>
            </div>
          </div >

        </motion.div >

      </AnimatePresence >
      {/* Mobile fixed bottom nav via portal (outside AnimatePresence to avoid transform/stack contexts) */}
      {
        typeof document !== 'undefined' && createPortal(
          (
            <div className="md:hidden fixed left-0 right-0 bottom-0 z-[1000]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white/75 dark:bg-[#0f1725]/75 backdrop-blur-md shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
                {/* Left Group: Menu + Nav */}
                <div className="flex items-center gap-3">
                  <div className="shrink-0 relative z-50">
                    <MobileActionsFab
                      baseItem={baseItem}
                      isFav={isFav as any}
                      toggleFav={toggleFav}
                      fabOpen={fabOpen}
                      setFabOpen={setFabOpen}
                      fabRef={fabRef}
                      shareBtnRef={shareBtnRef}
                      setShareOpen={setShareOpen}
                      shareOpen={shareOpen}
                      shareUrl={shareUrl}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={gotoPrev}
                      disabled={!hasPrev}
                      className={cn(
                        "h-10 px-5 text-sm font-semibold rounded-full transition-colors flex items-center justify-center select-none",
                        !hasPrev
                          ? "bg-gray-50 dark:bg-white/5 text-gray-300 dark:text-gray-600 cursor-not-allowed"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600"
                      )}
                      aria-label={tOv('prev')}
                    >
                      <span className="text-xl leading-none mr-1 pb-0.5">‹</span> {tOv('prev')}
                    </button>
                    <button
                      onClick={gotoNext}
                      disabled={!hasNext}
                      className={cn(
                        "h-10 px-5 text-sm font-semibold rounded-full transition-colors flex items-center justify-center select-none",
                        !hasNext
                          ? "bg-gray-50 dark:bg-white/5 text-gray-300 dark:text-gray-600 cursor-not-allowed"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600"
                      )}
                      aria-label={tOv('next')}
                    >
                      {tOv('next')} <span className="text-xl leading-none ml-1 pb-0.5">›</span>
                    </button>
                  </div>
                </div>

                {/* Right: Little Biggy Link */}
                {sl && (
                  <a
                    href={sl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 group/button h-10 inline-flex items-center gap-2 text-[13px] font-semibold tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-4 shadow-lg shadow-emerald-600/20 dark:shadow-emerald-900/40 transition-all focus:outline-none focus-visible:ring-2 ring-offset-2 ring-emerald-500 ring-offset-white dark:ring-offset-[#0f1725]"
                  >
                    <span>Little Biggy</span>
                    <span className="inline-block text-base leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1">→</span>
                  </a>
                )}
                {!sl && <div className="w-4" />}
              </div>
            </div>
          ), document.body)
      }
    </>
  );
}