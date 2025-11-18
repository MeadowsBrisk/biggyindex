import React from 'react';
import Link from 'next/link';
import { proxyImage } from '@/lib/images';
import { formatUSD } from '@/lib/priceDisplay';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useDisplayCurrency } from '@/providers/IntlProvider';
import { useTranslations } from 'next-intl';

interface SimpleItemCardProps {
  item: any;
}

export default function SimpleItemCard({ item }: SimpleItemCardProps) {
  const tItem = useTranslations('Item');
  const rates = useExchangeRates();
  const { currency } = useDisplayCurrency();
  const displayCurrency = currency || 'GBP';

  // Prioritize minified keys from the index
  const name = item.n || item.name || 'Item';
  const description = item.d || item.description || '';
  const imageUrl = item.i || item.imageUrl || null;
  const refNum = item.refNum || item.ref || String(item.id);
  
  // Price handling: uMin/uMax are common in the index
  const priceMin = item.uMin ?? item.price ?? item.p ?? null;
  const priceMax = item.uMax ?? null;
  const itemCurrency = item.currency || item.c || 'USD';

  const priceDisplay = (typeof priceMin === 'number' && priceMin > 0)
    ? formatUSD(priceMin, displayCurrency, rates, { decimals: 2 })
    : null;

  // Link to the main index with the ref query param to open the modal
  const href = `/?ref=${encodeURIComponent(refNum)}`;

  return (
    <Link 
      href={href}
      className="group block border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
    >
      <div className="aspect-square relative bg-gray-100 dark:bg-gray-900 overflow-hidden">
        {imageUrl ? (
          <img 
            src={proxyImage(imageUrl)} 
            alt={name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <span className="text-xs">{tItem('noImage')}</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug min-h-[2.5em]" title={name}>
          {name}
        </h3>
        {description && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
            {description}
          </p>
        )}
        <div className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
          {priceDisplay ? (
            <span>
              {priceDisplay}
              {priceMax && priceMax > priceMin && <span className="font-normal text-gray-500 ml-1">+</span>}
            </span>
          ) : (
            <span className="opacity-50">--</span>
          )}
        </div>
      </div>
    </Link>
  );
}
