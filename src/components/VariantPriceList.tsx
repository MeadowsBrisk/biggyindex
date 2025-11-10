"use client";
import React from 'react';
import cn from '@/app/cn';
import { decodeEntities } from '@/lib/format';
import { displayedAmount, formatDisplayedAmount } from '@/lib/variantPricingDisplay';
import type { DisplayCurrency } from '@/lib/priceDisplay';
import { useDisplayCurrency } from '@/providers/IntlProvider';

type Variant = any;
type Props = {
  variants?: Variant[];
  rates?: any;
  displayCurrency?: DisplayCurrency;
  includeShipping?: boolean;
  shippingUsd?: number | null;
  selectedVariantIds?: Set<any>;
  onToggle?: (id: any) => void;
  perUnitSuffix?: (description: string, priceAmount: number | null, currency?: DisplayCurrency) => string | null;
  selectionEnabled?: boolean;
  className?: string;
  itemClassName?: string;
};

export default function VariantPriceList({
  variants = [],
  rates,
  displayCurrency,
  includeShipping = false,
  shippingUsd = null,
  selectedVariantIds = new Set(),
  onToggle = (_: any) => {},
  perUnitSuffix = (_d: any, _p: any, _c?: any) => null,
  selectionEnabled = false,
  className = '',
  itemClassName = '',
}: Props) {
  const { currency: ctxCurrency } = useDisplayCurrency();
  const chosenCurrency: DisplayCurrency = displayCurrency || (ctxCurrency as DisplayCurrency) || 'GBP';
  return (
    <ul className={cn('grid grid-cols-1 gap-1 max-h-52 overflow-auto pr-1 custom-scroll', className)}>
      {variants.map((v, idx) => {
        const vid = v.id || idx;
        const rawUsd = typeof v.baseAmount === 'number' ? v.baseAmount : null;
        const isSelected = selectedVariantIds.has(vid);
        const priceText = formatDisplayedAmount({
          baseUsd: rawUsd,
          displayCurrency: chosenCurrency,
          rates,
          shippingUsd,
          includeShipping,
          selectedVariantIds,
          variantId: vid,
        });
        const numericDisplayed = displayedAmount({
          baseUsd: rawUsd,
          currency: chosenCurrency,
          rates,
          shippingUsd,
          includeShipping,
          selectedVariantIds,
          variantId: vid,
        });
        const descRaw = (v.description && typeof v.description === 'string') ? v.description : '';
        const desc = descRaw ? decodeEntities(descRaw) : '';
        const per = perUnitSuffix(descRaw, numericDisplayed, displayCurrency);
        return (
          <li
            key={vid}
            className={cn(
              'flex items-center justify-between gap-2 text-[13px] px-2 py-1.5 rounded border',
              selectionEnabled
                ? (isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500' : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700')
                : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700',
              itemClassName
            )}
            onClick={() => onToggle(vid)}
          >
            <div className="flex items-center gap-2 min-w-0">
              {selectionEnabled && (
                <span className={cn('inline-block w-3.5 h-3.5 rounded-sm border', isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-400')}></span>
              )}
              <span className="truncate text-gray-700 dark:text-gray-300" title={desc}>{desc || 'Variant'}</span>
            </div>
            <span className="shrink-0 font-mono text-gray-900 dark:text-gray-100 text-right leading-tight font-semibold">{priceText}{per || ''}</span>
          </li>
        );
      })}
    </ul>
  );
}
