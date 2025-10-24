import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue } from 'jotai';
import { useSetAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import {
  expandedRefNumAtom,
  itemsAtom,
  sortedItemsAtom,
  includeShippingPrefAtom,
  favouritesAtom,
  toggleFavouriteAtom,
  categoryAtom,
  selectedSubcategoriesAtom,
  includedSellersAtom,
  excludedSellersAtom,
  isLoadingAtom,
} from '@/store/atoms';
import { useItemDetail } from '@/hooks/useItemDetail';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { motion, AnimatePresence } from 'framer-motion';
import { decodeEntities, timeAgo } from '@/lib/format';
import VanIcon from '@/app/assets/svg/van.svg';
import ImageZoomPreview from '@/components/ImageZoomPreview';
import SellerInfoBadge from '@/components/SellerInfoBadge';
import ReviewsList, { REVIEWS_DISPLAY_LIMIT } from '@/components/ReviewsList';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Keyboard, EffectFade, FreeMode } from 'swiper/modules';
import 'swiper/css/effect-fade';
import 'swiper/css';
import 'swiper/css/free-mode';
import 'swiper/css/navigation';
import { useExchangeRates, convertToGBP } from '@/hooks/useExchangeRates';
import { roundDisplayGBP } from '@/lib/pricing';
import { formatUSD } from '@/lib/priceDisplay';
import { usePerUnitLabel } from '@/hooks/usePerUnitLabel';
import { classForReviewScore, panelClassForReviewScore } from '@/theme/reviewScoreColors';
import formatDescription from '@/lib/formatDescription';
import { favouriteAccent } from '@/theme/favouriteAccent';
import { countryLabelFromSource } from '@/lib/countries';
import { proxyImage } from '@/lib/images';
import cn from '@/app/cn';
import ShareMenu from '@/components/ShareMenu';
import EndorseButton from '@/components/EndorseButton';
import MobileTabs from '@/components/item-detail/MobileTabs';
import MobileActionsFab from '@/components/item-detail/MobileActionsFab';
import DesktopHeaderActions from '@/components/item-detail/DesktopHeaderActions';
import TabletActionsDock from '@/components/item-detail/TabletActionsDock';
import VariantPriceList from '@/components/VariantPriceList';
import { variantRangeText, displayedAmount } from '@/lib/variantPricingDisplay';
// Use shared buttons to avoid duplication across card/overlay
import FavButton from '@/components/FavButton';
import SellerFilterButtons from '@/components/SellerFilterButtons';
import { addToBasketAtom, basketAtom } from '@/store/atoms';
import { displayCurrencyAtom } from '@/store/atoms';
import { showToastAtom } from '@/store/atoms';

// Reviews caption uses the actually displayed count (reviews.length)

// MobileTabs extracted to component

