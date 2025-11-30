"use client";
import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useUpdateReason } from '@/hooks/useUpdateReason';
import {
  includeShippingPrefAtom,
  favouritesAtom,
  toggleFavouriteAtom,
  addToBasketAtom,
  basketAtom,
  showToastAtom,
  isLoadingAtom,
} from '@/store/atoms';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { decodeEntities } from '@/lib/format';
import { relativeCompact } from '@/lib/relativeTimeCompact';
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
import { roundDisplayGBP } from '@/lib/pricing';
import { formatUSD } from '@/lib/priceDisplay';
import { usePerUnitLabel } from '@/hooks/usePerUnitLabel';
import { useDisplayCurrency } from '@/providers/IntlProvider';
import formatDescription from '@/lib/formatDescription';
import { countryLabelFromSource, normalizeShipFromCode } from '@/lib/countries';
import { proxyImage } from '@/lib/images';
import cn from '@/lib/cn';
import MobileTabs from '@/components/item/item-detail/MobileTabs';
import MobileActionsFab from '@/components/item/item-detail/MobileActionsFab';
import DesktopHeaderActions from '@/components/item/item-detail/DesktopHeaderActions';
import TabletActionsDock from '@/components/item/item-detail/TabletActionsDock';
import VariantPriceList from '@/components/item/VariantPriceList';
import { variantRangeText } from '@/lib/variantPricingDisplay';
import { useTranslations, useFormatter } from 'next-intl';
import { translateCategoryAndSubs } from '@/lib/taxonomyLabels';
import FavButton from '@/components/actions/FavButton';
import BrowseIndexButton from '@/components/actions/BrowseIndexButton';

interface StandaloneItemDetailProps {
  baseItem: any;
  detail: any;
}

