"use client";
import { useAtomValue } from 'jotai';
import { basketAtom } from '@/store/atoms';
import { useTranslations } from 'next-intl';

interface InBasketIndicatorProps {
    refNum: string | null;
    itemId: string | null;
}

/**
 * Isolated component that subscribes to basket state.
 * Extracted to prevent the entire ItemDetailOverlay from re-rendering
 * when unrelated basket changes occur (per rerender-memo rule).
 */
export default function InBasketIndicator({ refNum, itemId }: InBasketIndicatorProps) {
    const tOv = useTranslations('Overlay');
    const basketItems = useAtomValue(basketAtom) || [];

    if (!refNum && !itemId) return null;

    const exists = (basketItems as any[]).some(
        it =>
            (it?.refNum && String(it.refNum) === String(refNum)) ||
            (it?.id && String(it.id) === String(itemId))
    );

    if (!exists) return null;

    return (
        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            {tOv('inBasket')}
        </span>
    );
}
