"use client";
import React, { useState, useCallback, useMemo, memo } from 'react';
import { useSetAtom } from 'jotai';
import { addToBasketAtom, showToastAtom } from '@/store/atoms';
import VariantPriceList from '@/components/item/VariantPriceList';
import InBasketIndicator from '@/components/item/InBasketIndicator';
import { decodeEntities } from '@/lib/core/format';
import { formatUSD, type DisplayCurrency } from '@/lib/pricing/priceDisplay';
import { variantRangeText } from '@/lib/pricing/variantPricingDisplay';
import cn from '@/lib/core/cn';
import { useTranslations } from 'next-intl';

interface ItemVariantPanelProps {
    baseItem: any;
    baseVariants: any[];
    rates: any;
    displayCurrency: DisplayCurrency;
    includeShipping: boolean;
    setIncludeShipping: (v: boolean | ((prev: boolean) => boolean)) => void;
    shippingOptions: any[];
    allShippingFree: boolean;
    selectedShipIdx: number | null;
    selectedShippingUsd: number | null;
    perUnitSuffix: (desc: string, price: number | null, currency?: any) => string | null;
    name: string;
    resolvedSellerName: string;
    images: string[];
    sl: string | null;
}

/**
 * Isolated variant price panel with selection state.
 * Manages selectedVariantIds internally so parent doesn't re-render on selection changes.
 */