export default function StandaloneItemDetail({ baseItem, detail }: StandaloneItemDetailProps) {
  const tItem = useTranslations('Item');
  const tOv = useTranslations('Overlay');
  const tCats = useTranslations('Categories');
  const tCountries = useTranslations('Countries');
  const tRel = useTranslations('Rel');
  
  // We don't use refNum atom here, but we need a ref for keys
  const refNum = baseItem?.refNum || String(baseItem?.id);

  const [openPreviewSignal, setOpenPreviewSignal] = useState<any>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  
  // Images logic
  const images = useMemo(() => {
    const dImgs = Array.isArray(detail?.imageUrls) ? detail.imageUrls : [];
    const bImgs = Array.isArray((baseItem as any)?.is) ? (baseItem as any).is : [];
    const primary = (baseItem as any)?.i || (detail as any)?.imageUrl;
    let list = dImgs.length ? dImgs : bImgs;
    if ((!list || list.length === 0) && primary) list = [primary];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const src of list as string[]) {
      if (typeof src === 'string' && src && !seen.has(src)) { 
        seen.add(src); 
        out.push(proxyImage(src)); 
      }
    }
    return out;
  }, [detail, baseItem]);

  const [activeSlide, setActiveSlide] = useState(0);
  const [mainSwiper, setMainSwiper] = useState<any>(null);
  const rates = useExchangeRates();
  const { currency: ctxCurrency } = useDisplayCurrency();
  const displayCurrency = ctxCurrency || 'GBP';
  const { perUnitSuffix } = usePerUnitLabel();
  
  // Shipping options
  const shippingOptions = useMemo(() => {
    const opts = Array.isArray(detail?.shipping?.options) ? (detail as any).shipping.options : [];
    return opts.filter((o: any) => typeof o.cost === 'number');
  }, [detail]);
  const allShippingFree = shippingOptions.length > 0 && shippingOptions.every((o: any) => o.cost === 0);
  const [includeShipping, setIncludeShipping] = useAtom(includeShippingPrefAtom);
  const [selectedShipIdx, setSelectedShipIdx] = useState<number | null>(null);
  
  // Variants
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<any>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const toggleVariantSelected = useCallback((vid: any) => {
    setSelectedVariantIds((prev) => {
      const next = new Set(prev);
      if (next.has(vid)) next.delete(vid); else next.add(vid);
      return next;
    });
  }, []);

  // Favourites
  const toggleFav = useSetAtom(toggleFavouriteAtom);
  const isFavAtom = useMemo(() => selectAtom(favouritesAtom as any, (favs: any[]) => Array.isArray(favs) && baseItem && favs.includes((baseItem as any).id)), [baseItem]);
  const isFav = useAtomValue(isFavAtom as any) as boolean;
  
  const addToBasket = useSetAtom(addToBasketAtom);
  const showToast = useSetAtom(showToastAtom);
  const basketItems = useAtomValue(basketAtom) || [];

  const resolvedSellerName = useMemo(() => {
    if (typeof (detail as any)?.sellerName === 'string' && (detail as any).sellerName) return decodeEntities((detail as any).sellerName);
    if ((detail as any)?.seller && typeof (detail as any).seller.name === 'string' && (detail as any).seller.name) return decodeEntities((detail as any).seller.name);
    if (typeof (baseItem as any)?.sn === 'string' && (baseItem as any).sn) return decodeEntities((baseItem as any).sn);
    return '';
  }, [detail, baseItem]);

  const resolvedSellerUrl = useMemo(() => {
    if (typeof (detail as any)?.sellerUrl === 'string' && (detail as any).sellerUrl) return (detail as any).sellerUrl;
    if ((detail as any)?.seller && typeof (detail as any).seller.url === 'string' && (detail as any).seller.url) return (detail as any).seller.url;
    if (typeof (baseItem as any)?.sellerUrl === 'string' && (baseItem as any).sellerUrl) return (baseItem as any).sellerUrl;
    if (typeof (baseItem as any)?.url === 'string' && (baseItem as any).url) return (baseItem as any).url;
    return null;
  }, [detail, baseItem]);

  const resolvedSellerOnline = (baseItem as any)?.sellerOnline || (detail as any)?.sellerOnline || null;
  const hasSellerInfo = resolvedSellerName.trim().length > 0;

  // Reset selection state when opening a different item (not really applicable here but good practice)
  useEffect(() => {
    setSelectedVariantIds(new Set());
    setSelectionMode(false);
  }, [refNum]);

  // Shipping selection logic
  useEffect(() => {
    if (!detail) return;
    if (!includeShipping) { setSelectedShipIdx(null); return; }
    if (shippingOptions.length === 0) { setSelectedShipIdx(null); return; }
    if (selectedShipIdx == null || !shippingOptions[selectedShipIdx]) {
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

  const name = decodeEntities((baseItem as any)?.n || (detail as any)?.name || 'Item');
  const description = (detail as any)?.descriptionFull || (detail as any)?.description || (baseItem as any)?.d || '';
  const reviews = (detail as any)?.reviews || [];
  const baseVariants = (baseItem as any)?.v || [];
  const hasVariants = Array.isArray((detail as any)?.variants) ? (detail as any).variants.length > 0 : Array.isArray(baseVariants) && baseVariants.length > 0;
  const showUnavailableBanner = Boolean(
    detail && 
    Array.isArray((detail as any).variants) && (detail as any).variants.length === 0 &&
    (!Array.isArray((detail as any).imageUrls) || (detail as any).imageUrls.length === 0) &&
    !(detail as any).imageUrl
  );
  const [reviewGallery, setReviewGallery] = useState<any>(null);
  const reviewMeta = (detail as any)?.reviewsMeta;
  const category = (baseItem as any)?.c || null;
  const subcategories = Array.isArray((baseItem as any)?.sc) ? (baseItem as any).sc : [];
  const shipsFrom = (baseItem as any)?.sf || null;
  const lastUpdatedAt = (baseItem as any)?.lua || null;
  const lastUpdateReason = (baseItem as any)?.lur || null;
  const compactUpdateReason = useUpdateReason(lastUpdateReason);
  const createdAt = (baseItem as any)?.fsa || (detail as any)?.createdAt || null;
  const sl = (detail as any)?.sl || (detail as any)?.share?.shortLink || (baseItem as any)?.share || (baseItem as any)?.url || (detail as any)?.url || (refNum ? `https://littlebiggy.net/item/${refNum}/view/p` : null);
  
  const shareRef = refNum as any;
  const shareUrl = typeof window !== 'undefined'
    ? (new URL(`/item/${encodeURIComponent(shareRef)}`, window.location.origin)).toString()
    : '';
  const [shareOpen, setShareOpen] = useState(false);
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement | null>(null);

  // Close FAB/Share logic
  useEffect(() => {
    function onDocDown(e: any){ 
      if(!shareOpen) return; 
      const t = e.target; 
      const inBtn = shareBtnRef.current && (shareBtnRef.current as any).contains(t);
      const inMenu = (t as any).closest('[role="menu"]');
      if(!inBtn && !inMenu) setShareOpen(false); 
    }
    document.addEventListener('mousedown', onDocDown as any);
    return () => document.removeEventListener('mousedown', onDocDown as any);
  }, [shareOpen]);

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

  const selectedShippingUsd = useMemo(() => {
    if (!includeShipping && !selectionMode) return null;
    const opt = (selectedShipIdx != null) ? shippingOptions[selectedShipIdx] : null;
    const c = opt && typeof (opt as any).cost === 'number' ? (opt as any).cost : null;
    return c == null ? null : c;
  }, [includeShipping, selectionMode, selectedShipIdx, shippingOptions]);

  const showSelection = includeShipping || selectionMode;

  const variantPriceRangeText = useMemo(() => {
    if (!Array.isArray(baseVariants) || baseVariants.length === 0) return '';
    return variantRangeText({
      variants: baseVariants,
      displayCurrency,
      rates,
      shippingUsd: selectedShippingUsd as any,
      includeShipping: includeShipping || selectionMode,
      selectedVariantIds,
    });
  }, [baseVariants, displayCurrency, rates, selectedShippingUsd, includeShipping, selectionMode, selectedVariantIds]);

  const selectedTotalText = useMemo(() => {
    if (!Array.isArray(baseVariants) || selectedVariantIds.size === 0) return '';
    const sel = selectedVariantIds;
    let totalUSD = 0;
    for (let i = 0; i < baseVariants.length; i++) {
      const v = baseVariants[i];
      const vid = v.id || i;
      if (!sel.has(vid)) continue;
      const baseUsd = (typeof v.baseAmount === 'number' && isFinite(v.baseAmount)) ? v.baseAmount : null;
      if (baseUsd == null) continue;
      const amtUSD = (function(){
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
  }, [baseItem, selectedVariantIds, displayCurrency, rates, selectedShippingUsd, includeShipping, selectionMode]);

  const shortTimeAgo = useCallback((ts?: number | null) => {
    if (ts == null) return '';
    return relativeCompact(ts, tRel as any);
  }, [tRel]);
  const fullTimeAgo = useCallback((ts?: number | null) => {
    if (ts == null) return '';
    return relativeCompact(ts, tRel as any);
  }, [tRel]);

  if (!baseItem) return null;

  return (
    <div className="h-[100dvh] bg-white dark:bg-slate-950 flex flex-col overflow-hidden">
      {/* Header / Nav */}
      <div className="shrink-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 py-3">
        <div className="w-full max-w-[1800px] mx-auto px-4 md:px-6 lg:px-8">
          <BrowseIndexButton label={tOv('browseIndex') || 'Browse Index'} />
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full max-w-[1800px] mx-auto p-4 md:p-6 lg:p-8 overflow-hidden relative">
        <div className="h-full grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-[460px_1fr_400px] gap-8">
          {/* Column 1: Gallery */}
          <div className="min-w-0 min-h-0 flex flex-col gap-4 overflow-y-auto pr-2 custom-scroll">
             {images.length > 0 ? (
                <>
                <div
                  className={cn(
                    "image-border shrink-0",
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
                    className="w-full aspect-square minimal-swiper"
                  >
                    {images.map((src, idx) => (
                      <SwiperSlide key={idx + src} className="!h-full">
                        <button
                          type="button"
                          onClick={() => { setReviewGallery(null); setOpenPreviewSignal({ ts: Date.now(), index: idx, guard: refNum }); }}
                          className="w-full h-full focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500"
                        >
                          <img
                            src={proxyImage(src)}
                            alt={name}
                            loading={idx === 0 ? 'eager' : 'lazy'}
                            decoding="async"
                            draggable={false}
                            className="object-cover w-full h-full select-none cursor-zoom-in transition-transform duration-900 ease-out group-hover:scale-[1.04]"
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
                </div>
                {images.length > 1 && (
                  <div className="shrink-0">
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
                          >
                            <img src={proxyImage(src, 112)} alt="thumb" className="w-full h-full object-cover" />
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
                        if (code) { try { label = tCountries(code); } catch {} }
                        return (
                          <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" />{label || countryLabelFromSource(String(shipsFrom))}</span>
                        );
                      })()}
                    </div>
                  </div>
                </div>

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
                  loading={false}
                  error={false}
                  reload={() => {}}
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
              </div>
              </>
              ) : null}

              {/* Image Zoom */}
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

              {/* Variant prices (Desktop) */}
              {Array.isArray(baseVariants) && baseVariants.length > 0 && (
                <div className="hidden md:block mt-1 border border-gray-200 dark:border-gray-700 rounded-md bg-white/80 dark:bg-gray-900/30 p-4 shrink-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{tOv('variantPrices')}</div>
                      {variantPriceRangeText && (
                        <div className="mt-0.5 text-xl md:text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{variantPriceRangeText}</div>
                      )}
                    </div>
                    {!allShippingFree && shippingOptions.length > 0 ? (
                      <div className="flex items-center gap-2">
                        {includeShipping && selectedShipIdx != null && shippingOptions[selectedShipIdx] && (
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {(() => {
                              const usd = (shippingOptions as any)[selectedShipIdx].cost || 0;
                              const amountText = formatUSD(usd, displayCurrency as any, rates as any, { zeroIsFree: true, freeLabel: tItem('shippingFree'), decimals: 2, ceilNonUSD: false } as any);
                              return tOv('inclShip', { amount: amountText });
                            })()}
                          </span>
                        )}
                        <button
                          type="button"
                          className={cn(
                            "text-xs font-semibold px-3 h-7 rounded-full",
                            includeShipping ? "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-300/60" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300/60"
                          )}
                          onClick={() => setIncludeShipping(v => !v)}
                          title={tOv('simulateBasket')}
                        >{tOv('simulateBasket')}</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={cn(
                            "text-xs font-semibold px-3 h-7 rounded-full",
                            showSelection ? "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-300/60" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300/60"
                          )}
                          onClick={() => setSelectionMode(v => !v)}
                          title={tOv('simulateBasket')}
                        >{showSelection ? tOv('selectionOn') : tOv('simulateBasket')}</button>
                      </div>
                    )}
                  </div>
                  {showSelection && (
                    <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">{tOv('selectVariantsHint')}</div>
                  )}
                  <VariantPriceList
                    variants={baseVariants}
                    rates={rates}
                    displayCurrency={displayCurrency}
                    includeShipping={includeShipping || selectionMode}
                    shippingUsd={selectedShippingUsd}
                    selectedVariantIds={selectedVariantIds}
                    onToggle={toggleVariantSelected as any}
                    perUnitSuffix={perUnitSuffix as any}
                    selectionEnabled={showSelection}
                    className="sm:grid-cols-1 max-h-64"
                    itemClassName="text-sm"
                  />
                  {showSelection && (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <span>{selectedVariantIds.size || 0} {tOv('selectedLabel')}</span>
                      <button type="button" className="underline hover:no-underline" onClick={() => {
                        const all = new Set<any>();
                        for (const v of baseVariants) all.add(v.vid ?? v.id ?? baseVariants.indexOf(v));
                        setSelectedVariantIds(all);
                      }}>{tOv('selectAll')}</button>
                      <button type="button" className="underline hover:no-underline" onClick={() => setSelectedVariantIds(new Set())}>{tOv('clear')}</button>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedTotalText && (
                        <span className="text-xs font-semibold font-mono text-gray-800 dark:text-gray-200">{tOv('total')} {selectedTotalText}</span>
                      )}
                      <button
                        type="button"
                        disabled={selectedVariantIds.size === 0}
                        onClick={() => {
                          let shippingUsd: number | null = null;
                          if (includeShipping) {
                            if (selectedShipIdx != null && (shippingOptions as any)[selectedShipIdx] && typeof (shippingOptions as any)[selectedShipIdx].cost === 'number') {
                              shippingUsd = (shippingOptions as any)[selectedShipIdx].cost;
                            } else if (shippingOptions && (shippingOptions as any).length > 0) {
                              const freeOpt = (shippingOptions as any).find((o: any) => o && typeof o.cost === 'number' && o.cost === 0);
                              if (freeOpt) shippingUsd = 0;
                              else {
                                let min: number | null = null;
                                for (const o of (shippingOptions as any)) { if (o && typeof o.cost === 'number') min = (min == null ? o.cost : Math.min(min, o.cost)); }
                                if (min != null) shippingUsd = min;
                              }
                            }
                          }
                          const selIds = new Set(selectedVariantIds);
                          for (const v of baseVariants) {
                            const vid = v.vid ?? v.id ?? baseVariants.indexOf(v);
                            if (!selIds.has(vid)) continue;
                            const descRaw = (v.d || '') as string;
                            const desc = descRaw ? decodeEntities(descRaw) : '';
                            addToBasket({
                              id: (baseItem as any)?.id,
                              refNum: (baseItem as any)?.refNum,
                              variantId: vid,
                              variantDesc: desc || 'Variant',
                              name,
                              sellerName: (baseItem as any)?.sn,
                              qty: 1,
                              priceUSD: typeof v.usd === 'number' ? v.usd : (typeof v.baseAmount === 'number' ? v.baseAmount : null),
                              shippingUsd: includeShipping ? ((shippingUsd ?? null) as any) : null,
                              includeShip: !!includeShipping,
                              imageUrl: images?.[0] || (baseItem as any)?.i,
                              sl,
                            });
                          }
                          setSelectedVariantIds(new Set());
                          showToast(tOv('addedToBasket'));
                        }}
                        className={cn(
                          "text-sm font-semibold px-4 h-8 rounded-full",
                          selectedVariantIds.size === 0 ? "bg-gray-200 dark:bg-gray-700 text-gray-500" : "bg-blue-600 hover:bg-blue-500 text-white"
                        )}
                      >{tOv('addSelected')}</button>
                    </div>
                  </div>
                  )}
                </div>
              )}

              {/* Shipping options (Desktop) */}
              {(((detail as any)?.shipping?.options && (detail as any).shipping.options.length > 0)) && (
                <div className="hidden md:block mt-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/40 p-3 shrink-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" /> {tOv('shippingOptions')}</span>
                  </div>
                  <ul className="space-y-1 max-h-48 overflow-auto pr-1 custom-scroll">
                    {(detail as any)?.shipping?.options && (detail as any).shipping.options.map((opt: any, i: number) => {
                      const usd = typeof opt.cost === 'number' ? opt.cost : null;
                      const inputId = `shipOpt-${i}`;
                      const selectable = includeShipping && !allShippingFree && typeof usd === 'number';
                      const priceText = (usd == null)
                        ? ''
                        : formatUSD(usd, displayCurrency as any, rates as any, { zeroIsFree: true, freeLabel: tItem('shippingFree'), decimals: 2, ceilNonUSD: false } as any);
                      return (
                        <li key={i} className={cn(
                          "flex items-center justify-between gap-2 text-sm rounded px-2 py-1.5 border bg-white/70 dark:bg-gray-900/30",
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
                            <span className="truncate text-gray-700 dark:text-gray-300" title={opt.label ? decodeEntities(opt.label) : ''}>{opt.label ? decodeEntities(opt.label) : tOv('option')}</span>
                          </label>
                          <span className="font-mono font-semibold text-gray-800 dark:text-gray-200 shrink-0">{priceText}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="pb-8" />
          </div>

          {/* Column 2: Details & Reviews (Desktop) */}
          <div className="hidden md:block min-w-0 min-h-0 relative overflow-y-auto pr-2 custom-scroll">
             <div className="space-y-6">
             {/* Header */}
             <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                <h2 className="font-semibold text-2xl text-gray-900 dark:text-gray-100 leading-snug" title={name}>{name}</h2>
                <div className="mt-2 flex items-center flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-300">
                  {hasSellerInfo && (
                    <>
                      <span className="italic opacity-90">{tItem('seller')}</span>
                      <SellerPill sellerName={resolvedSellerName} sellerUrl={resolvedSellerUrl || undefined} sellerOnline={resolvedSellerOnline as any} />
                    </>
                  )}
                  {shipsFrom && (() => {
                    const code = normalizeShipFromCode(String(shipsFrom));
                    let label: string | null = null;
                    if (code) { try { label = tCountries(code); } catch {} }
                    return (
                      <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" />{label || countryLabelFromSource(String(shipsFrom))}</span>
                    );
                  })()}
                  {lastUpdatedAt ? (
                    <span className="text-xs opacity-70">{tItem('updated', { time: relativeCompact(lastUpdatedAt as any, tRel as any) })}{compactUpdateReason ? ` (${compactUpdateReason})` : ''}</span>
                  ) : createdAt ? (
                    <span className="text-xs opacity-70">{tItem('created', { time: shortTimeAgo(createdAt) })}</span>
                  ) : null}
                </div>
                {(category || subcategories.length > 0) && (
                  <div className="mt-2 text-sm italic text-gray-600 dark:text-gray-300">
                    <span className="opacity-80">{tOv('categoryLabel')}</span>
                    <span className="ml-1">{translateCategoryAndSubs({ tCats, category, subcategories }).join(', ')}</span>
                  </div>
                )}
                {showUnavailableBanner && (
                  <div className="mt-3 text-sm text-orange-600 dark:text-orange-400 bg-orange-100/80 dark:bg-orange-950/40 border border-orange-300/70 dark:border-orange-700/60 rounded-md px-3 py-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-orange-500 dark:bg-orange-400" />
                    <span className="font-semibold">{tOv('itemUnavailableTitle')}</span>
                    <span className="opacity-80">{tOv('itemUnavailableDesc')}</span>
                  </div>
                )}
             </div>

             {/* Description */}
             <div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2" data-nosnippet>{tOv('description')}</h3>
                {description ? formatDescription(description) : <div className="text-sm italic text-gray-400">{tOv('noDescription')}</div>}
             </div>

             {/* Reviews (Desktop) */}
             <div className="2xl:hidden">
                {(() => {
                  const stats = (baseItem as any)?.rs ?? (baseItem as any)?.reviewStats;
                  const avgRating = typeof (stats?.avg ?? stats?.averageRating) === 'number'
                    ? (stats?.avg ?? stats?.averageRating)
                    : (reviews.length
                        ? (reviews.map((r: any) => typeof r.rating === 'number' ? r.rating : 0).reduce((a: number,b: number)=>a+b,0) /
                           ((reviews as any[]).filter((r: any)=> typeof r.rating === 'number').length || 1))
                        : null);
                  const reviewsTotal = typeof (stats?.cnt ?? stats?.numberOfReviews) === 'number' ? (stats?.cnt ?? stats?.numberOfReviews) : (reviewMeta?.fetched || reviews.length);
                  const avgDays = typeof (stats?.days ?? stats?.averageDaysToArrive) === 'number' ? (stats?.days ?? stats?.averageDaysToArrive) : (reviews.length > 0 ? (reviews.map((r: any) => typeof r.daysToArrive === 'number' ? r.daysToArrive : 0).reduce((a: number,b: number)=>a+b,0) / reviews.filter((r: any)=> typeof r.daysToArrive === 'number').length) : null);
                  const displayLimit = REVIEWS_DISPLAY_LIMIT;
                  const leftTokens: string[] = [];
                  if (avgRating != null) leftTokens.push(`${avgRating.toFixed(1)} ${tOv('avgShort')}`);
                  if (reviewsTotal != null) {
                    if (reviewsTotal > displayLimit && reviews.length >= displayLimit) {
                      leftTokens.push(`${displayLimit} ${tOv('recentShort')} (${reviewsTotal} ${tOv('totalShort')})`);
                    } else {
                      leftTokens.push(`${reviewsTotal} ${tOv('totalShort')}`);
                    }
                  }
                  const rightText = (avgDays != null) ? tOv('avgArrival', { days: Math.round(avgDays) }) : null;
                  return (
                    <div className="mb-2">
                      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200" data-nosnippet>{tOv('reviews')}</h3>
                      {(leftTokens.length > 0 || rightText) && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-baseline justify-between gap-3">
                          <span>{leftTokens.join(' • ')}</span>
                          {rightText && <span className="shrink-0">{rightText}</span>}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {reviews.length === 0 ? (
                  <div className="text-sm text-gray-500">{tOv('noReviews')}</div>
                ) : (
                  <ReviewsList
                    reviews={reviews}
                    fullTimeAgo={fullTimeAgo as any}
                    onImageClick={(src: string, images: string[], index: number) => { setOpenPreviewSignal(null); setReviewGallery({ images, index, ts: Date.now(), guard: refNum }); }}
                  />
                )}
             {reviews.length > 0 && (() => {
                const stats = (baseItem as any)?.rs ?? (baseItem as any)?.reviewStats;
                const total = typeof (stats?.cnt ?? stats?.numberOfReviews) === 'number' ? (stats?.cnt ?? stats?.numberOfReviews) : (reviewMeta?.fetched || reviews.length);
                const isTruncated = total > reviews.length && reviews.length >= REVIEWS_DISPLAY_LIMIT;
                if (!isTruncated || !sl) return null;
                return (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-right pr-2">
                    {tOv('readMoreReviewsAt')}
                  </div>
                );
              })()}
             </div>
             </div>
             <div className="pb-10" />
             {/* Little Biggy Button - Desktop (md-xl) */}
             {sl && (
               <div className="pointer-events-none 2xl:hidden absolute right-3 bottom-3 md:right-3 md:bottom-3 xl:right-10">
                 <a
                   href={sl}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="pointer-events-auto group/button inline-flex items-center gap-2 text-sm font-semibold tracking-wide bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-full px-5 py-2.5 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300"
                 >
                   <span>See item on Little Biggy</span>
                   <span className="inline-block text-lg leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1">→</span>
                 </a>
               </div>
             )}
          </div>          {/* Column 3: Reviews (Ultrawide) */}
          <div className="hidden 2xl:block min-w-0 min-h-0 overflow-y-auto pr-2 custom-scroll">
             {(() => {
                const stats = (baseItem as any)?.rs ?? (baseItem as any)?.reviewStats;
                const avgRating = typeof (stats?.avg ?? stats?.averageRating) === 'number' ? (stats?.avg ?? stats?.averageRating) : (reviews.length ? (reviews.map((r: any) => typeof r.rating === 'number' ? r.rating : 0).reduce((a: number,b: number)=>a+b,0) / reviews.filter((r: any)=> typeof r.rating === 'number').length) : null);
                const reviewsTotal = typeof (stats?.cnt ?? stats?.numberOfReviews) === 'number' ? (stats?.cnt ?? stats?.numberOfReviews) : reviews.length;
                const avgDays = typeof (stats?.days ?? stats?.averageDaysToArrive) === 'number' ? (stats?.days ?? stats?.averageDaysToArrive) : (reviews.length > 0 ? (reviews.map((r: any) => typeof r.daysToArrive === 'number' ? r.daysToArrive : 0).reduce((a: number,b: number)=>a+b,0) / reviews.filter((r: any)=> typeof r.daysToArrive === 'number').length) : null);
                const displayLimit = REVIEWS_DISPLAY_LIMIT;
                const leftTokens: string[] = [];
                if (avgRating != null) leftTokens.push(`${avgRating.toFixed(1)} ${tOv('avgShort')}`);
                if (reviewsTotal > displayLimit && reviews.length >= displayLimit) {
                  leftTokens.push(`${displayLimit} ${tOv('recentShort')} (${reviewsTotal} ${tOv('totalShort')})`);
                } else {
                  leftTokens.push(`${reviewsTotal} ${tOv('totalShort')}`);
                }
                const rightText = (avgDays != null) ? tOv('avgArrival', { days: Math.round(avgDays) }) : null;
                return (
                  <div className="mb-2">
                    <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200" data-nosnippet>{tOv('reviews')}</h3>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-baseline justify-between gap-3">
                      <span>{leftTokens.join(' • ')}</span>
                      {rightText && <span className="shrink-0">{rightText}</span>}
                    </div>
                  </div>
                );
              })()}
             {reviews.length === 0 ? (
                <div className="text-sm text-gray-500">{tOv('noReviews')}</div>
              ) : (
                <ReviewsList
                  reviews={reviews}
                  fullTimeAgo={fullTimeAgo as any}
                  onImageClick={(src: string, images: string[], index: number) => { setOpenPreviewSignal(null); setReviewGallery({ images, index, ts: Date.now(), guard: refNum }); }}
                />
              )}
              {reviews.length > 0 && (() => {
                const stats = (baseItem as any)?.rs ?? (baseItem as any)?.reviewStats;
                const total = typeof (stats?.cnt ?? stats?.numberOfReviews) === 'number' ? (stats?.cnt ?? stats?.numberOfReviews) : reviews.length;
                const isTruncated = total > reviews.length && reviews.length >= REVIEWS_DISPLAY_LIMIT;
                if (!isTruncated || !sl) return null;
                return (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-right pr-3">
                    {tOv('readMoreReviewsAt')}
                  </div>
                );
              })()}
             <div className="pb-10" />
             {/* Little Biggy Button - Ultrawide (2xl+) */}
             {sl && (
               <div className="pointer-events-none absolute right-3 bottom-3 md:right-3 md:bottom-3 xl:right-10">
                 <a
                   href={sl}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="pointer-events-auto group/button inline-flex items-center gap-2 text-sm font-semibold tracking-wide bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-full px-5 py-2.5 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300"
                 >
                   <span>See item on Little Biggy</span>
                   <span className="inline-block text-lg leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1">→</span>
                 </a>
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Floating Biggy Button (Mobile Only) */}
      {sl && (
        <div className="md:hidden fixed right-6 bottom-6 z-40">
          <a
            href={sl}
            target="_blank"
            rel="noopener noreferrer"
            className="group/button inline-flex items-center gap-2 text-sm font-semibold tracking-wide bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-full px-5 py-2.5 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300"
          >
            <span>See item on Little Biggy</span>
            <span className="inline-block text-lg leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1">→</span>
          </a>
        </div>
      )}

      {/* Mobile FAB */}
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
  );
}
