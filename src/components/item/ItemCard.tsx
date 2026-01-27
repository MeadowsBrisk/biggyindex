import cn from "@/lib/core/cn";
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSetAtom, useAtomValue } from "jotai";
import { categoryAtom, selectedSubcategoriesAtom, thumbnailAspectAtom, expandedRefNumAtom, favouritesSetAtom, favouritesOnlyAtom, ppgDataAtom, selectedWeightAtom, type PpgItemInfo } from "@/store/atoms";
import { voteHasVotedAtom, endorsedSetAtom } from "@/store/votesAtoms";
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { formatUSDRange, formatUSD, currencySymbol, type DisplayCurrency, type ExchangeRates } from '@/lib/pricing/priceDisplay';
import { useDisplayCurrency, useLocale, useForceEnglish } from '@/providers/IntlProvider';
import { parseQuantity, matchWeightBreakpoint } from '@/lib/pricing/parseQuantity';
import { useTranslations } from 'next-intl';
import { decodeEntities } from '@/lib/core/format';
import { countryLabelFromSource, normalizeShipFromCode } from '@/lib/market/countries';
import { isDomesticShipping } from '@/lib/market/localeUtils';
import { observeElement, unobserveElement } from '@/lib/ui/sharedIntersectionObserver';

// Extracted sub-components for better maintainability
import { ItemCardVariantList } from '@/components/item/ItemCardVariantList';
import { ItemCardShippingMeta } from '@/components/item/ItemCardShippingMeta';
import { ItemCardImage } from '@/components/item/ItemCardImage';
import { ItemCardFooterActions } from '@/components/item/ItemCardFooterActions';
import { ItemCardBody } from '@/components/item/ItemCardBody';

// Types - using minified keys (n=name, d=description, i=imageUrl, sn=sellerName, etc.)
// See src/types/item.ts for full key reference
import type { ItemVariant } from '@/types/item';

export interface ItemShippingSummary { min?: number | null; max?: number | null; free?: number | boolean | null; }

export interface ItemCardItem {
  id: string | number;
  refNum?: string | number | null;
  /** i = imageUrl */
  i?: string | null;
  /** is = imageUrls */
  is?: string[] | null;
  /** n = name */
  n: string;
  /** nEn = English name (original, for non-GB markets) */
  nEn?: string | null;
  /** d = description */
  d?: string | null;
  /** dEn = English description (original, for non-GB markets) */
  dEn?: string | null;
  /** sn = sellerName */
  sn?: string | null;
  /** sid = sellerId */
  sid?: number | null;
  url?: string | null;
  /** rs = reviewStats */
  rs?: { avg?: number | null; days?: number | null; cnt?: number | null } | null;
  /** v = variants */
  v?: ItemVariant[];
  sellerOnline?: boolean | null;
  /** sf = shipsFrom */
  sf?: string | null;
  /** c = category */
  c?: string | null;
  /** fsa = firstSeenAt */
  fsa?: string | Date | null;
  /** lua = lastUpdatedAt */
  lua?: string | Date | null;
  /** sl = shareLink */
  sl?: string | null;
  /** sh = shipping summary */
  sh?: ItemShippingSummary | null;
  /** lur = lastUpdateReason */
  lur?: string | null;
}

export interface ItemCardProps {
  item: ItemCardItem;
  initialAppear?: boolean;
  staggerDelay?: number;
  colIndex?: number;
  cols?: number;
  priority?: boolean;
}

// Add cutoff date (items created after this show a Created label if no update exists)
const CREATION_LABEL_CUTOFF = new Date('2025-09-02T12:00:59Z');

// We display only GBP in UI; no currency symbol helper needed for other codes

