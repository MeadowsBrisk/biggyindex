import React, { useState, useMemo, useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { addToBasketAtom, showToastAtom, basketAtom, displayCurrencyAtom } from '@/store/atoms';
import VanIcon from '@/app/assets/svg/van.svg';
import { decodeEntities } from '@/lib/format';
import cn from '@/app/cn';
import { formatUSD } from '@/lib/priceDisplay';
import VariantPriceList from '@/components/VariantPriceList';
import { REVIEWS_DISPLAY_LIMIT } from '@/components/ReviewsList';
import { variantRangeText, displayedAmount } from '@/lib/variantPricingDisplay';

export default function MobileTabs({
  baseItem,
  rates,
  includeShipping,
  setIncludeShipping,
  shippingOptions,
  allShippingFree,
  selectedShipIdx,
  setSelectedShipIdx,
  variantPriceRangeText,
  perUnitSuffix,
  reviews,
  loading,
  error,
  reload,
  fullTimeAgo,
  onReviewImageClick,
  description,
  convertToGBP,
  roundDisplayGBP,
  ReviewsList,
  formatDescription,
  biggyLink,
  displayName,
  leadImage,
}) {
  // Load persisted tab choice or default to 'description'
  const [tab, setTab] = useState(() => {
    if (typeof window === 'undefined') return 'description';
    try {
      const saved = localStorage.getItem('itemDetailMobileTab');
      return (saved && ['prices', 'description', 'reviews'].includes(saved)) ? saved : 'description';
    } catch {
      return 'description';
    }
  });
  
  // Persist tab choice when it changes
  useEffect(() => {
    try {
      localStorage.setItem('itemDetailMobileTab', tab);
    } catch {}
  }, [tab]);
  const [selectionMode, setSelectionMode] = useState(false);
  // Auto-select preferred shipping when enabling includeShipping
  React.useEffect(() => {
    if (!includeShipping) return;
    if (!Array.isArray(shippingOptions) || shippingOptions.length === 0) return;
    if (selectedShipIdx == null || !shippingOptions[selectedShipIdx]) {
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
  }, [includeShipping, shippingOptions, selectedShipIdx, setSelectedShipIdx]);
  const addToBasket = useSetAtom(addToBasketAtom);
  const showToast = useSetAtom(showToastAtom);
  const basketItems = useAtomValue(basketAtom) || [];
  const displayCurrency = useAtomValue(displayCurrencyAtom);
  const [selected, setSelected] = useState(new Set());
  const toggle = (vid) => setSelected(prev => { const n = new Set(prev); if (n.has(vid)) n.delete(vid); else n.add(vid); return n; });
  // Compute range text using shared utility so it matches list and overlay exactly
  const selectedShippingUsd = useMemo(() => {
    if (!includeShipping) return null;
    const opt = (selectedShipIdx != null) ? shippingOptions[selectedShipIdx] : null;
    const c = opt && typeof opt.cost === 'number' ? opt.cost : null;
    return c == null ? null : c;
  }, [includeShipping, selectedShipIdx, shippingOptions]);
  const showSelection = includeShipping || selectionMode;
  const internalRangeText = useMemo(() => {
    if (!Array.isArray(baseItem?.variants) || baseItem.variants.length === 0) return '';
    return variantRangeText({
      variants: baseItem.variants,
      displayCurrency,
      rates,
      shippingUsd: selectedShippingUsd,
      includeShipping,
      selectedVariantIds: selected,
    });
  }, [baseItem, displayCurrency, rates, selectedShippingUsd, includeShipping, selected]);

  const selectedTotalText = useMemo(() => {
    if (!Array.isArray(baseItem?.variants) || selected.size === 0) return '';
    let total = 0;
    for (let i = 0; i < baseItem.variants.length; i++) {
      const v = baseItem.variants[i];
      const vid = v.id || i;
      if (!selected.has(vid)) continue;
      const baseUsd = (typeof v.baseAmount === 'number' && isFinite(v.baseAmount)) ? v.baseAmount : null;
      if (baseUsd == null) continue;
      const amt = displayedAmount({ baseUsd, currency: displayCurrency, rates, shippingUsd: selectedShippingUsd, includeShipping, selectedVariantIds: selected, variantId: vid });
      if (typeof amt === 'number' && isFinite(amt)) total += amt;
    }
    if (total <= 0) return '';
    if (displayCurrency === 'USD') return formatUSD(total, 'USD', rates, { decimals: 2 });
    return `£${total.toFixed(2).replace(/\.00$/, '')}`;
  }, [baseItem, selected, displayCurrency, rates, selectedShippingUsd, includeShipping]);
  const inBasket = useMemo(() => {
    if (!baseItem) return false;
    const ref = baseItem.refNum || String(baseItem.id);
    return basketItems.some(it => (it?.refNum && String(it.refNum) === String(ref)) || (it?.id && String(it.id) === String(baseItem.id)));
  }, [basketItems, baseItem]);
  return (
    <div className="mt-3 flex flex-col">
      <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-700" data-nosnippet>
        {['prices','description','reviews'].map(key => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 text-center text-[12px] py-1.5 capitalize transition-colors',
              tab === key ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            )}
          >{key}</button>
        ))}
      </div>

      {tab === 'prices' && (
        <div className="mt-2 space-y-2">
          {Array.isArray(baseItem?.variants) && baseItem.variants.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md bg-white/80 dark:bg-gray-900/30 p-2">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Variant Prices</div>
                  {(internalRangeText || variantPriceRangeText) && (
                    <div className="mt-0.5 text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">{internalRangeText || variantPriceRangeText}</div>
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
                          return `incl £${gbp.toFixed(2)} ship`;
                        })()}
                      </span>
                    )}
                    <button
                      type="button"
                      className={cn(
                        'text-[10px] font-semibold px-2 h-6 rounded-full',
                        includeShipping ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-300/60' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300/60'
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
                        'text-[10px] font-semibold px-2 h-6 rounded-full',
                        showSelection ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-300/60' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300/60'
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
                includeShipping={includeShipping}
                shippingUsd={selectedShippingUsd}
                selectedVariantIds={selected}
                onToggle={toggle}
                perUnitSuffix={perUnitSuffix}
                selectionEnabled={showSelection}
                className="max-h-52"
              />
              {showSelection && (
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <span>{selected.size || 0} selected</span>
                  <button type="button" className="underline hover:no-underline" onClick={() => {
                    const all = new Set();
                    for (const v of (baseItem.variants || [])) all.add(v.id || (baseItem.variants ? baseItem.variants.indexOf(v) : undefined));
                    setSelected(all);
                  }}>Select all</button>
                  <button type="button" className="underline hover:no-underline" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTotalText && (
                    <span className="text-[11px] font-semibold font-mono text-gray-800 dark:text-gray-200">Total: {selectedTotalText}</span>
                  )}
                  <button
                    type="button"
                    disabled={selected.size === 0}
                    onClick={() => {
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
                    const sel = new Set(selected);
                    for (const v of (baseItem.variants || [])) {
                      const vid = v.id || baseItem.variants.indexOf(v);
                      if (!sel.has(vid)) continue;
                      const descRaw = (v.description && typeof v.description === 'string') ? v.description : '';
                      const desc = descRaw ? decodeEntities(descRaw) : '';
                      addToBasket({
                        id: baseItem?.id,
                        refNum: baseItem?.refNum,
                        variantId: vid,
                        variantDesc: desc || 'Variant',
                        name: displayName || baseItem?.name,
                        sellerName: baseItem?.sellerName,
                        qty: 1,
                        priceUSD: typeof v.baseAmount === 'number' ? v.baseAmount : null,
                        shippingUsd: includeShipping ? (shippingUsd ?? null) : null,
                        includeShip: !!includeShipping,
                        imageUrl: leadImage || baseItem?.imageUrl,
                        biggyLink,
                      });
                    }
                    setSelected(new Set());
                    showToast('Added to basket');
                    }}
                    className={cn('text-xs font-semibold px-3 h-7 rounded-full', selected.size === 0 ? 'bg-gray-200 dark:bg-gray-700 text-gray-500' : 'bg-blue-600 hover:bg-blue-500 text-white')}
                  >Add selected</button>
                  {inBasket && (
                    <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">In basket</span>
                  )}
                </div>
              </div>
              )}
            </div>
          )}

          {(shippingOptions && shippingOptions.length > 0) && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/40 p-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" /> Shipping Options</span>
              </div>
              <ul className="space-y-1 max-h-48 overflow-auto pr-1 custom-scroll">
                {!loading && shippingOptions && shippingOptions.map((opt, i) => {
                  const usd = typeof opt.cost === 'number' ? opt.cost : null;
                  let gbp = usd === 0 ? 0 : (usd != null ? convertToGBP(usd, 'USD', rates) : null);
                  // Match Basket: no rounding up; display to 2 decimals
                  // leave gbp as computed; format when rendering
                  const inputId = `m-shipOpt-${i}`;
                  const selectable = includeShipping && !allShippingFree && typeof usd === 'number';
                  const priceText = displayCurrency === 'USD'
                    ? (usd == null ? '' : formatUSD(usd, 'USD', rates, { zeroIsFree: true }))
                    : (gbp == null ? (usd == null ? '?' : '…') : (gbp === 0 ? 'free' : `£${gbp.toFixed(2)}`));
                  return (
                    <li key={i} className={cn(
                      'flex items-center justify-between gap-2 text-[13px] rounded px-2 py-1.5 border bg-white/70 dark:bg-gray-900/30',
                      'border-gray-200/70 dark:border-gray-700/70',
                      selectable ? 'cursor-pointer' : 'cursor-default opacity-100'
                    )}
                      onClick={() => { if (selectable) setSelectedShipIdx(i); }}
                    >
                      <label htmlFor={inputId} className="flex items-center gap-2 min-w-0 w-full cursor-pointer">
                        {selectable && (
                          <input
                            id={inputId}
                            type="radio"
                            name="m-shipOpt"
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
      )}

      {tab === 'description' && (
        <div className="mt-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Description</h3>
          {loading && (
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
            </div>
          )}
          {!loading && description && formatDescription(description)}
          {!loading && !description && <div className="text-xs italic text-gray-400">No description.</div>}
        </div>
      )}

      {tab === 'reviews' && (
        <div className="mt-2">
          {(() => {
            const stats = baseItem?.reviewStats;
            const avgRating = typeof stats?.averageRating === 'number'
              ? stats.averageRating
              : (reviews.length
                  ? (reviews.map(r => typeof r.rating === 'number' ? r.rating : 0).reduce((a,b)=>a+b,0) /
                     (reviews.filter(r=> typeof r.rating === 'number').length || 1))
                  : null);
            const avgDays = typeof stats?.averageDaysToArrive === 'number' ? stats.averageDaysToArrive : null;
            const reviewsTotal = typeof stats?.numberOfReviews === 'number' ? stats.numberOfReviews : (reviews.length);
            const displayLimit = REVIEWS_DISPLAY_LIMIT;

            const tokensLeft = [];
            if (avgRating != null) tokensLeft.push(`${avgRating.toFixed(1)} avg`);
            if (reviewsTotal != null) {
              if (reviewsTotal > displayLimit && reviews.length >= displayLimit) {
                tokensLeft.push(`${displayLimit} Recent (${reviewsTotal} total)`);
              } else {
                tokensLeft.push(`${reviewsTotal} total`);
              }
            }
            const rightTokens = [];
            if (avgDays != null) {
              const d = Math.round(avgDays);
              rightTokens.push(`avg arrival ${d === 1 ? '1 day' : d + ' days'}`);
            }
            return (
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1 text-[11px] font-normal text-gray-500 dark:text-gray-400">
                    {tokensLeft.join(' • ')}
                  </span>
                  {rightTokens.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-normal text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {rightTokens.join(' • ')}
                    </span>
                  )}
                </h3>
              </div>
            );
          })()}
          {loading && (
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
              onImageClick={(src, images, index) => onReviewImageClick(images, index)}
            />
          )}
          {!loading && reviews.length > 0 && (() => {
            const stats = baseItem?.reviewStats;
            const reviewsTotal = typeof stats?.numberOfReviews === 'number' ? stats.numberOfReviews : reviews.length;
            const isTruncated = reviewsTotal > reviews.length && reviews.length >= REVIEWS_DISPLAY_LIMIT;
            if (!isTruncated || !biggyLink) return null;
            return (

              <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 text-right pr-2">
                Read more reviews at:
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
