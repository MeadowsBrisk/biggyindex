import React, { useMemo } from 'react';
import { decodeEntities } from '@/lib/core/format';
import { formatUSD, convertUSDToDisplay, type DisplayCurrency, type ExchangeRates } from '@/lib/pricing/priceDisplay';
import { perUnitSuffix } from '@/hooks/usePerUnitLabel';
import type { ItemVariant } from '@/types/item';

export interface ItemCardVariantListProps {
  variants: ItemVariant[];
  displayCurrency: DisplayCurrency;
  rates: ExchangeRates;
  unitLabels?: Record<string, string>;
}

/**
 * Renders the expandable variant pricing list for ItemCard.
 * Extracted to reduce ItemCard complexity and enable independent memoization.
 */
function ItemCardVariantListInner({
  variants,
  displayCurrency,
  rates,
  unitLabels,
}: ItemCardVariantListProps) {
  return (
    <ul>
      {variants.map((v, idx) => (
        <li key={(v.vid as any) || idx}>
          <span>{decodeEntities(v.d)}</span>
          <span>
            {(() => {
              // v.usd = price in USD (minified key)
              const usd = typeof v.usd === 'number' ? v.usd : null;
              if (usd == null) return '';
              const amountText = formatUSD(usd, displayCurrency, rates, { decimals: 2 }) as string;
              // Use dEn (English) for unit parsing if available, else fall back to d
              const descForParsing = decodeEntities(v.dEn || v.d);
              const numericDisplayed = convertUSDToDisplay(usd, displayCurrency, rates) as number;
              const per = perUnitSuffix(descForParsing, numericDisplayed, displayCurrency, unitLabels);
              return (
                <>
                  <span className="variant-price">{amountText}</span>
                  {per && <span className="variant-per-unit text-[11px]">{per}</span>}
                </>
              );
            })()}
          </span>
        </li>
      ))}
    </ul>
  );
}

export const ItemCardVariantList = React.memo(ItemCardVariantListInner);
