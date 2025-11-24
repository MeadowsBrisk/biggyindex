import { AnimatePresence, motion } from 'framer-motion';
import cn from "@/app/cn";
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSetAtom, useAtomValue } from "jotai";
import { categoryAtom, selectedSubcategoriesAtom, thumbnailAspectAtom, expandedRefNumAtom, favouritesAtom, favouritesOnlyAtom } from "@/store/atoms";
import SellerPill from "./SellerPill";
import { usePerUnitLabel } from "@/hooks/usePerUnitLabel";
import ImageZoomPreview from "@/components/ImageZoomPreview";
import { selectAtom } from "jotai/utils";
import ReviewStatsBadge from "@/components/ReviewStatsBadge";
import { voteHasVotedAtom, endorsedSetAtom } from "@/store/votesAtoms";
import EndorseButton from "@/components/EndorseButton";
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { formatUSDRange, formatUSD, convertUSDToDisplay, currencySymbol } from '@/lib/priceDisplay';
import { useDisplayCurrency, useLocale } from '@/providers/IntlProvider';
// @ts-ignore - SVG module type handled by build tooling
import VanIcon from '@/app/assets/svg/van.svg';
import { useTranslations } from 'next-intl';
import { decodeEntities, formatBritishDateTime } from '@/lib/format';
import { relativeCompact } from '@/lib/relativeTimeCompact';
import { countryLabelFromSource, normalizeShipFromCode } from '@/lib/countries';
import { proxyImage } from '@/lib/images';
import { isDomesticShipping } from '@/lib/localeUtils';
import { GifMedia } from '@/components/GifMedia';
import { prefetchItemDetail } from '@/lib/itemDetailsCache';
import { useDetailAvailability } from '@/hooks/useItemDetail';
import FavButton from '@/components/FavButton';
import VariantPillsScroll from '@/components/VariantPillsScroll';

// Types
export interface ItemVariant {
  id?: string | number;
  description: string;
  baseAmount?: number | null;
}

export interface ItemShippingSummary { min?: number | null; max?: number | null; free?: number | boolean | null; }

export interface ItemCardItem {
  id: string | number;
  refNum?: string | number | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  name: string;
  description?: string | null;
  sellerName?: string | null;
  sellerUrl?: string | null;
  url?: string | null;
  reviewStats?: unknown;
  variants?: ItemVariant[];
  sellerOnline?: boolean | null;
  shipsFrom?: string | null;
  category?: string | null;
  firstSeenAt?: string | Date | null;
  lastUpdatedAt?: string | Date | null;
  share?: string | null;
  sh?: ItemShippingSummary | null;
  lastUpdateReason?: string | null;
}

export interface ItemCardProps {
  item: ItemCardItem;
  initialAppear?: boolean;
  staggerDelay?: number;
  colIndex?: number;
  cols?: number;
}

// Add cutoff date (items created after this show a Created label if no update exists)
const CREATION_LABEL_CUTOFF = new Date('2025-09-02T12:00:59Z');

// We display only GBP in UI; no currency symbol helper needed for other codes

