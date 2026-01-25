import React from 'react';
import { useTranslations } from 'next-intl';
import { decodeEntities } from '@/lib/core/format';
import SellerPill from '@/components/seller/SellerPill';
import VariantPillsScroll from '@/components/item/VariantPillsScroll';
import type { ItemVariant } from '@/types/item';

export interface ItemCardBodyProps {
  /** Item reference key for overlay navigation */
  refKey: string | number;
  /** Decoded item name */
  nameDecoded: string;
  /** Raw description (will be decoded internally) */
  description: string | null | undefined;
  /** Decoded description */
  descDecoded: string;
  /** Seller name */
  sellerName: string | null | undefined;
  /** Seller URL */
  sellerUrl: string | null | undefined;
  /** Seller online status */
  sellerOnline: boolean | null | undefined;
  /** Item variants for pills */
  variants: ItemVariant[] | undefined;
  /** Callback to expand item detail overlay */
  onExpandClick: (refKey: string) => void;
}

/**
 * Renders the body section of ItemCard:
 * - Title with expand button
 * - Description
 * - Seller pill
 * - Variant pills scroll
 */
function ItemCardBodyInner({
  refKey,
  nameDecoded,
  description,
  descDecoded,
  sellerName,
  sellerUrl,
  sellerOnline,
  variants,
  onExpandClick,
}: ItemCardBodyProps) {
  const tItem = useTranslations('Item');
  const showVariants = Array.isArray(variants) && variants.length > 0;

  return (
    <div className="p-[6px] pt-[4px] pointer-events-none">
      {/* BODY (reserve space for footer) */}
      <div className="pb-17 lg:pb-15 flex flex-col">
        <button
          type="button"
          onClick={() => onExpandClick(String(refKey))}
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

        <div className="item-info-wrap px-[8px]">
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 italic">{tItem('seller')}</span>
              <SellerPill 
                sellerName={decodeEntities(sellerName || '')} 
                sellerUrl={sellerUrl || ''} 
                sellerOnline={sellerOnline as any} 
              />
            </div>
          </div>
          {showVariants && <VariantPillsScroll variants={variants} />}
        </div>
      </div>
    </div>
  );
}

export const ItemCardBody = React.memo(ItemCardBodyInner);