function ItemCardInner({ item, initialAppear = false, staggerDelay = 0, colIndex = 0, cols = 1, priority = false }: ItemCardProps) {
  const tItem = useTranslations('Item');
  const tCountries = useTranslations('Countries');
  const tUnits = useTranslations('Units');
  const { locale } = useLocale();
  
  // Get unit labels for per-unit suffix (e.g., "g", "joint" → translated)
  // Use locale as stable dependency instead of tUnits (which creates new refs on parent renders)
  const unitLabels = useMemo(() => {
    try {
      // Get all unit translations as a record
      const keys = ['g', 'mg', 'ml', 'kg', 'oz', 'joint', 'item', 'tab', 'cap', 'gummy', 'pk', 'pc', 'bottle', 'jar', 'bar', 'chew', 'square', 'star', 'x'];
      const labels: Record<string, string> = {};
      for (const k of keys) {
        try { labels[k] = tUnits(k); } catch { labels[k] = k; }
      }
      return labels;
    } catch {
      return undefined;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  const itemKey = String(item.id); // normalized id as string
  // Destructure minified keys with aliased names for readability
  const { i: imageUrl, is: imageUrls, n: name, nEn: nameEn, d: description, dEn: descriptionEn, sn: sellerName, sid: sellerId, url, rs: reviewStats, v: variants, sellerOnline, sf: shipsFrom, refNum } = item;
  
  // Use English content when forceEnglish is enabled (and English version is available)
  const { forceEnglish } = useForceEnglish();
  const displayName = (forceEnglish && nameEn) ? nameEn : name;
  const displayDesc = (forceEnglish && descriptionEn) ? descriptionEn : description;
  
  // atoms & derived flags - use shared Set atom for O(1) lookup instead of per-item selectAtom
  const favSet = useAtomValue(favouritesSetAtom);
  const isFav = favSet.has(item.id);
  const favouritesOnly = useAtomValue(favouritesOnlyAtom);
  const showFavAccent = isFav && !favouritesOnly;
  const category = useAtomValue(categoryAtom);
  const selectedSubs = useAtomValue(selectedSubcategoriesAtom);
  const thumbAspect = useAtomValue(thumbnailAspectAtom); // added
  const [expanded, setExpanded] = React.useState(false);
  const setExpandedRef = useSetAtom(expandedRefNumAtom);
  
  // Memoized callback for body expand click
  const handleExpandClick = useCallback((refKey: string) => {
    setExpandedRef(refKey);
  }, [setExpandedRef]);
  
  // Treat an update if lua (lastUpdatedAt) exists and either fsa (firstSeenAt) is missing (pre-baseline legacy item) or they differ
  const hasUpdate = !!item.lua && (!item.fsa || item.lua !== item.fsa);
  // Show Created label (independent of current sort) for newly indexed items after cutoff
  const showCreated = !hasUpdate && !!item.fsa && (() => { const d = new Date(item.fsa as any); return !isNaN(d as any) && d > CREATION_LABEL_CUTOFF; })();
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
  const descDecoded = useMemo(() => decodeEntities(displayDesc || ''), [displayDesc]);
  const nameDecoded = useMemo(() => decodeEntities(displayName || ''), [displayName]);
  const rangeReady = displayCurrency === 'USD'
    ? Array.isArray(variants) && variants.length > 0
    : (!!rates && Array.isArray(variants) && variants.length > 0);
  // remove previous rangeText effect & state usage; compute memoized value
  const computedRangeText = React.useMemo(() => {
    if (!Array.isArray(variants) || variants.length === 0) return '';
    // v.usd = price in USD (minified key)
    const usdValues = variants.map(v => (typeof v.usd === 'number' ? v.usd : null)).filter(v => v != null) as number[];
    if (usdValues.length === 0) return '';
    const minUSD = Math.min(...usdValues);
    const maxUSD = Math.max(...usdValues);
    return formatUSDRange(minUSD, maxUSD, displayCurrency, rates, { decimals: 2 }) as string;
  }, [variants, rates, displayCurrency]);

  // PPG sorting: when a weight is selected, show that weight's price instead of range
  const selectedWeight = useAtomValue(selectedWeightAtom);
  const ppgData = useAtomValue(ppgDataAtom);
  const ppgInfo = React.useMemo(() => {
    if (!ppgData || selectedWeight === null) return null;
    const itemRef = String(refNum ?? item.id ?? '');
    return ppgData.lookup.get(itemRef) ?? null;
  }, [ppgData, selectedWeight, refNum, item.id]);

  // Fallback PPG: when item doesn't have the selected weight, compute best PPG from variants
  // This shows users the closest available price-per-gram info
  const fallbackPpgInfo = React.useMemo(() => {
    // Only compute fallback if we're in PPG mode but this item isn't in the lookup
    if (!ppgData || selectedWeight === null || ppgInfo) return null;
    if (!Array.isArray(variants) || variants.length === 0) return null;
    
    // Find variants with valid weight parsing and compute their PPG
    const variantPpgs: { usd: number; ppg: number; grams: number; d: string }[] = [];
    for (const v of variants) {
      if (typeof v.usd !== 'number' || !v.d) continue;
      const parsed = parseQuantity(v.dEn ?? v.d);
      if (!parsed || parsed.unit !== 'g' || parsed.qty <= 0) continue;
      variantPpgs.push({ 
        usd: v.usd, 
        ppg: v.usd / parsed.qty, 
        grams: parsed.qty,
        d: v.d 
      });
    }
    if (variantPpgs.length === 0) return null;
    
    // Find the one closest to the selected weight (for most relevant comparison)
    // If multiple at same distance, pick the one with lowest ppg (best value)
    const sorted = variantPpgs.sort((a, b) => {
      const distA = Math.abs(a.grams - selectedWeight);
      const distB = Math.abs(b.grams - selectedWeight);
      if (distA !== distB) return distA - distB;
      return a.ppg - b.ppg;
    });
    const best = sorted[0];
    return { usd: best.usd, ppg: best.ppg, grams: best.grams, isFallback: true };
  }, [ppgData, selectedWeight, ppgInfo, variants]);

  // Price text: show ppg-specific price when weight selected, otherwise show range
  const priceDisplayText = React.useMemo(() => {
    if (ppgInfo && rates) {
      // Show the selected weight's price with ppg annotation
      const priceText = formatUSD(ppgInfo.usd, displayCurrency, rates, { decimals: 2 });
      const ppgText = formatUSD(ppgInfo.ppg, displayCurrency, rates, { decimals: 2 });
      return { main: priceText, ppg: `${ppgText}/g`, weight: selectedWeight, isFallback: false };
    }
    // Fallback: show closest available weight's PPG with annotation
    if (fallbackPpgInfo && rates && selectedWeight) {
      const priceText = formatUSD(fallbackPpgInfo.usd, displayCurrency, rates, { decimals: 2 });
      const ppgText = formatUSD(fallbackPpgInfo.ppg, displayCurrency, rates, { decimals: 2 });
      // Gray color indicates fallback - no need for weight label which causes line wrap
      return { 
        main: priceText, 
        ppg: `${ppgText}/g`, 
        weight: fallbackPpgInfo.grams, 
        isFallback: true 
      };
    }
    return null;
  }, [ppgInfo, fallbackPpgInfo, rates, displayCurrency, selectedWeight]);

  // Use shared Set atom for O(1) lookup instead of per-item selectAtom
  const endorsedSet = useAtomValue(endorsedSetAtom);
  const endorsedLocal = endorsedSet.has(itemKey);
  const hasVotedToday = useAtomValue(voteHasVotedAtom);

  // Shared IntersectionObserver for first-time entrance (reduces Firefox repaint glitches)
  // Uses a single shared observer across all ItemCards instead of 2000+ individual observers
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteredRef = useRef(false); // Ref to track entered state for callbacks

  // Staggered appearance for initial viewport batch
  useEffect(() => {
    if (initialAppear) {
      const t = setTimeout(() => {
        setEntered(true);
        enteredRef.current = true;
      }, staggerDelay);
      return () => clearTimeout(t);
    }
  }, [initialAppear, staggerDelay]);

  // Shared intersection observer for non-initial items
  useEffect(() => {
    if (initialAppear) return; // handled by stagger timing
    if (!rootRef.current) return;
    if (enteredRef.current) return; // already entered

    const el = rootRef.current;

    // Immediate synchronous visibility check (covers already-in-view elements)
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setEntered(true);
      enteredRef.current = true;
      return;
    }

    // Use shared observer
    const onEnter = () => {
      setEntered(true);
      enteredRef.current = true;
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
    observeElement(el, onEnter);

    // Fallback: after 1500ms, force enter if still visible
    fallbackRef.current = setTimeout(() => {
      if (enteredRef.current || !rootRef.current) return;
      const r2 = rootRef.current.getBoundingClientRect();
      if (r2.top < window.innerHeight && r2.bottom > 0) {
        setEntered(true);
        enteredRef.current = true;
        unobserveElement(el);
      }
    }, 1500);

    return () => {
      unobserveElement(el);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, [initialAppear]);
  const refKey = (refNum ?? String(item.id)) as string | number;
  const showVariants = Array.isArray(variants) && variants.length > 0;
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

  // Shipping meta (range + origin) - extracted to ItemCardShippingMeta component
  const shippingMeta = (
    <ItemCardShippingMeta
      shippingSummary={item.sh}
      shipsFromLabel={shipsFromLabel}
      displayCurrency={displayCurrency as DisplayCurrency}
      rates={rates as ExchangeRates}
    />
  );

  React.useEffect(() => {
    if (!entered || animDone) return;
    const prefersReduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setAnimDone(true), prefersReduced ? 0 : 400);
    return () => clearTimeout(timer);
  }, [entered, animDone]);

  React.useEffect(() => {
    if (!showVariants && expanded) setExpanded(false);
  }, [showVariants, expanded]);

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
      <ItemCardImage
        itemId={item.id}
        imageUrl={imageUrl}
        imageUrls={imageUrls}
        name={name}
        nameDecoded={nameDecoded}
        refNum={refNum}
        shareLink={item.sl}
        itemCategory={item.c}
        showFavAccent={showFavAccent}
        aspectClass={aspectClass}
        priority={priority}
      />
      <ItemCardBody
        refKey={refKey}
        nameDecoded={nameDecoded}
        description={description}
        descDecoded={descDecoded}
        sellerName={sellerName}
        sellerUrl={url}
        sellerOnline={sellerOnline}
        variants={variants}
        onExpandClick={handleExpandClick}
      />
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
                  {priceDisplayText ? (
                    <span className="flex items-baseline gap-1.5">
                      <span>{priceDisplayText.main}</span>
                      <span className={cn(
                        "text-xs font-normal",
                        priceDisplayText.isFallback 
                          ? "text-gray-500 dark:text-gray-400" 
                          : "text-green-600 dark:text-green-400"
                      )}>
                        ({priceDisplayText.ppg})
                      </span>
                    </span>
                  ) : rangeReady && computedRangeText ? (
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
                {priceDisplayText ? (
                  <span className="flex items-baseline gap-1.5">
                    <span>{priceDisplayText.main}</span>
                    <span className={cn(
                      "text-xs font-normal",
                      priceDisplayText.isFallback 
                        ? "text-gray-500 dark:text-gray-400" 
                        : "text-green-600 dark:text-green-400"
                    )}>
                      ({priceDisplayText.ppg})
                    </span>
                  </span>
                ) : rangeReady && computedRangeText ? (
                  <span>{computedRangeText}</span>
                ) : (
                  <span className="opacity-0 select-none">{currencySymbol(displayCurrency)}00.00 - {currencySymbol(displayCurrency)}00.00</span>
                )}
              </div>
              {shippingMeta}
            </div>
          )}
          <ItemCardFooterActions
            itemKey={itemKey}
            hasVotedToday={hasVotedToday as boolean}
            endorsedLocal={endorsedLocal}
            reviewStats={reviewStats}
            timestamp={{
              hasUpdate,
              showCreated,
              lua: item.lua,
              lur: item.lur,
              fsa: item.fsa,
            }}
          />
        </div>
      </div>
      {showVariants && (
        <div
          id={pricingPanelId}
          aria-labelledby={pricingTitleId}
          className={cn(
            'item-card__pricing-overlay',
            expanded && 'item-card__pricing-overlay--open',
            suppressPanelAnim && 'item-card__pricing-overlay--static'
          )}
          role="dialog"
          aria-modal="false"
          aria-hidden={!expanded}
        >
          <div className="item-card__pricing-inner">
            <div className="item-card__pricing-header" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
              <div id={pricingTitleId} className="item-card__pricing-title">{variants.length} {variants.length === 1 ? 'variant' : 'variants'}</div>
            </div>
            <div className="item-card__pricing-scroll" onClick={(e) => e.stopPropagation()}>
              <ItemCardVariantList
                variants={variants}
                displayCurrency={displayCurrency as DisplayCurrency}
                rates={rates as ExchangeRates}
                unitLabels={unitLabels}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

const ItemCard = React.memo(ItemCardInner);
export default ItemCard;