function ItemVariantPanelInner({
    baseItem,
    baseVariants,
    rates,
    displayCurrency,
    includeShipping,
    setIncludeShipping,
    shippingOptions,
    allShippingFree,
    selectedShipIdx,
    selectedShippingUsd,
    perUnitSuffix,
    name,
    resolvedSellerName,
    images,
    sl,
}: ItemVariantPanelProps) {
    const tOv = useTranslations('Overlay');
    const tItem = useTranslations('Item');

    // Local selection state - isolated from parent
    const [selectedVariantIds, setSelectedVariantIds] = useState<Set<any>>(new Set());
    const [selectionMode, setSelectionMode] = useState(false);

    const addToBasket = useSetAtom(addToBasketAtom);
    const showToast = useSetAtom(showToastAtom);

    const showSelection = includeShipping || selectionMode;

    const toggleVariantSelected = useCallback((vid: any) => {
        setSelectedVariantIds((prev) => {
            const next = new Set(prev);
            if (next.has(vid)) next.delete(vid); else next.add(vid);
            return next;
        });
    }, []);

    // Variant price range summary
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

    // Total for selected variants
    const selectedTotalText = useMemo(() => {
        if (baseVariants.length === 0 || selectedVariantIds.size === 0) return '';
        const sel = selectedVariantIds;
        let totalUSD = 0;
        for (let i = 0; i < baseVariants.length; i++) {
            const v = baseVariants[i];
            const vid = v.vid ?? v.id ?? i;
            if (!sel.has(vid)) continue;
            const baseUsd = (typeof v.usd === 'number' && isFinite(v.usd)) ? v.usd : (typeof v.baseAmount === 'number' && isFinite(v.baseAmount)) ? v.baseAmount : null;
            if (baseUsd == null) continue;
            let amtUSD = baseUsd as number;
            if ((includeShipping || selectionMode) && typeof selectedShippingUsd === 'number' && isFinite(selectedShippingUsd)) {
                const count = sel.size || 0;
                if (count === 0) amtUSD += selectedShippingUsd;
                else if (sel.has(vid)) amtUSD += (selectedShippingUsd / count);
            }
            if (typeof amtUSD === 'number' && isFinite(amtUSD)) totalUSD += amtUSD;
        }
        if (!(totalUSD > 0)) return '';
        return formatUSD(totalUSD, displayCurrency as any, rates as any, { decimals: 2, ceilNonUSD: false } as any);
    }, [baseVariants, selectedVariantIds, displayCurrency, rates, selectedShippingUsd, includeShipping, selectionMode]);

    const handleAddSelected = useCallback(() => {
        // Compute shipping fallback
        let shippingUsd: number | null = null;
        if (includeShipping) {
            if (selectedShipIdx != null && shippingOptions[selectedShipIdx] && typeof shippingOptions[selectedShipIdx].cost === 'number') {
                shippingUsd = shippingOptions[selectedShipIdx].cost;
            } else if (shippingOptions && shippingOptions.length > 0) {
                const freeOpt = shippingOptions.find((o: any) => o && typeof o.cost === 'number' && o.cost === 0);
                if (freeOpt) shippingUsd = 0;
                else {
                    let min: number | null = null;
                    for (const o of shippingOptions) { if (o && typeof o.cost === 'number') min = (min == null ? o.cost : Math.min(min, o.cost)); }
                    if (min != null) shippingUsd = min;
                }
            }
        }
        // Add each selected variant
        const selIds = new Set(selectedVariantIds);
        for (let idx = 0; idx < baseVariants.length; idx++) {
            const v = baseVariants[idx];
            const vid = v.vid ?? v.id ?? idx;
            if (!selIds.has(vid)) continue;
            const descRaw = v.d || '';
            const desc = descRaw ? decodeEntities(descRaw) : '';
            addToBasket({
                id: baseItem?.id,
                refNum: baseItem?.refNum,
                variantId: vid,
                variantDesc: desc || 'Variant',
                name,
                sellerName: resolvedSellerName,
                qty: 1,
                priceUSD: typeof v.usd === 'number' ? v.usd : null,
                shippingUsd: includeShipping ? (shippingUsd ?? null) : null,
                includeShip: !!includeShipping,
                imageUrl: images?.[0] || baseItem?.i,
                sl,
            });
        }
        setSelectedVariantIds(new Set());
        showToast(tOv('addedToBasket'));
    }, [baseItem, baseVariants, selectedVariantIds, includeShipping, selectedShipIdx, shippingOptions, name, resolvedSellerName, images, sl, addToBasket, showToast, tOv]);

    if (baseVariants.length === 0) return null;

    return (
        <div className="hidden md:block mt-1 border border-gray-200 dark:border-gray-700 rounded-md bg-white/80 dark:bg-gray-900/30 p-2">
            <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{tOv('variantPrices')}</div>
                    {variantPriceRangeText && (
                        <div className="mt-0.5 text-lg md:text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{variantPriceRangeText}</div>
                    )}
                </div>
                {!allShippingFree && shippingOptions.length > 0 ? (
                    <div className="flex items-center gap-2">
                        {includeShipping && selectedShipIdx != null && shippingOptions[selectedShipIdx] && (
                            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                {(() => {
                                    const usd = shippingOptions[selectedShipIdx].cost || 0;
                                    const amountText = formatUSD(usd, displayCurrency as any, rates as any, { zeroIsFree: true, freeLabel: tItem('shippingFree'), decimals: 2, ceilNonUSD: false } as any);
                                    return tOv('inclShip', { amount: amountText });
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
                            title={tOv('simulateBasket')}
                        >{tOv('simulateBasket')}</button>
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
                            title={tOv('simulateBasket')}
                        >{showSelection ? tOv('selectionOn') : tOv('simulateBasket')}</button>
                    </div>
                )}
            </div>
            {showSelection && (
                <div className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">{tOv('selectVariantsHint')}</div>
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
                className="sm:grid-cols-1 max-h-44"
                itemClassName="text-sm md:text-[12x]"
            />
            {/* Add selected button */}
            {showSelection && (
                <div className="mt-2 flex items-center justify-between">
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span>{selectedVariantIds.size || 0} {tOv('selectedLabel')}</span>
                        <button type="button" className="underline hover:no-underline" onClick={() => {
                            const all = new Set<any>();
                            for (let i = 0; i < baseVariants.length; i++) { const v = baseVariants[i]; all.add(v.vid ?? v.id ?? i); }
                            setSelectedVariantIds(all);
                        }}>{tOv('selectAll')}</button>
                        <button type="button" className="underline hover:no-underline" onClick={() => setSelectedVariantIds(new Set())}>{tOv('clear')}</button>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedTotalText && (
                            <span className="text-[11px] font-semibold font-mono text-gray-800 dark:text-gray-200">{tOv('total')} {selectedTotalText}</span>
                        )}
                        <button
                            type="button"
                            disabled={selectedVariantIds.size === 0}
                            onClick={handleAddSelected}
                            className={cn(
                                "text-xs font-semibold px-3 h-7 rounded-full",
                                selectedVariantIds.size === 0 ? "bg-gray-200 dark:bg-gray-700 text-gray-500" : "bg-blue-600 hover:bg-blue-500 text-white"
                            )}
                        >{tOv('addSelected')}</button>
                        {baseItem && (
                            <InBasketIndicator
                                refNum={baseItem.refNum || String(baseItem.id)}
                                itemId={baseItem.id}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const ItemVariantPanel = memo(ItemVariantPanelInner);
export default ItemVariantPanel;
