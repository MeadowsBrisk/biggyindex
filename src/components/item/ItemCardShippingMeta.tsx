import React from 'react';
import cn from '@/lib/core/cn';
import { VanIcon } from '@/components/common/icons';
import { formatUSDRange, type DisplayCurrency, type ExchangeRates } from '@/lib/pricing/priceDisplay';
import { useTranslations } from 'next-intl';
import type { ItemShippingSummary } from './ItemCard';

export interface ItemCardShippingMetaProps {
  shippingSummary: ItemShippingSummary | null | undefined;
  shipsFromLabel: string | null;
  displayCurrency: DisplayCurrency;
  rates: ExchangeRates;
}

/**
 * Renders the shipping range and ships-from label for ItemCard footer.
 * Memoized to prevent re-renders when only other card state changes.
 */
function ItemCardShippingMetaInner({
  shippingSummary,
  shipsFromLabel,
  displayCurrency,
  rates,
}: ItemCardShippingMetaProps) {
  const tItem = useTranslations('Item');

  // Compute shipping range node
  const shippingRangeNode = React.useMemo(() => {
    const sh = shippingSummary;
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
  }, [shippingSummary, displayCurrency, rates, tItem]);

  // Compute ships-from node
  const shipsFromNode = React.useMemo(() => {
    if (!shipsFromLabel) return null;
    return (
      <span className="inline-flex items-center gap-1">
        <span className="opacity-70">{tItem('shipsFrom')}</span>
        <span className="text-gray-800 dark:text-gray-200 font-semibold">{shipsFromLabel}</span>
      </span>
    );
  }, [shipsFromLabel, tItem]);

  // Don't render if nothing to show
  if (!shippingRangeNode && !shipsFromNode) return null;

  return (
    <div className="text-[10px] font-medium text-gray-600 dark:text-gray-400 leading-none flex flex-wrap items-center gap-2">
      {shippingRangeNode}
      {shipsFromNode}
    </div>
  );
}

export const ItemCardShippingMeta = React.memo(ItemCardShippingMetaInner);