export default function ItemDetailOverlay() {
  const [refNum, setRefNum] = useAtom(expandedRefNumAtom);
  const items = useAtomValue(itemsAtom);
  const sortedItems = useAtomValue(sortedItemsAtom);
  const baseItem = (sortedItems.find(it => it.refNum === refNum || String(it.id) === refNum)) || (items.find(it => it.refNum === refNum || String(it.id) === refNum));
  const listOrder = React.useMemo(() => sortedItems.map(it => it.refNum || String(it.id)), [sortedItems]);
  const selfIndex = React.useMemo(() => listOrder.indexOf(refNum), [listOrder, refNum]);
  const hasPrev = selfIndex > 0;
  const hasNext = selfIndex >= 0 && selfIndex < listOrder.length - 1;
  const gotoPrev = React.useCallback(() => {
    if (!hasPrev) return;
    setRefNum(listOrder[selfIndex - 1]);
    try { if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState({ __overlay: true }, '', window.location.href); } catch {}
  }, [hasPrev, listOrder, selfIndex, setRefNum]);
  const gotoNext = React.useCallback(() => {
    if (!hasNext) return;
    setRefNum(listOrder[selfIndex + 1]);
    try { if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState({ __overlay: true }, '', window.location.href); } catch {}
  }, [hasNext, listOrder, selfIndex, setRefNum]);
  
  const { detail, loading, error, reload } = useItemDetail(refNum);
  useBodyScrollLock(!!refNum);
  const close = useCallback(({ skipScroll } = {}) => {
    const current = refNum;
    setRefNum(null);
    if (typeof document !== 'undefined' && current && !skipScroll) {
      try {
        const esc = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') ? CSS.escape : (s => String(s).replace(/"/g, '\\"'));
        const el = document.querySelector(`[data-ref="${esc(String(current))}"]`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch {}
    }
  }, [setRefNum, refNum]);
  const backdropRef = useRef(null);
  const [openPreviewSignal, setOpenPreviewSignal] = useState(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  // (width is locked via CSS vw calc at ultrawide)
  // Ensure mobile back button closes overlay first
  const backSentinelPushed = useRef(false);
  const ignoreNextPopRef = useRef(false);
  useEffect(() => {
    if (!refNum) {
      backSentinelPushed.current = false;
      return;
    }
    // Push a dummy state so first Back triggers popstate without leaving the page
    if (typeof window !== 'undefined' && window.history && !backSentinelPushed.current) {
      try {
        window.history.pushState({ __overlay: true }, '', window.location.href);
        backSentinelPushed.current = true;
      } catch {}
    }
    const onZoomBalance = () => { ignoreNextPopRef.current = true; };
    window.addEventListener('lb:zoom-will-balance-back', onZoomBalance, { once: true });

    const onPop = () => {
      if (ignoreNextPopRef.current) { ignoreNextPopRef.current = false; return; }
      // Let ImageZoomPreview consume the Back press first
      if (zoomOpen) return;
      if (refNum) close();
    };
    window.addEventListener('popstate', onPop);
    const onCloseReq = (evt) => {
      const skipScroll = evt && typeof evt === 'object' && evt.detail && evt.detail.skipScroll;
      if (refNum) close({ skipScroll });
    };
    window.addEventListener('lb:close-item-overlay', onCloseReq);
    return () => {
      window.removeEventListener('lb:zoom-will-balance-back', onZoomBalance);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('lb:close-item-overlay', onCloseReq);
    };
  }, [refNum, close, zoomOpen]);

  // Hooks that must not be conditionally skipped (declare before any early return)
  const images = useMemo(() => {
    const dImgs = Array.isArray(detail?.imageUrls) ? detail.imageUrls : [];
    const bImgs = Array.isArray(baseItem?.imageUrls) ? baseItem.imageUrls : [];
    const primary = baseItem?.imageUrl || detail?.imageUrl;
    let list = dImgs.length ? dImgs : bImgs;
    if ((!list || list.length === 0) && primary) list = [primary];
    const seen = new Set();
    const out = [];
    for (const src of list) {
      if (typeof src === 'string' && src && !seen.has(src)) { seen.add(src); out.push(src); }
    }
    return out;
  }, [detail, baseItem]);
  // Reset any stale zoom-open signal whenever a new refNum (overlay instance) appears
  useEffect(() => { setOpenPreviewSignal(null); }, [refNum]);
  // Clear any review gallery when switching items
  useEffect(() => { setReviewGallery && setReviewGallery(null); }, [refNum]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [mainSwiper, setMainSwiper] = useState(null);
  const rates = useExchangeRates();
  const displayCurrency = useAtomValue(displayCurrencyAtom);
  const { perUnitSuffix } = usePerUnitLabel();
  // Shipping options (detail) for inclusion toggle
  const shippingOptions = useMemo(() => {
    const opts = Array.isArray(detail?.shipping?.options) ? detail.shipping.options : [];
    return opts.filter(o => typeof o.cost === 'number');
  }, [detail]);
  const allShippingFree = shippingOptions.length > 0 && shippingOptions.every(o => o.cost === 0);
  const [includeShipping, setIncludeShipping] = useAtom(includeShippingPrefAtom);
  const [selectedShipIdx, setSelectedShipIdx] = useState(null);
  // Select multiple variants and add with a single action
  const [selectedVariantIds, setSelectedVariantIds] = useState(new Set());
  // Allow selection even when shipping is free via a simulate basket mode
  const [selectionMode, setSelectionMode] = useState(false);
  const toggleVariantSelected = useCallback((vid) => {
    setSelectedVariantIds((prev) => {
      const next = new Set(prev);
      if (next.has(vid)) next.delete(vid); else next.add(vid);
      return next;
    });
  }, []);
  // no sorting UI for variants to keep it simple
  // Favourite state + actions (defined early to avoid TDZ in effects)
  const toggleFav = useSetAtom(toggleFavouriteAtom);
  const isFavAtom = useMemo(() => selectAtom(favouritesAtom, (favs) => Array.isArray(favs) && baseItem && favs.includes(baseItem.id)), [baseItem]);
  const isFav = useAtomValue(isFavAtom);
  const addToBasket = useSetAtom(addToBasketAtom);
  const showToast = useSetAtom(showToastAtom);
  const basketItems = useAtomValue(basketAtom) || [];
  const resolvedSellerName = useMemo(() => {
    if (typeof detail?.sellerName === 'string' && detail.sellerName) return decodeEntities(detail.sellerName);
    if (detail?.seller && typeof detail.seller.name === 'string' && detail.seller.name) return decodeEntities(detail.seller.name);
    if (typeof baseItem?.sellerName === 'string' && baseItem.sellerName) return decodeEntities(baseItem.sellerName);
    return '';
  }, [detail, baseItem]);
  const resolvedSellerUrl = useMemo(() => {
    if (typeof detail?.sellerUrl === 'string' && detail.sellerUrl) return detail.sellerUrl;
    if (detail?.seller && typeof detail.seller.url === 'string' && detail.seller.url) return detail.seller.url;
    if (typeof baseItem?.sellerUrl === 'string' && baseItem.sellerUrl) return baseItem.sellerUrl;
    if (typeof baseItem?.url === 'string' && baseItem.url) return baseItem.url;
    return null;
  }, [detail, baseItem]);
  const resolvedSellerOnline = baseItem?.sellerOnline || detail?.sellerOnline || null;
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
      const freeIdx = shippingOptions.findIndex(o => typeof o.cost === 'number' && o.cost === 0);
      if (freeIdx >= 0) { setSelectedShipIdx(freeIdx); return; }
      let cheapestIdx = -1; let cheapest = Infinity;
      for (let i = 0; i < shippingOptions.length; i++) {
        const o = shippingOptions[i];
        if (!o || typeof o.cost !== 'number' || !(o.cost >= 0)) continue;
        if (o.cost < cheapest) { cheapest = o.cost; cheapestIdx = i; }
      }
      setSelectedShipIdx(cheapestIdx >= 0 ? cheapestIdx : 0);
    }
  }, [detail, shippingOptions, includeShipping, selectedShipIdx]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (zoomOpen) return; // ImageZoomPreview handles its own escape/close
        close();
      } else if (e.key === 'ArrowLeft') {
        if (!zoomOpen) gotoPrev();
      } else if (e.key === 'ArrowRight') {
        if (!zoomOpen) gotoNext();
      } else if (e.key.toLowerCase() === 'f') {
        if (!zoomOpen && baseItem) toggleFav(baseItem.id);
      }
    }
    if (refNum) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refNum, close, gotoPrev, gotoNext, baseItem, toggleFav, zoomOpen]);

  const name = decodeEntities(baseItem?.name || detail?.name || 'Item');
  const description = detail?.descriptionFull || baseItem?.description || '';
  const reviews = detail?.reviews || [];
  const globalLoading = useAtomValue(isLoadingAtom);
  const hasVariants = Array.isArray(detail?.variants) ? detail.variants.length > 0 : Array.isArray(baseItem?.variants) ? baseItem.variants.length > 0 : false;
  const hasImages = images.length > 0;
  const showUnavailableBanner = Boolean(
    !loading && !globalLoading && !error && detail && 
    Array.isArray(detail.variants) && detail.variants.length === 0 &&
    (!Array.isArray(detail.imageUrls) || detail.imageUrls.length === 0) &&
    !detail.imageUrl
  );
  const [reviewGallery, setReviewGallery] = useState(null); // review image zoom state
  const reviewMeta = detail?.reviewsMeta;
  const category = baseItem?.category || null;
  const subcategories = Array.isArray(baseItem?.subcategories) ? baseItem.subcategories : [];
  const shipsFrom = baseItem?.shipsFrom || null;
  const lastUpdatedAt = baseItem?.lastUpdatedAt || null;
  const lastUpdateReason = baseItem?.lastUpdateReason || null;
  const compactUpdateReason = useMemo(() => {
    if (!lastUpdateReason || typeof lastUpdateReason !== 'string') return '';
    let s = lastUpdateReason;
    // Normalize some older forms to compact variant summary
    s = s.replace(/\b(\d+) variants added\b/gi, '+$1 variants');
    s = s.replace(/\b(\d+) variants removed\b/gi, '-$1 variants');
    s = s.replace(/\bVariant added\b/gi, '+1 variant');
    s = s.replace(/\bVariant removed\b/gi, '-1 variant');
    // Coalesce "+N variants, -M variants" -> "+N / -M variants"
    s = s.replace(/\+([0-9]+) variants, -([0-9]+) variants/gi, '+$1 / -$2 variants');
    return s;
  }, [lastUpdateReason]);
  const createdAt = baseItem?.firstSeenAt || detail?.createdAt || null;
  const shippingRange = (() => {
    const { minShip, maxShip } = baseItem || {};
    if (minShip == null && maxShip == null) return null;
    return { minShip, maxShip };
  })();
  const biggyLink = detail?.share?.shortLink || baseItem?.share || baseItem?.url || detail?.url || null;
  // const biggyLink = baseItem?.url || detail?.url || null;
  // Build shareable public link with canonical /item/[ref] (keep in-app deep-link via /?ref for internal state)
  const shareRef = refNum;
  const shareUrl = typeof window !== 'undefined'
    ? (new URL(`/item/${encodeURIComponent(shareRef)}`, window.location.origin)).toString()
    : '';
  const [shareOpen, setShareOpen] = useState(false);
  const shareBtnRef = useRef(null);
  const closeShare = useCallback(() => setShareOpen(false), []);
  // Mobile FAB for actions
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef(null);
  useEffect(() => { setFabOpen(false); }, [refNum]);
  useEffect(() => {
    function onDocDown(e){ 
      if(!shareOpen) return; 
      const t=e.target; 
      const inBtn = shareBtnRef.current && shareBtnRef.current.contains(t);
      // Also check if click is within ShareMenu (it stops propagation but we need to check containment)
      const inMenu = t.closest('[role="menu"]');
      if(!inBtn && !inMenu) setShareOpen(false); 
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [shareOpen]);
  // Close FAB when clicking/tapping outside of its container, but not when interacting with its buttons (they stop propagation)
  useEffect(() => {
    if (!fabOpen) return;
    const onDown = (e) => {
      const t = e.target;
      if (fabRef.current && !fabRef.current.contains(t)) {
        setFabOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [fabOpen]);
  // Compute shipping USD once for pricing utilities
  const selectedShippingUsd = useMemo(() => {
    if (!includeShipping && !selectionMode) return null;
    const opt = (selectedShipIdx != null) ? shippingOptions[selectedShipIdx] : null;
    const c = opt && typeof opt.cost === 'number' ? opt.cost : null;
    return c == null ? null : c;
  }, [includeShipping, selectionMode, selectedShipIdx, shippingOptions]);

  const showSelection = includeShipping || selectionMode;

  // Variant price range for summary using shared utility (matches list logic exactly)
  const variantPriceRangeText = useMemo(() => {
    if (!Array.isArray(baseItem?.variants) || baseItem.variants.length === 0) return '';
    return variantRangeText({
      variants: baseItem.variants,
      displayCurrency,
      rates,
      shippingUsd: selectedShippingUsd,
      includeShipping: includeShipping || selectionMode,
      selectedVariantIds,
    });
  }, [baseItem, displayCurrency, rates, selectedShippingUsd, includeShipping, selectionMode, selectedVariantIds]);

  // Total for selected variants, using same displayed-amount logic
  const selectedTotalText = useMemo(() => {
    if (!Array.isArray(baseItem?.variants) || selectedVariantIds.size === 0) return '';
    const sel = selectedVariantIds;
    let total = 0;
    for (let i = 0; i < baseItem.variants.length; i++) {
      const v = baseItem.variants[i];
      const vid = v.id || i;
      if (!sel.has(vid)) continue;
      const baseUsd = (typeof v.baseAmount === 'number' && isFinite(v.baseAmount)) ? v.baseAmount : null;
      if (baseUsd == null) continue;
      const amt = displayedAmount({ baseUsd, currency: displayCurrency, rates, shippingUsd: selectedShippingUsd, includeShipping: includeShipping || selectionMode, selectedVariantIds: sel, variantId: vid });
      if (typeof amt === 'number' && isFinite(amt)) total += amt;
    }
    if (total <= 0) return '';
    if (displayCurrency === 'USD') return formatUSD(total, 'USD', rates, { decimals: 2 });
    return `£${total.toFixed(2).replace(/\.00$/, '')}`;
  }, [baseItem, selectedVariantIds, displayCurrency, rates, selectedShippingUsd, includeShipping, selectionMode]);


  // Full relative time (e.g., "1 week ago")
  const fullTimeAgo = useCallback((ts) => {
    if (!ts) return '';
    const now = Date.now();
    const diff = Math.max(0, now - ts);
    const sec = Math.floor(diff / 1000);
    const units = [
      ['year', 60*60*24*365],
      ['month', 60*60*24*30],
      ['week', 60*60*24*7],
      ['day', 60*60*24],
      ['hour', 60*60],
      ['minute', 60],
      ['second', 1]
    ];
    for (const [label, size] of units) {
      if (sec >= size) {
        const val = Math.floor(sec / size);
        if (label === 'second' && val < 10) return 'just now';
        return `${val} ${label}${val === 1 ? '' : 's'} ago`;
      }
    }
    return 'just now';
  }, []);

  // (favourite state defined earlier)

  // Seller include/exclude (no scale animations)
  const [included, setIncluded] = useAtom(includedSellersAtom);
  const [excluded, setExcluded] = useAtom(excludedSellersAtom);
  const lowerSeller = (baseItem?.sellerName || '').toLowerCase();
  const isIncluded = included.includes(lowerSeller);
  const isExcluded = excluded.includes(lowerSeller);
  const onToggleInclude = useCallback(() => {
    if (!lowerSeller) return;
    if (isIncluded) setIncluded(included.filter(e => e !== lowerSeller));
    else { setIncluded([...included, lowerSeller]); if (excluded.includes(lowerSeller)) setExcluded(excluded.filter(e => e !== lowerSeller)); }
  }, [lowerSeller, isIncluded, included, setIncluded, excluded, setExcluded]);
  const onToggleExclude = useCallback(() => {
    if (!lowerSeller) return;
    if (isExcluded) setExcluded(excluded.filter(e => e !== lowerSeller));
    else { setExcluded([...excluded, lowerSeller]); if (included.includes(lowerSeller)) setIncluded(included.filter(e => e !== lowerSeller)); }
  }, [lowerSeller, isExcluded, excluded, setExcluded, included, setIncluded]);

  // Category filtering from chips
  const [, setCategory] = useAtom(categoryAtom);
  const [, setSubs] = useAtom(selectedSubcategoriesAtom);
  const goCategory = useCallback((cat) => { if (!cat) return; setCategory(cat); setSubs([]); setRefNum(null); }, [setCategory, setSubs, setRefNum]);
  const clickSub = useCallback((sub) => { if (!sub) return; setCategory(category || baseItem?.category || 'All'); setSubs(curr => curr.includes(sub) ? curr.filter(s => s !== sub) : [...curr, sub]); setRefNum(null); }, [setCategory, setSubs, setRefNum, category, baseItem]);

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
  className="fixed inset-0 z-[100] bg-black/60 dark:bg-black/65 backdrop-blur-sm flex items-start md:items-center justify-center p-2 md:p-2 lg:p-4 overflow-y-auto"
        onMouseDown={(e) => { if (e.target === backdropRef.current) close(); }}
      >
        {/* Grid wrapper to place full-height nav zones outside the panel */}
  <div className="w-full md:w-full lg:w-auto grid grid-cols-1 md:grid-cols-[40px_minmax(0,1fr)_40px] lg:grid-cols-[80px_minmax(0,auto)_80px] md:gap-0.5 lg:gap-2 items-center justify-center">
          {/* Left nav zone (md+) */}
          <div className="hidden md:flex h-full items-center justify-end">
            <button
              onClick={gotoPrev}
              aria-label="Previous item"
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
              "relative w-full md:max-w-6xl 2xl:w-[calc(100vw-208px)] 2xl:max-w-[1500px] h-auto md:min-h-[70vh] md:max-h-[95vh] 2xl:h-[90vh] bg-white dark:bg-[#0f1725] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-visible md:overflow-hidden",
              isFav && favouriteAccent.cardRing
            )}
          >
          {/* Absolute close button (no header for more image space) */}
          <button
            onClick={close}
            aria-label="Close"
            className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100/90 dark:bg-gray-800/80 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 backdrop-blur focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500"
          >×</button>
          {/* (nav arrows moved outside the panel) */}
          {/* Content grid: 2 cols desktop, 3 cols on ultrawide */}
          <div className="flex-1 md:overflow-hidden grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-[460px_1fr_360px] gap-6 p-3 pt-3">
            {/* Column 1: gallery */}
            <div className="w-full flex-shrink-0 flex flex-col gap-3 md:overflow-y-auto custom-scroll pr-1 pb-35 md:pb-10 2xl:pb-0">
              {images.length > 0 ? (
                <>
                <div className={cn("relative group rounded-md overflow-hidden border bg-gray-100 dark:bg-gray-800",
                  isFav ? favouriteAccent.thumbBorder + ' ' + favouriteAccent.thumbShadow : 'border-gray-200 dark:border-gray-700'
                )}>
                  {/* Fav button on image for sub-ultrawide screens */}
                  <div className="absolute right-2 top-2 z-10 hidden md:block 2xl:hidden">
                    {baseItem && <FavButton itemId={baseItem.id} />}
                  </div>
                  <Swiper
                    modules={[Keyboard, EffectFade]}
                    effect="fade"
                    fadeEffect={{ crossFade: true }}
                    keyboard={{ enabled: true }}
                    spaceBetween={0}
                    slidesPerView={1}
                    onSwiper={setMainSwiper}
                    onSlideChange={(sw) => setActiveSlide(sw.activeIndex || 0)}
                    className="w-full aspect-square minimal-swiper"
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
                            src={proxyImage(src)}
                            alt={name}
                            loading={idx === 0 ? 'eager' : 'lazy'}
                            decoding="async"
                            draggable={false}
                            className="object-cover w-full h-full select-none cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.04]"
                          />
                        </button>
                      </SwiperSlide>
                    ))}
                  </Swiper>
                  {images.length > 1 && (
                    <div className="pointer-events-none absolute top-1 right-1 text-[11px] px-1.5 py-0.5 rounded-md bg-black/55 backdrop-blur-sm text-white/90 font-mono shadow-sm">
                      {activeSlide + 1}<span className="opacity-60">/</span>{images.length}
                    </div>
                  )}
                </div>
                {images.length > 1 && (
                  <div>
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
                            onClick={() => mainSwiper && mainSwiper.slideTo(idx)}
                            className={cn(
                              'relative w-14 h-14 rounded overflow-hidden border',
                              activeSlide === idx
                                ? 'ring-2 ring-blue-500 border-transparent'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            )}
                            aria-label={`Go to image ${idx + 1}`}
                            title={`Image ${idx + 1}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={proxyImage(src)} alt="thumb" className="w-full h-full object-cover" />
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
                          <span className="italic opacity-90">Seller:</span>
                          <SellerInfoBadge sellerName={resolvedSellerName} sellerUrl={resolvedSellerUrl || undefined} sellerOnline={resolvedSellerOnline} />
                          <SellerFilterButtons sellerName={resolvedSellerName} />
                        </>
                      )}
                      {shipsFrom && (
                        <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" />{countryLabelFromSource(String(shipsFrom))}</span>
                      )}
                      {lastUpdatedAt ? (
                        <span className="text-[10px] opacity-70">Updated {timeAgo(Date.parse(lastUpdatedAt))}{compactUpdateReason ? ` (${compactUpdateReason})` : ''}</span>
                      ) : createdAt ? (
                        <span className="text-[10px] opacity-70">Created {timeAgo(Date.parse(createdAt))}</span>
                      ) : null}
                    </div>
                    {(category || (subcategories && subcategories.length > 0)) && (
                      <div className="mt-1 text-[11px] italic text-gray-600 dark:text-gray-300 truncate">
                        <span className="opacity-80">Category:</span>
                        <span className="ml-1">{[category, ...(subcategories || [])].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                  </div>
                  {/* Actions moved to mobile FAB to save space */}
                  <div className="shrink-0 hidden" />
                </div>

                {/* Mobile tabs: Prices / Description / Reviews */}
                <MobileTabs
                  baseItem={baseItem}
                  rates={rates}
                  includeShipping={includeShipping}
                  setIncludeShipping={setIncludeShipping}
                  shippingOptions={shippingOptions}
                  allShippingFree={allShippingFree}
                  selectedShipIdx={selectedShipIdx}
                  setSelectedShipIdx={setSelectedShipIdx}
                  variantPriceRangeText={variantPriceRangeText}
                  perUnitSuffix={perUnitSuffix}
                  reviews={reviews}
                  loading={loading}
                  error={!!error}
                  reload={reload}
                  fullTimeAgo={fullTimeAgo}
                  onReviewImageClick={(images, index) => { setOpenPreviewSignal(null); setReviewGallery({ images, index, ts: Date.now(), guard: refNum }); }}
                  description={description}
                  convertToGBP={convertToGBP}
                  roundDisplayGBP={roundDisplayGBP}
                  ReviewsList={ReviewsList}
                  formatDescription={formatDescription}
                  biggyLink={biggyLink}
                  displayName={name}
                  leadImage={images?.[0] || baseItem?.imageUrl}
                />
                {/* Mobile actions toggle moved to bottom-left absolute (same bottom offset as Biggy), mobile only */}
              </div>
              </>
              ) : (
                <div className="relative rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 aspect-square flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full border-4 border-gray-300 dark:border-gray-600 border-t-transparent animate-spin" />
                </div>
              )}
              {/* Bullets removed in favor of thumbnails */}
              {/* Hidden trigger gallery component */}
              {images.length > 0 && (
                <ImageZoomPreview
                  key={refNum + '-seller'}
                  imageUrl={images[0]}
                  imageUrls={images}
                  alt={name}
                  openSignal={openPreviewSignal}
                  hideTrigger
                  onOpenChange={setZoomOpen}
                  guardKey={refNum}
                />
              )}
              {reviewGallery && reviewGallery.images && reviewGallery.images.length > 0 && (
                <ImageZoomPreview
                  key={refNum + '-review-' + reviewGallery.ts}
                  imageUrl={reviewGallery.images[reviewGallery.index]}
                  imageUrls={reviewGallery.images}
                  alt={name + ' review image'}
                  openSignal={reviewGallery}
                  hideTrigger
                  onOpenChange={(o) => { setZoomOpen(o); if (!o) setReviewGallery(null); }}
                  guardKey={refNum}
                />
              )}
              {/* Variant prices (per-unit) with large range */}
              {Array.isArray(baseItem?.variants) && baseItem.variants.length > 0 && (
                <div className="hidden md:block mt-1 border border-gray-200 dark:border-gray-700 rounded-md bg-white/80 dark:bg-gray-900/30 p-2">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Variant Prices</div>
                      {variantPriceRangeText && (
                        <div className="mt-0.5 text-lg md:text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{variantPriceRangeText}</div>
                      )}
                    </div>
                    {!allShippingFree && shippingOptions.length > 0 ? (
                      <div className="flex items-center gap-2">
        {includeShipping && selectedShipIdx != null && shippingOptions[selectedShipIdx] && (
                          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {(() => {
                              const usd = shippingOptions[selectedShipIdx].cost || 0;
          if (displayCurrency === 'USD') return `incl ${formatUSD(usd, 'USD', rates, { zeroIsFree: true })} ship`;
          const gbp = convertToGBP(usd, 'USD', rates) || 0;
          return `incl £${(typeof gbp === 'number' ? gbp.toFixed(2).replace(/\.00$/, '') : '')} ship`;
                            })()}
                          </span>
                        )}
                        <button
                          type="button"
                          className={cn(
                            "text-[10px] font-semibold px-2 h-6 rounded-full",
                            includeShipping ? "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-300/60" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300/60"
                          )}
                          onClick={() => setIncludeShipping(v => !v)}
                          title="Simulate basket"
                        >Simulate basket</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={cn(
                            "text-[10px] font-semibold px-2 h-6 rounded-full",
                            showSelection ? "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-300/60" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300/60"
                          )}
                          onClick={() => setSelectionMode(v => !v)}
                          title="Select variants to simulate basket"
                        >{showSelection ? 'Selection on' : 'Simulate basket'}</button>
                      </div>
                    )}
                  </div>
                  {showSelection && (
                    <div className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">Tap to select variants. Use Select all/Clear.</div>
                  )}
                  <VariantPriceList
                    variants={baseItem.variants}
                    rates={rates}
                    displayCurrency={displayCurrency}
                    includeShipping={includeShipping || selectionMode}
                    shippingUsd={selectedShippingUsd}
                    selectedVariantIds={selectedVariantIds}
                    onToggle={toggleVariantSelected}
                    perUnitSuffix={perUnitSuffix}
                    selectionEnabled={showSelection}
                    className="sm:grid-cols-1 max-h-44"
                    itemClassName="text-sm md:text-[15px]"
                  />
                  {/* Add selected button under shipping panel (desktop) */}
          {showSelection && (
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <span>{selectedVariantIds.size || 0} selected</span>
                      <button type="button" className="underline hover:no-underline" onClick={() => {
                        const all = new Set();
                        for (const v of (baseItem.variants || [])) all.add(v.id || (baseItem.variants ? baseItem.variants.indexOf(v) : undefined));
                        setSelectedVariantIds(all);
                      }}>Select all</button>
                      <button type="button" className="underline hover:no-underline" onClick={() => setSelectedVariantIds(new Set())}>Clear</button>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedTotalText && (
                        <span className="text-[11px] font-semibold font-mono text-gray-800 dark:text-gray-200">Total: {selectedTotalText}</span>
                      )}
                      <button
                        type="button"
                        disabled={selectedVariantIds.size === 0}
                        onClick={() => {
            // Compute shipping fallback only when includeShipping is enabled
            let shippingUsd = null;
            if (includeShipping) {
                          if (selectedShipIdx != null && shippingOptions[selectedShipIdx] && typeof shippingOptions[selectedShipIdx].cost === 'number') {
                            shippingUsd = shippingOptions[selectedShipIdx].cost;
                          } else if (shippingOptions && shippingOptions.length > 0) {
                            const freeOpt = shippingOptions.find(o => o && typeof o.cost === 'number' && o.cost === 0);
                            if (freeOpt) shippingUsd = 0;
                            else {
                              let min = null;
                              for (const o of shippingOptions) { if (o && typeof o.cost === 'number') min = (min == null ? o.cost : Math.min(min, o.cost)); }
                              if (min != null) shippingUsd = min;
                            }
                          }
            }
                        // Add each selected variant (shipping will be deduped per seller in totals)
                        const selIds = new Set(selectedVariantIds);
                        for (const v of (baseItem.variants || [])) {
                          const vid = v.id || baseItem.variants.indexOf(v);
                          if (!selIds.has(vid)) continue;
                          const descRaw = (v.description && typeof v.description === 'string') ? v.description : '';
                          const desc = descRaw ? decodeEntities(descRaw) : '';
                          addToBasket({
                            id: baseItem?.id,
                            refNum: baseItem?.refNum,
                            variantId: vid,
                            variantDesc: desc || 'Variant',
                            name,
                            sellerName: baseItem?.sellerName,
                            qty: 1,
                            priceUSD: typeof v.baseAmount === 'number' ? v.baseAmount : null,
              shippingUsd: includeShipping ? (shippingUsd ?? null) : null,
              includeShip: !!includeShipping,
                            imageUrl: images?.[0] || baseItem?.imageUrl,
                            biggyLink,
                          });
                        }
                        setSelectedVariantIds(new Set());
                        showToast('Added to basket');
                        }}
                        className={cn(
                          "text-xs font-semibold px-3 h-7 rounded-full",
                          selectedVariantIds.size === 0 ? "bg-gray-200 dark:bg-gray-700 text-gray-500" : "bg-blue-600 hover:bg-blue-500 text-white"
                        )}
                      >Add selected</button>
                      {(() => {
                        if (!baseItem) return null;
                        const ref = baseItem.refNum || String(baseItem.id);
                        const exists = basketItems.some(it => (it?.refNum && String(it.refNum) === String(ref)) || (it?.id && String(it.id) === String(baseItem.id)));
                        return exists ? (
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">In basket</span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  )}
                </div>
              )}
              {/* Shipping options (restored) */}
              {((detail?.shipping?.options && detail.shipping.options.length > 0) || loading) && (
                <div className="hidden md:block mt-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/40 p-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" /> Shipping Options</span>
                  </div>
                  <ul className="space-y-1 max-h-48 overflow-auto pr-1 custom-scroll">
                    {loading && !detail && (
                      Array.from({ length: 3 }).map((_,i) => (
                        <li key={i} className="h-6 rounded bg-white/50 dark:bg-gray-900/30 border border-dashed border-gray-300/60 dark:border-gray-700/60 animate-pulse" />
                      ))
                    )}
                    {!loading && detail?.shipping?.options && detail.shipping.options.map((opt, i) => {
                      const usd = typeof opt.cost === 'number' ? opt.cost : null;
                      const gbp = usd === 0 ? 0 : (usd != null ? convertToGBP(usd, 'USD', rates) : null);
                      const inputId = `shipOpt-${i}`;
                      const selectable = includeShipping && !allShippingFree && typeof usd === 'number';
                      const priceText = displayCurrency === 'USD'
                        ? (usd == null ? '' : formatUSD(usd, 'USD', rates, { zeroIsFree: true }))
                        : ((gbp == null) ? (usd == null ? '?' : '…') : (gbp === 0 ? 'free' : `£${gbp.toFixed(2)}`));
                      return (
                        <li key={i} className={cn(
                          "flex items-center justify-between gap-2 text-sm md:text-[15px] rounded px-2 py-1.5 border bg-white/70 dark:bg-gray-900/30",
                          "border-gray-200/70 dark:border-gray-700/70",
                          selectable ? "cursor-pointer" : "cursor-default opacity-100"
                        )}
                          onClick={() => { if (selectable) setSelectedShipIdx(i); }}
                        >
                          <label htmlFor={inputId} className="flex items-center gap-2 min-w-0 w-full cursor-pointer">
                            {selectable && (
                              <input
                                id={inputId}
                                type="radio"
                                name="shipOpt"
                                className="h-3.5 w-3.5 text-blue-600 border-gray-300 dark:border-gray-600 focus:ring-blue-500 cursor-pointer"
                                checked={selectedShipIdx === i}
                                onChange={() => setSelectedShipIdx(i)}
                              />
                            )}
                            <span className="truncate text-gray-700 dark:text-gray-300" title={opt.label ? decodeEntities(opt.label) : ''}>{opt.label ? decodeEntities(opt.label) : 'Option'}</span>
                          </label>
                          <span className="font-mono font-semibold text-gray-800 dark:text-gray-200 shrink-0">{priceText}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              
            </div>
            {/* Column 2: details & description + reviews (hidden for mobile; reviews hidden on 2xl) */}
              <div className="hidden md:block flex-1 min-w-0 md:overflow-y-auto custom-scroll pr-1 space-y-4 xl:pr-4 pb-32 md:pb-13 2xl:pb-32">
              {/* Sticky header on ultrawide: share, title, shipping info, category */}
              <div className="2xl:sticky 2xl:top-0 2xl:z-10 2xl:bg-white/85 2xl:dark:bg-[#0f1725]/85 2xl:backdrop-blur-md 2xl:border-b 2xl:border-gray-200/70 2xl:dark:border-gray-700/70 2xl:pt-2 2xl:pb-2">
              <div className="hidden md:flex pt-1 items-start justify-between gap-3 md:pr-10 2xl:pr-0">
                <div className="min-w-0">
                  <h2 className="font-semibold text-lg md:text-xl text-gray-900 dark:text-gray-100 leading-snug" title={name}>{name}</h2>
                  <div className="mt-1 flex items-center flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
                    {hasSellerInfo && (
                      <>
                        <span className="italic opacity-90">Seller:</span>
                        <SellerInfoBadge sellerName={resolvedSellerName} sellerUrl={resolvedSellerUrl || undefined} sellerOnline={resolvedSellerOnline} />
                        <SellerFilterButtons sellerName={resolvedSellerName} />
                      </>
                    )}
                    {shipsFrom && (
                      <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" />{countryLabelFromSource(String(shipsFrom))}</span>
                    )}
                    {lastUpdatedAt ? (
                      <span className="text-[11px] opacity-70 2xl:mt-[2px]">Updated {timeAgo(Date.parse(lastUpdatedAt))}{compactUpdateReason ? ` (${compactUpdateReason})` : ''}</span>
                    ) : createdAt ? (
                      <span className="text-[11px] opacity-70 2xl:mt-[2px]">Created {timeAgo(Date.parse(createdAt))}</span>
                    ) : null}
                  </div>
                </div>
                {/* Actions on ultrawide header only; on md/lg moved below shipping */}
                <DesktopHeaderActions
                  baseItem={baseItem}
                  isFav={isFav}
                  toggleFav={toggleFav}
                  shareOpen={shareOpen}
                  setShareOpen={setShareOpen}
                  shareBtnRef={shareBtnRef}
                  shareUrl={shareUrl}
                  favouriteAccent={favouriteAccent}
                />
              </div>
              {(category || subcategories.length > 0) && (
                <div className="mt-[0.2em] text-xs italic text-gray-600 dark:text-gray-300">
                  <span className="opacity-80">Category:</span>
                  <span className="ml-1">
                    {[category, ...(subcategories || [])].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
              {showUnavailableBanner && (
                <div className="mt-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-100/80 dark:bg-orange-950/40 border border-orange-300/70 dark:border-orange-700/60 rounded-md px-2 py-1.5 flex flex-wrap items-center gap-2 max-w-xl">
                  <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-orange-500 dark:bg-orange-400" />
                  <span className="font-semibold">Item unavailable</span>
                  <span className="opacity-80">This listing is no longer available on LittleBiggy. Displayed data is archival and may be incomplete.</span>
                </div>
              )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1" data-nosnippet>Description</h3>
                {loading && !detail && (
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  </div>
                )}
                {!loading && description && formatDescription(description)}
                {!loading && !description && <div className="text-xs italic text-gray-400">No description.</div>}
              </div>

              <div className="2xl:hidden">
                {(() => {
                  const stats = baseItem?.reviewStats;
                  const avgRating = typeof stats?.averageRating === 'number'
                    ? stats.averageRating
                    : (reviews.length
                        ? (reviews.map(r => typeof r.rating === 'number' ? r.rating : 0).reduce((a,b)=>a+b,0) /
                           (reviews.filter(r=> typeof r.rating === 'number').length || 1))
                        : null);
                  const reviewsTotal = typeof stats?.numberOfReviews === 'number' ? stats.numberOfReviews : (reviewMeta?.fetched || reviews.length);
                  const avgDays = typeof stats?.averageDaysToArrive === 'number' ? stats.averageDaysToArrive : null;
                  const displayLimit = REVIEWS_DISPLAY_LIMIT;
                  const leftTokens = [];
                  if (avgRating != null) leftTokens.push(`${avgRating.toFixed(1)} avg`);
                  if (reviewsTotal != null) {
                    if (reviewsTotal > displayLimit && reviews.length >= displayLimit) {
                      leftTokens.push(`${displayLimit} Recent (${reviewsTotal} total)`);
                    } else {
                      leftTokens.push(`${reviewsTotal} total`);
                    }
                  }
                  const rightText = (avgDays != null) ? `avg arrival ${Math.round(avgDays) === 1 ? '1 day' : Math.round(avgDays) + ' days'}` : null;
                  return (
                    <div className="mb-2">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200" data-nosnippet>Reviews</h3>
                      {(leftTokens.length > 0 || rightText) && (
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-baseline justify-between gap-3">
                          <span>{leftTokens.join(' • ')}</span>
                          {rightText && <span className="shrink-0">{rightText}</span>}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {loading && !detail && (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                  </div>
                )}
                {error && (
                  <div className="text-xs text-red-500">Failed to load. <button className="underline" onClick={reload}>Retry</button></div>
                )}
                {!loading && reviews.length === 0 && !error && (
                  <div className="text-xs text-gray-500">No reviews.</div>
                )}
                {!loading && reviews.length > 0 && (
                  <ReviewsList
                    reviews={reviews}
                    fullTimeAgo={fullTimeAgo}
                    onImageClick={(src, images, index) => { setOpenPreviewSignal(null); setReviewGallery({ images, index, ts: Date.now(), guard: refNum }); }}
                  />
                )}
                {!loading && reviews.length > 0 && (() => {
                  const stats = baseItem?.reviewStats;
                  const total = typeof stats?.numberOfReviews === 'number' ? stats.numberOfReviews : (reviewMeta?.fetched || reviews.length);
                  const isTruncated = total > reviews.length && reviews.length >= REVIEWS_DISPLAY_LIMIT;
                  if (!isTruncated || !biggyLink) return null;
                  return (
                    <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 text-right pr-2">
                      Read more reviews at:
                    </div>
                  );
                })()}
              </div>
            </div>
            {/* Column 3 (ultrawide): reviews */}
            <div className="hidden 2xl:block min-w-0 md:overflow-y-auto custom-scroll pr-1 pt-6 pb-13">
              {(() => {
                const stats = baseItem?.reviewStats;
                const avgRating = typeof stats?.averageRating === 'number' ? stats.averageRating : null;
                const reviewsTotal = typeof stats?.numberOfReviews === 'number' ? stats.numberOfReviews : reviews.length;
                const avgDays = typeof stats?.averageDaysToArrive === 'number' ? stats.averageDaysToArrive : null;
                const displayLimit = REVIEWS_DISPLAY_LIMIT;
                const leftTokens = [];
                if (avgRating != null) leftTokens.push(`${avgRating.toFixed(1)} avg`);
                if (reviewsTotal > displayLimit && reviews.length >= displayLimit) {
                  leftTokens.push(`${displayLimit} Recent (${reviewsTotal} total)`);
                } else {
                  leftTokens.push(`${reviewsTotal} total`);
                }
                const rightText = (avgDays != null) ? `avg arrival ${Math.round(avgDays) === 1 ? '1 day' : Math.round(avgDays) + ' days'}` : null;
                return (
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200" data-nosnippet>Reviews</h3>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-baseline justify-between gap-3">
                      <span>{leftTokens.join(' • ')}</span>
                      {rightText && <span className="shrink-0">{rightText}</span>}
                    </div>
                  </div>
                );
              })()}
              {loading && !detail ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                </div>
              ) : (
                <ReviewsList
                  reviews={reviews}
                  fullTimeAgo={fullTimeAgo}
                  onImageClick={(src, images, index) => { setOpenPreviewSignal(null); setReviewGallery({ images, index, ts: Date.now(), guard: refNum }); }}
                />
              )}
              {(!loading && reviews.length > 0) && (() => {
                const stats = baseItem?.reviewStats;
                const total = typeof stats?.numberOfReviews === 'number' ? stats.numberOfReviews : reviews.length;
                const isTruncated = total > reviews.length && reviews.length >= REVIEWS_DISPLAY_LIMIT;
                if (!isTruncated || !biggyLink) return null;
                return (
                  <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 text-right pr-3">
                    Read more reviews at:
                  </div>
                );
              })()}
            </div>
          </div>
          {/* Tablet/desktop actions dock (md to xl): bottom-left of overlay */}
          <TabletActionsDock
            baseItem={baseItem}
            isFav={isFav}
            toggleFav={toggleFav}
            shareOpen={shareOpen}
            setShareOpen={setShareOpen}
            shareBtnRef={shareBtnRef}
            shareUrl={shareUrl}
            favouriteAccent={favouriteAccent}
          />
          {/* Mobile FAB: bottom-left, same bottom offset as Biggy; inside panel (not fixed) */}
          <MobileActionsFab
            baseItem={baseItem}
            isFav={isFav}
            toggleFav={toggleFav}
            fabOpen={fabOpen}
            setFabOpen={setFabOpen}
            fabRef={fabRef}
            shareBtnRef={shareBtnRef}
            setShareOpen={setShareOpen}
            shareOpen={shareOpen}
            shareUrl={shareUrl}
            favouriteAccent={favouriteAccent}
          />
          {/* Floating biggy button (shipping info removed per design) */}
          {biggyLink && (
            <div className="pointer-events-none absolute right-3 bottom-25 md:right-3 md:bottom-3 md:bottom-3 xl:right-10">
              <a
                href={biggyLink}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto group/button inline-flex items-center gap-2 text-sm font-semibold tracking-wide bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-full px-5 py-2.5 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300"
              >
                <span>Littlebiggy</span>
                <span className="inline-block text-lg leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1">→</span>
              </a>
            </div>
          )}
          {/* Mobile Prev/Next rendered via portal so it's fixed to the viewport, not the transformed panel */}
          </motion.div>

          {/* Right nav zone (md+) */}
          <div className="hidden md:flex h-full items-center justify-start">
            <button
              onClick={gotoNext}
              aria-label="Next item"
              disabled={!hasNext}
              className={cn(
                "w-full h-full flex items-center justify-center group select-none",
                hasNext ? "cursor-pointer" : "cursor-not-allowed opacity-40"
              )}
            >
              <span className="rounded-full md:p-2 lg:p-3 backdrop-blur-sm bg-black/35 text-white border border-white/15 shadow-sm group-hover:bg-black/45 transition-colors">›</span>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
    {/* Mobile fixed bottom nav via portal (outside AnimatePresence to avoid transform/stack contexts) */}
  {typeof document !== 'undefined' && createPortal(
      (
        <div className="md:hidden fixed left-2 right-2 bottom-2 z-[1000]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur supports-[backdrop-filter]:bg-white/85 supports-[backdrop-filter]:dark:bg-gray-900/80 shadow-xl p-2">
            <div className="flex gap-2">
              <button
                onClick={gotoPrev}
                aria-label="Previous item"
                disabled={!hasPrev}
                className={cn(
                  "h-10 flex-1 text-base font-semibold rounded-full select-none",
                  !hasPrev ? "opacity-40 cursor-not-allowed" : "bg-gray-100 dark:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700"
                )}
              >
                ‹ Prev
              </button>
              <button
                onClick={gotoNext}
                aria-label="Next item"
                disabled={!hasNext}
                className={cn(
                  "h-10 flex-1 text-base font-semibold rounded-full select-none",
                  !hasNext ? "opacity-40 cursor-not-allowed" : "bg-gray-100 dark:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700"
                )}
              >
                Next ›
              </button>
            </div>
          </div>
        </div>
      ), document.body)
    }
    </>
  );
}