function ItemCardInner({ item, initialAppear = false, staggerDelay = 0, colIndex = 0, cols = 1 }: ItemCardProps) {
  const tItem = useTranslations('Item');
  const tRel = useTranslations('Rel');
  const tCountries = useTranslations('Countries');
  const tCats = useTranslations('Categories');
  const { locale } = useLocale();
  const itemKey = String(item.id); // normalized id as string
  const { imageUrl, imageUrls, name, description, sellerName, sellerUrl, url, reviewStats, variants, sellerOnline, shipsFrom, refNum } = item;
  // Define GIF detection helper for this component (used for conditional GifMedia rendering)
  const isGif = typeof imageUrl === 'string' && /\.gif($|[?#])/i.test(imageUrl);
  // atoms & derived flags
  const isFav = useAtomValue(React.useMemo(() => selectAtom(favouritesAtom, (favs: unknown) => Array.isArray(favs as any[]) && (favs as any[]).includes(item.id as any)), [item.id]));
  const favouritesOnly = useAtomValue(favouritesOnlyAtom);
  const showFavAccent = isFav && !favouritesOnly;
  const category = useAtomValue(categoryAtom);
  const selectedSubs = useAtomValue(selectedSubcategoriesAtom);
  const thumbAspect = useAtomValue(thumbnailAspectAtom); // added
  const [expanded, setExpanded] = React.useState(false);
  const { perUnitSuffix } = usePerUnitLabel();
  const setExpandedRef = useSetAtom(expandedRefNumAtom);
  // Treat an update if lastUpdatedAt exists and either firstSeenAt is missing (pre-baseline legacy item) or they differ
  const hasUpdate = !!item.lastUpdatedAt && (!item.firstSeenAt || item.lastUpdatedAt !== item.firstSeenAt);
  // Show Created label (independent of current sort) for newly indexed items after cutoff
  const showCreated = !hasUpdate && !!item.firstSeenAt && (() => { const d = new Date(item.firstSeenAt as any); return !isNaN(d as any) && d > CREATION_LABEL_CUTOFF; })();
  const [suppressPanelAnim, setSuppressPanelAnim] = React.useState(false);
  const filterSigRef = React.useRef("");
  React.useEffect(() => {
    const sig = `${category}|${Array.isArray(selectedSubs) ? selectedSubs.join(",") : ""}`;
    if (filterSigRef.current && filterSigRef.current !== sig) {
      setSuppressPanelAnim(true);
      setExpanded(false);
      const id = setTimeout(() => setSuppressPanelAnim(false), 400);
      return () => clearTimeout(id);
    }
    filterSigRef.current = sig;
  }, [category, selectedSubs]);

  const rates = useExchangeRates();
  const { currency: displayCurrency } = useDisplayCurrency();
  const descDecoded = useMemo(() => decodeEntities(description || ''), [description]);
  const nameDecoded = useMemo(() => decodeEntities(name || ''), [name]);
  const [thumbSrc, setThumbSrc] = useState(() => proxyImage(imageUrl || ''));
  useEffect(() => { setThumbSrc(proxyImage(imageUrl || '')); }, [imageUrl]);
  const onThumbError = useCallback(() => {
    if (thumbSrc !== imageUrl) setThumbSrc(imageUrl || '');
  }, [thumbSrc, imageUrl]);
  const [openPreviewSignal, setOpenPreviewSignal] = useState<number | null>(null);
  // Handler shared by <GifMedia> to open zoom preview overlay
  const handleOpenPreview = useCallback((e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setOpenPreviewSignal(Date.now());
  }, []);
  const rangeReady = displayCurrency === 'USD'
    ? Array.isArray(variants) && variants.length > 0
    : (!!rates && Array.isArray(variants) && variants.length > 0);
  // remove previous rangeText effect & state usage; compute memoized value
  const computedRangeText = React.useMemo(() => {
    if (!Array.isArray(variants) || variants.length === 0) return '';
    const usdValues = variants.map(v => (typeof v.baseAmount === 'number' ? v.baseAmount : null)).filter(v => v != null) as number[];
    if (usdValues.length === 0) return '';
    const minUSD = Math.min(...usdValues);
    const maxUSD = Math.max(...usdValues);
    return formatUSDRange(minUSD, maxUSD, displayCurrency, rates, { decimals: 2 }) as string;
  }, [variants, rates, displayCurrency]);

  const endorsedLocal = useAtomValue(React.useMemo(() => selectAtom(endorsedSetAtom, (s: Set<string>) => s.has(itemKey)), [itemKey]));
  const hasVotedToday = useAtomValue(voteHasVotedAtom);

  const isFirefox = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /firefox/i.test(navigator.userAgent);
  }, []);

  // IntersectionObserver to control first-time entrance without relying on whileInView (reduces Firefox repaint glitches)
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(initialAppear ? false : false); // will flip to true
  const [animDone, setAnimDone] = useState(false);
  const fallbackRef = useRef<any>(null);
  // Staggered appearance for initial viewport batch
  useEffect(() => {
    if (initialAppear) {
      // For initial batch: immediate viewport check + stagger
      if (rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          // still apply stagger but ensure we'll enter
        }
      }
      const t = setTimeout(() => { setEntered(true); }, staggerDelay);
      return () => clearTimeout(t);
    }
  }, [initialAppear, staggerDelay]);
  // Intersection observer for non-initial or late-added items + immediate check + fallback
  useEffect(() => {
    if (initialAppear) return; // handled by stagger timing
    if (!rootRef.current) return;
    // Immediate synchronous visibility check (covers already-in-view elements before observer fires)
    const rect = rootRef.current.getBoundingClientRect();
    if (!entered && rect.top < window.innerHeight && rect.bottom > 0) {
      setEntered(true);
    }
    if (entered) return; // no need for observer
    const el = rootRef.current;
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setEntered(true);
          observer.disconnect();
          break;
        }
      }
    }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
    observer.observe(el);
    // Fallback: after 1500ms, force enter if still visible (guards against missed intersection edge cases)
    fallbackRef.current = setTimeout(() => {
      if (!rootRef.current || entered) return;
      const r2 = rootRef.current.getBoundingClientRect();
      if (r2.top < window.innerHeight && r2.bottom > 0) {
        setEntered(true);
      }
    }, 1500);
    return () => {
      observer.disconnect();
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, [initialAppear, entered]);
  const refKey = (refNum ?? String(item.id)) as string | number;
  const hasRef = !!refNum; // only attempt remote detail fetches when a real refNum exists
  const { ensure: ensureDetail } = useDetailAvailability(hasRef ? String(refKey) : null as any);
  const showVariants = Array.isArray(variants) && variants.length > 0;
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pricingPanelId = `item-pricing-${itemKey}`;
  const pricingTitleId = `${pricingPanelId}-title`;

  const shipsFromLabel = useMemo(() => {
    if (!shipsFrom) return null;
    if (isDomesticShipping(String(shipsFrom), locale)) return null;
    const code = normalizeShipFromCode(String(shipsFrom));
    let label: string | null = null;
    if (code) {
      try {
        label = tCountries(code);
      } catch {
        label = null;
      }
    }
    return label || countryLabelFromSource(String(shipsFrom));
  }, [shipsFrom, locale, tCountries]);

  const shippingRangeNode = useMemo(() => {
    const sh = item && item.sh;
    if (!sh) return null;
    const aUSD = typeof sh.min === 'number' ? sh.min : null;
    const bUSD = typeof sh.max === 'number' ? sh.max : null;
    if (aUSD == null && bUSD == null) return null;
    const isFree = Number(sh.free) === 1 || ((aUSD != null && aUSD === 0) && (bUSD != null && bUSD === 0));
    if (isFree) {
      return (
        <span className="inline-flex items-center gap-1" aria-label={tItem('shippingRangeAria')}>
          <VanIcon className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
          {tItem('shippingFree')}
        </span>
      );
    }
    if (displayCurrency !== 'USD' && !rates) return null;
    const text = formatUSDRange(aUSD as any, bUSD as any, displayCurrency, rates, { zeroIsFree: true }) as string;
    if (!text) return null;
    return (
      <span className="inline-flex items-center gap-1" aria-label={tItem('shippingRangeAria')}>
        <VanIcon className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
        {text}
      </span>
    );
  }, [item, displayCurrency, rates, tItem]);

  const shipsFromNode = useMemo(() => {
    if (!shipsFromLabel) return null;
    return (
      <span className="inline-flex items-center gap-1">
        <span className="opacity-70">{tItem('shipsFrom')}</span>
        <span className="text-gray-800 dark:text-gray-200 font-semibold">{shipsFromLabel}</span>
      </span>
    );
  }, [shipsFromLabel, tItem]);

  const shippingMeta = useMemo(() => {
    if (!shippingRangeNode && !shipsFromNode) return null;
    return (
      <div className="text-[10px] font-medium text-gray-600 dark:text-gray-400 leading-none flex flex-wrap items-center gap-2">
        {shippingRangeNode}
        {shipsFromNode}
      </div>
    );
  }, [shippingRangeNode, shipsFromNode]);

  React.useEffect(() => {
    if (!entered || animDone) return;
    const prefersReduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setAnimDone(true), prefersReduced ? 0 : 400);
    return () => clearTimeout(timer);
  }, [entered, animDone]);

  React.useEffect(() => {
    if (!showVariants && expanded) setExpanded(false);
  }, [showVariants, expanded]);

  // Cleanup preload timeout on unmount
  React.useEffect(() => {
    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
    };
  }, []);

  // Compute aspect class from global setting
  const aspectClass = useMemo(() => {
    if (thumbAspect === 'portrait') return 'aspect-[2/3]';
    if (thumbAspect === 'standard') return 'aspect-[1/1]';
    return 'aspect-[16/10]'; // landscape
  }, [thumbAspect]);

  // (no fallback price – only show when computedRangeText ready)
  // Use presence of minShip (only set after crawl) to decide if overlay should be available
  // Determine if we have per-item crawl detail available. Description may be absent even when other crawl data exists.
  // Previous heuristic (minShip != null) failed when shipping extraction missing; descriptionFull may also be null.
  // We treat any of these as a signal that a per-item JSON likely exists: description, shipping/minShip/maxShip, reviewsMeta, or embedded reviews.


  return (
    <div
      ref={rootRef}
      data-ref={String(refKey)}
      data-entered={entered ? 'true' : 'false'}
      data-animated={animDone ? 'true' : 'false'}
      className={cn(
        "item-card group",
        showFavAccent && "fav-card-ring"
      )}
    >
      <div className={cn('item-card-inner', showFavAccent && "fav-card-inner")}>
      {showFavAccent && (
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-[0] h-1/2 bg-gradient-to-t", "fav-card-bottom-glow", "to-transparent")} />
      )}
      <div className={cn(
        "relative item-card-image rounded-br-0 rounded-bl-0 overflow-hidden m-[4px] border pointer-events-none",
        "group/image",
        showFavAccent
          ? cn("fav-thumb-background", "fav-thumb-border", "fav-thumb-shadow")
          : "bg-gray-200 dark:bg-gray-800/40 border-[#e5e5e5] dark:border-gray-700"
      )}>
        <div className={cn("block overflow-hidden", aspectClass)}>
          {imageUrl ? (
            isGif ? (
              <GifMedia
                url={imageUrl}
                alt={nameDecoded}
                onOpenPreview={handleOpenPreview}
                className="w-full h-full"
              />
            ) : (
              <button
                type="button"
                aria-label={nameDecoded ? tItem('previewWithName', { name: nameDecoded }) : tItem('previewImage')}
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); setOpenPreviewSignal(Date.now()); }}
                className="card-preview-trigger relative w-full h-full overflow-hidden focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-400 rounded-sm rounded-br-0 rounded-bl-0 pointer-events-auto"
              >
                <img
                  src={thumbSrc}
                  alt={nameDecoded}
                  className="motion-img-fade gpu-smooth card-image"
                  loading="lazy"
                  decoding="async"
                  onError={onThumbError}
                  draggable={false}
                />
              </button>
            )
          ) : (
            <div className="w-full h-full bg-black/5 dark:bg-white/10" />
          )}
        </div>
        {imageUrl && (
          <>
            <div className="absolute right-2 top-2 z-10 flex items-center gap-2 card-controls pointer-events-auto">
              <FavButton itemId={item.id as any} className="" />
            </div>
            <div className="absolute right-2 bottom-2 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-auto">
              {/** Prefer referral share link (short link) when present */}
              <a
                href={(item as any).share || url || (refNum ? `https://littlebiggy.net/item/${refNum}/view/p` : undefined)}
                target="_blank"
                rel="noopener noreferrer"
                className="group/button inline-flex items-center gap-1.5 text-[10px] font-medium bg-white/60 dark:bg-gray-800/55 hover:bg-white/90 dark:hover:bg-gray-800/90 border border-gray-200/80 dark:border-gray-700/80 text-gray-800 dark:text-gray-200 rounded-full px-3 py-1 shadow-sm backdrop-blur-md transition-colors duration-250 focus:outline-none focus-visible:ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 ring-gray-300/60 dark:ring-gray-600/70"
              >
                <span>Little Biggy</span>
                <span className="inline-block text-base leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1 motion-reduce:transition-none">→</span>
              </a>
            </div>
            <ImageZoomPreview imageUrl={imageUrl} imageUrls={imageUrls as any} alt={name} openSignal={openPreviewSignal as any} hideTrigger onOpenChange={() => {}} />
          </>
        )}
        {category === 'All' && item.category && (
          <div className="absolute left-2 bottom-2 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide bg-black/60 dark:bg-black/50 text-white backdrop-blur-sm shadow-sm">
              {(() => { try {
                const map: Record<string, string> = { Flower: 'flower', Hash: 'hash', Edibles: 'edibles', Concentrates: 'concentrates', Vapes: 'vapes', Tincture: 'tincture', Psychedelics: 'psychedelics', Other: 'other' };
                const key = map[item.category as string] || String(item.category).toLowerCase();
                return tCats(key);
              } catch { return item.category; } })()}
            </span>
          </div>
        )}
      </div>
      <div className="p-[6px] pt-[4px] bg-[red]s pointer-events-none">
        {/* BODY (reserve space for footer) */}
        <div className="pb-17 lg:pb-15 flex flex-col">
          <button
            type="button"
            onMouseEnter={() => {
              if (hasRef) {
                preloadTimeoutRef.current = setTimeout(() => {
                  ensureDetail();
                  prefetchItemDetail(String(refKey));
                }, 125);
              }
            }}
            onMouseLeave={() => {
              if (preloadTimeoutRef.current) {
                clearTimeout(preloadTimeoutRef.current);
                preloadTimeoutRef.current = null;
              }
            }}
            onFocus={() => {
              if (hasRef) {
                preloadTimeoutRef.current = setTimeout(() => {
                  ensureDetail();
                  prefetchItemDetail(String(refKey));
                }, 125);
              }
            }}
            onBlur={() => {
              if (preloadTimeoutRef.current) {
                clearTimeout(preloadTimeoutRef.current);
                preloadTimeoutRef.current = null;
              }
            }}
            onPointerDown={() => { if (hasRef) { ensureDetail(); prefetchItemDetail(String(refKey)); } }}
            onClick={() => (setExpandedRef as any)(String(refKey))}
            aria-label={tItem('viewDetailsFor', { name: nameDecoded })}
            className="card-content pointer-events-auto"
          >
            <div className="card-content__inner">
              <div className="card-content__header">
                <h3 className="card-content__title font-heading">{nameDecoded}</h3>
                <span className="card-content__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17L17 7M17 7H7M17 7v10" />
                  </svg>
                </span>
              </div>
              {description && (
                <p className="card-content__description">{descDecoded}</p>
              )}
            </div>
          </button>

          <div className='item-info-wrap px-[8px] bg-[red]s'>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-2 min-w-0 ">
                <span className="shrink-0 italic">{tItem('seller')}</span>
                <SellerPill sellerName={decodeEntities(sellerName || '')} sellerUrl={(sellerUrl || url || '')} sellerOnline={sellerOnline as any} />
              </div>
            </div>
            {showVariants && <VariantPillsScroll variants={variants} />}
          </div>
        </div>
      </div>
      {/** Footer with price + optional shipping range */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-3 pt-2 px-3 bg-gradient-to-t from-white/95 dark:from-[#0f1725]/95 via-white/40 dark:via-[#0f1725]/50 to-transparent z-40">
        <div className="flex w-full items-end justify-between lg:gap-4">
          {showVariants ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
              aria-expanded={expanded}
              aria-controls={pricingPanelId}
              className={cn('price-area-button pointer-events-auto', expanded && 'price-area-button--active')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-price font-semibold text-gray-900 dark:text-gray-100 tabular-nums leading-none">
                  {rangeReady && computedRangeText ? (
                    <span>{computedRangeText}</span>
                  ) : (
                    <span className="opacity-0 select-none">{currencySymbol(displayCurrency)}00.00 - {currencySymbol(displayCurrency)}00.00</span>
                  )}
                </div>
                <span className="price-area-button__hint" aria-hidden="true">
                  <span>{expanded ? tItem('hidePrices') : tItem('showPrices')}</span>
                  <span className="price-area-button__hint-arrow" data-expanded={expanded ? 'true' : 'false'}>▲</span>
                </span>
              </div>
              {shippingMeta}
            </button>
          ) : (
            <div className="pointer-events-auto flex flex-col justify-end gap-1 min-h-[1.25rem]">
              <div className="text-sm font-price font-semibold text-gray-900 dark:text-gray-100 tabular-nums leading-none">
                {rangeReady && computedRangeText ? (
                  <span>{computedRangeText}</span>
                ) : (
                  <span className="opacity-0 select-none">{currencySymbol(displayCurrency)}00.00 - {currencySymbol(displayCurrency)}00.00</span>
                )}
              </div>
              {shippingMeta}
            </div>
          )}
          <div className="pointer-events-auto flex flex-col items-end gap-1">
            {hasUpdate ? (
              <div
                className="text-[10px] leading-none text-gray-400 dark:text-gray-500"
                title={(item.lastUpdatedAt ? ((item.lastUpdateReason ? `${formatBritishDateTime(item.lastUpdatedAt as any)} (${item.lastUpdateReason})` : formatBritishDateTime(item.lastUpdatedAt as any))) : '')}
                suppressHydrationWarning
              >
                {tItem('updated', { time: relativeCompact(item.lastUpdatedAt as any, tRel) })}
              </div>
            ) : showCreated ? (
              <div className="text-[10px] leading-none text-gray-400 dark:text-gray-500" title={formatBritishDateTime(item.firstSeenAt as any)} suppressHydrationWarning>{tItem('created', { time: relativeCompact(item.firstSeenAt as any, tRel) })}</div>
            ) : null}
            <div className="flex items-center gap-2 pointer-events-auto mt-1">
              <div className={cn('relative inline-flex', (hasVotedToday as any) && !endorsedLocal && 'opacity-100')}><EndorseButton itemId={itemKey} onHydrated={() => {}} /></div>
              {reviewStats ? <ReviewStatsBadge reviewStats={reviewStats as any} /> : null}
            </div>
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded && showVariants && (
          <motion.div
            key="pricing-overlay"
            id={pricingPanelId}
            aria-labelledby={pricingTitleId}
            className={cn('item-card__pricing-overlay', suppressPanelAnim && 'item-card__pricing-overlay--static')}
            initial={suppressPanelAnim ? false : { y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={suppressPanelAnim ? { y: 0, opacity: 0 } : { y: '100%', opacity: 0 }}
            transition={suppressPanelAnim ? { duration: 0.12 } : { duration: 0.32, ease: [0.22, 0.81, 0.36, 1] }}
            role="dialog"
            aria-modal="false"
            style={{ pointerEvents: expanded ? 'auto' : 'none' }}
          >
            <div className="item-card__pricing-inner">
              <div className="item-card__pricing-header" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <div id={pricingTitleId} className="item-card__pricing-title">{variants.length} {variants.length === 1 ? 'variant' : 'variants'}</div>
              </div>
              <div className="item-card__pricing-scroll" onClick={(e) => e.stopPropagation()}>
                <ul>
                  {variants.map((v, idx) => (
                    <li key={(v.id as any) || idx}>
                      <span>{decodeEntities(v.description)}</span>
                      <span>{(() => {
                        const usd = typeof v.baseAmount === 'number' ? v.baseAmount : null;
                        if (usd == null) return '';
                        const amountText = formatUSD(usd, displayCurrency, rates, { decimals: 2 }) as string;
                        const desc = decodeEntities(v.description);
                        const numericDisplayed = convertUSDToDisplay(usd, displayCurrency, rates) as number;
                        const per = perUnitSuffix(desc, numericDisplayed, displayCurrency);
                        return (
                          <>
                            <span className="variant-price">{amountText}</span>
                            {per && <span className="variant-per-unit text-[11px]">{per}</span>}
                          </>
                        );
                      })()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

const ItemCard = React.memo(ItemCardInner);
export default ItemCard;
