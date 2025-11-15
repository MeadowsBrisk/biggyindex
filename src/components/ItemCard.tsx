import { motion, AnimatePresence } from "framer-motion";
import cn from "@/app/cn";
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSetAtom, useAtomValue } from "jotai";
import { categoryAtom, selectedSubcategoriesAtom, thumbnailAspectAtom, expandedRefNumAtom, favouritesAtom, favouritesOnlyAtom } from "@/store/atoms";
import SellerInfoBadge from "./SellerInfoBadge";
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
import { favouriteAccent } from '@/theme/favouriteAccent';
import SellerFilterButtons from '@/components/SellerFilterButtons';

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
  const needsRates = React.useMemo(() => {
    if (!Array.isArray(variants) || variants.length === 0) return false;
    // For non-USD display we need rates to convert USD -> target currency.
    return displayCurrency !== 'USD';
  }, [variants, displayCurrency]);
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
  // Animation configs
  const initialY = isFirefox ? 10 : 14;
  const transitionEase: any = isFirefox ? [0.22, 0.61, 0.33, 1] : undefined;

  const scrollStaggerPerCol = cols >= 5 ? 40 : cols === 4 ? 55 : 70; // ms per column when scrolling
  const delayMs = initialAppear ? staggerDelay : (entered ? colIndex * scrollStaggerPerCol : 0);
  // Previously animate always targeted visible state causing immediate animation.
  // Now we keep animate tied to entered so it transitions only when scrolled into view.
  const motionProps = initialAppear
    ? { initial: { opacity: 0, y: 8 }, animate: { opacity: entered ? 1 : 0, y: entered ? 0 : 8 } }
    : { initial: { opacity: 0, y: initialY }, animate: { opacity: entered ? 1 : 0, y: entered ? 0 : initialY } };

  // Compute aspect class from global setting
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
  // Runtime availability probe: we optimistically allow click once detail confirmed
  const refKey = (refNum ?? String(item.id)) as string | number;
  const hasRef = !!refNum; // only attempt remote detail fetches when a real refNum exists
  const { available: detailAvail, ensure: ensureDetail } = useDetailAvailability(hasRef ? String(refKey) : null as any);

  return (
    <motion.div
      ref={rootRef}
      data-ref={String(refKey)}
      data-entered={entered ? 'true' : 'false'}
      {...motionProps as any}
      transition={{ duration: 0.35, ease: transitionEase, delay: delayMs / 1000 }}
      onAnimationComplete={() => setAnimDone(true)}
      className={cn(
        "contain-paint transition-colors gpu-smooth group relative rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f1725] overflow-hidden w-full hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#141d30] hover:shadow-sm",
        !animDone && "no-transition",
        isFav && favouriteAccent.cardRing
      )}
      style={{ willChange: entered && animDone ? 'auto' : 'opacity, transform' }}
    >
      {isFav && (
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-[0] h-1/2 bg-gradient-to-t", favouriteAccent.cardBottomGlow, "to-transparent")} />
      )}
      <div className={cn(
        "relative rounded-[5px] overflow-hidden m-[4px] bg-gray-200 dark:bg-gray-800/40 border",
        "group/image",
        isFav ? (favouriteAccent.thumbBorder + ' ' + favouriteAccent.thumbShadow) : "border-[#e5e5e5] dark:border-gray-700"
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
              <motion.button
                type="button"
                aria-label={nameDecoded ? tItem('previewWithName', { name: nameDecoded }) : tItem('previewImage')}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenPreviewSignal(Date.now()); }}
                className="relative w-full h-full overflow-hidden focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-400 rounded-sm"
              >
                <motion.img
                  src={thumbSrc}
                  alt={nameDecoded}
                  initial={false}
                  className="motion-img-fade gpu-smooth w-full h-full object-cover transform-gpu transition-transform duration-300 ease-out group-hover/image:scale-[1.06] group-hover:scale-[1.06] cursor-zoom-in"
                  style={{ willChange: 'transform' }}
                  loading="lazy"
                  decoding="async"
                  onError={onThumbError}
                  draggable={false}
                />
              </motion.button>
            )
          ) : (
            <div className="w-full h-full bg-black/5 dark:bg-white/10" />
          )}
        </div>
        {imageUrl && (
          <>
            <div className="absolute right-2 top-2 z-10 flex items-center gap-2 card-controls">
              <FavButton itemId={item.id as any} className="" />
            </div>
            <div className="absolute right-2 bottom-2 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-auto">
              {/** Prefer referral share link (short link) when present */}
              <a
                href={(item as any).share || (url || undefined)}
                target="_blank"
                rel="noopener noreferrer"
                className="group/button inline-flex items-center gap-1.5 text-[12px] font-medium bg-white/60 dark:bg-gray-800/55 hover:bg-white/90 dark:hover:bg-gray-800/90 border border-gray-200/80 dark:border-gray-700/80 text-gray-800 dark:text-gray-200 rounded-full px-3 py-1 shadow-sm backdrop-blur-md transition-colors duration-250 focus:outline-none focus-visible:ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 ring-gray-300/60 dark:ring-gray-600/70"
              >
                <span>Biggy</span>
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
      <div className="p-3">
        {/* BODY (reserve space for footer) */}
        <div className="pb-16 flex flex-col">
          <div className="mb-1">
            <button
              type="button"
              onMouseEnter={() => { if (hasRef) { ensureDetail(); prefetchItemDetail(String(refKey)); } }}
              onFocus={() => { if (hasRef) { ensureDetail(); prefetchItemDetail(String(refKey)); } }}
              onPointerDown={() => { if (hasRef) { ensureDetail(); prefetchItemDetail(String(refKey)); } }}
              onClick={() => (setExpandedRef as any)(String(refKey))}
              aria-label={tItem('viewDetailsFor', { name: nameDecoded })}
              className={cn(
                "text-left w-full font-heading font-semibold text-base line-clamp-1 focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500 rounded-sm text-gray-900 dark:text-gray-100 hover:underline"
              )}
            >{nameDecoded}</button>
          </div>
          {description && (
            <button
              type="button"
              onMouseEnter={() => { if (hasRef) { ensureDetail(); prefetchItemDetail(String(refKey)); } }}
              onFocus={() => { if (hasRef) { ensureDetail(); prefetchItemDetail(String(refKey)); } }}
              onPointerDown={() => { if (hasRef) { ensureDetail(); prefetchItemDetail(String(refKey)); } }}
              onClick={() => (setExpandedRef as any)(String(refKey))}
              aria-label={tItem('viewDetailsFor', { name: nameDecoded })}
              className="mt-1 text-left w-full text-sm text-gray-700 dark:text-gray-300 line-clamp-4 leading-[1.4] focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500 rounded-sm"
            >{descDecoded}</button>
          )}
          {!isDomesticShipping(String(shipsFrom || ''), locale) && (
            <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
              {tItem('shipsFrom')} {(() => {
                const code = normalizeShipFromCode(String(shipsFrom || ''));
                let label: any = null;
                if (code) { try { label = tCountries(code); } catch {}
                }
                return <span className="font-medium">{label || countryLabelFromSource(String(shipsFrom || ''))}</span>;
              })()}
            </div>
          )}

      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
  <span className="shrink-0 italic">{tItem('seller')}</span>
    <SellerInfoBadge sellerName={decodeEntities(sellerName || '')} sellerUrl={(sellerUrl || url || '')} sellerOnline={sellerOnline as any} />
  <SellerFilterButtons sellerName={decodeEntities(sellerName || '')} className="" />
            </div>
          </div>
          {Array.isArray(variants) && variants.length > 0 && (
            <div className="mt-3">
              <div className="flex flex-wrap gap-1 max-h-14 overflow-hidden">
                {variants.slice(0, 8).map((v, idx) => (
                  <span key={(v.id as any) || idx} className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">{decodeEntities(v.description)}</span>
                ))}
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setExpanded(v => !v)}
                  aria-expanded={expanded}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-white dark:hover:bg-gray-700 transition-colors"
                >
                  {expanded ? tItem('hidePrices') : (variants.length > 8 ? tItem('moreCount', { count: variants.length - 8 }) : tItem('showPrices'))}
                </button>
              </div>
              <AnimatePresence initial={false}>
                {expanded && (
                  suppressPanelAnim ? (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }} className="mt-2">
                      <div className="max-h-40 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-800">
                        <ul className="space-y-1 text-xs">
                          {variants.map((v, idx) => (
                            <li key={(v.id as any) || idx} className="flex items-center justify-between gap-2">
                              <span className="text-gray-800 dark:text-gray-200">{decodeEntities(v.description)}</span>
                              <span className="text-gray-700 dark:text-gray-300">{(() => {
                                const usd = typeof v.baseAmount === 'number' ? v.baseAmount : null;
                                if (usd == null) return '';
                                const amountText = formatUSD(usd, displayCurrency, rates, { decimals: 2 }) as string;
                                const desc = decodeEntities(v.description);
                                const numericDisplayed = convertUSDToDisplay(usd, displayCurrency, rates) as number;
                                const per = perUnitSuffix(desc, numericDisplayed, displayCurrency);
                                return `${amountText}${per || ''}`;
                              })()}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }} className="overflow-hidden">
                      <div className="mt-2 max-h-40 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-800">
                        <ul className="space-y-1 text-xs">
                          {variants.map((v, idx) => (
                            <li key={(v.id as any) || idx} className="flex items-center justify-between gap-2">
                              <span className="text-gray-800 dark:text-gray-200">{decodeEntities(v.description)}</span>
                              <span className="text-gray-700 dark:text-gray-300">{(() => {
                                const usd = typeof v.baseAmount === 'number' ? v.baseAmount : null;
                                if (usd == null) return '';
                                const amountText = formatUSD(usd, displayCurrency, rates, { decimals: 2 }) as string;
                                const desc = decodeEntities(v.description);
                                const numericDisplayed = convertUSDToDisplay(usd, displayCurrency, rates) as number;
                                const per = perUnitSuffix(desc, numericDisplayed, displayCurrency);
                                return `${amountText}${per || ''}`;
                              })()}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      {/** Footer with price + optional shipping range */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-3 pt-2 px-3 flex items-end justify-between gap-4 bg-gradient-to-t from-white/95 dark:from-[#0f1725]/95 via-white/40 dark:via-[#0f1725]/50 to-transparent">
        <div className="flex flex-col justify-end gap-1 min-h-[1.25rem] pointer-events-none">
          <div className="text-sm font-price font-semibold text-gray-900 dark:text-gray-100 tabular-nums leading-none">
            <AnimatePresence mode="wait" initial={false}>
              {rangeReady && computedRangeText ? (
                <motion.span key="price" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>{computedRangeText}</motion.span>
              ) : (
                <span className="opacity-0 select-none">{currencySymbol(displayCurrency)}00.00 - {currencySymbol(displayCurrency)}00.00</span>
              )}
            </AnimatePresence>
          </div>
          {(() => {
            // Shipping summary provided as item.sh = { min, max, free } in USD
            const sh = item && item.sh;
            if (!sh) return null;
            const aUSD = typeof sh.min === 'number' ? sh.min : null;
            const bUSD = typeof sh.max === 'number' ? sh.max : null;
            if (aUSD == null && bUSD == null) return null;
            const isFree = Number(sh.free) === 1 || ((aUSD != null && aUSD === 0) && (bUSD != null && bUSD === 0));
            if (isFree) {
              return (
                <div className="text-[10px] font-medium text-gray-600 dark:text-gray-400 leading-none flex items-center gap-1" aria-label={tItem('shippingRangeAria')}>
                  <VanIcon className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
                  {tItem('shippingFree')}
                </div>
              );
            }
            // When displaying non-USD, ensure rates are loaded; otherwise defer to avoid misleading values
            if (displayCurrency !== 'USD' && !rates) return null;
            // Shipping should round up (never down) for non-USD
            const text = formatUSDRange(aUSD as any, bUSD as any, displayCurrency, rates, { zeroIsFree: true }) as string;
            if (!text) return null;
            return (
              <div className="text-[10px] font-medium text-gray-600 dark:text-gray-400 leading-none flex items-center gap-1" aria-label={tItem('shippingRangeAria')}>
                <VanIcon className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
                {text}
              </div>
            );
          })()}
        </div>
        <div className="flex flex-col items-end gap-1">
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
    </motion.div>
  );
}

const ItemCard = React.memo(ItemCardInner);
export default ItemCard;