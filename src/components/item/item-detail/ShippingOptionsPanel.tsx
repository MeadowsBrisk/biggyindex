"use client";
import React, { memo } from 'react';
import { VanIcon } from '@/components/common/icons';
import { decodeEntities } from '@/lib/core/format';
import { formatUSD } from '@/lib/pricing/priceDisplay';
import cn from '@/lib/core/cn';
import { useTranslations } from 'next-intl';

interface ShippingOption {
    label?: string;
    cost?: number;
}

interface ShippingOptionsPanelProps {
    options: ShippingOption[];
    loading: boolean;
    detail: any;
    includeShipping: boolean;
    allShippingFree: boolean;
    selectedShipIdx: number | null;
    setSelectedShipIdx: (idx: number) => void;
    displayCurrency: string;
    rates: any;
}

/**
 * Isolated shipping options panel.
 * Manages selection state changes without triggering full overlay re-renders.
 */
function ShippingOptionsPanelInner({
    options,
    loading,
    detail,
    includeShipping,
    allShippingFree,
    selectedShipIdx,
    setSelectedShipIdx,
    displayCurrency,
    rates,
}: ShippingOptionsPanelProps) {
    const tOv = useTranslations('Overlay');
    const tItem = useTranslations('Item');

    const hasOptions = (options && options.length > 0) || loading;
    if (!hasOptions) return null;

    return (
        <div className="hidden md:block mt-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/40 p-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1"><VanIcon className="w-4 h-4 opacity-70" /> {tOv('shippingOptions')}</span>
            </div>
            <ul className="space-y-1 max-h-48 overflow-auto pr-1 custom-scroll">
                {loading && !detail && (
                    Array.from({ length: 3 }).map((_, i) => (
                        <li key={i} className="h-6 rounded bg-white/50 dark:bg-gray-900/30 border border-dashed border-gray-300/60 dark:border-gray-700/60 animate-pulse" />
                    ))
                )}
                {!loading && options.map((opt, i) => {
                    const usd = typeof opt.cost === 'number' ? opt.cost : null;
                    const inputId = `shipOpt-${i}`;
                    const selectable = includeShipping && !allShippingFree && typeof usd === 'number';
                    const priceText = (usd == null)
                        ? ''
                        : formatUSD(usd, displayCurrency as any, rates, { zeroIsFree: true, freeLabel: tItem('shippingFree'), decimals: 2, ceilNonUSD: false } as any);
                    return (
                        <li key={i} className={cn(
                            "flex items-center justify-between gap-2 text-sm md:text-[14px] rounded px-2 py-1.5 border bg-white/70 dark:bg-gray-900/30",
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
    );
}

const ShippingOptionsPanel = memo(ShippingOptionsPanelInner);
export default ShippingOptionsPanel;
