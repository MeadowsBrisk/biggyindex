import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import cn from '@/app/cn';
import { useAtomValue, useSetAtom } from 'jotai';
import type { BasketEntry } from '@/store/atoms';
import {
  basketAtom,
  basketCountAtom,
  removeFromBasketAtom,
  setBasketQtyAtom,
  clearBasketAtom,
  exchangeRatesAtom,
  expandedRefNumAtom,
  changeBasketVariantAtom,
  itemsAtom,
} from '@/store/atoms';
import { useTranslations } from 'next-intl';
import { useDisplayCurrency } from '@/providers/IntlProvider';
import { formatGBP, formatUSD, type DisplayCurrency } from '@/lib/priceDisplay';
import { convertToGBP } from '@/hooks/useExchangeRates';
import { useItemDetailLazy } from '@/hooks/useItemDetail';

const drawerVariants: Variants = {
  hidden: { x: '100%' },
  visible: {
    x: 0,
    transition: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 },
  },
  exit: { x: '100%', transition: { duration: 0.25, ease: 'easeInOut' } },
};

const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 0.45 },
  exit: { opacity: 0 },
};

const floatingButtonVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

type SellerGroup = {
  sellerName: string;
  items: BasketEntry[];
  includeShip: boolean;
  shipUsd: number | null;
};

export default function Basket() {
  const t = useTranslations('Basket');
  const { currency: ctxCurrency } = useDisplayCurrency();
  const [open, setOpen] = useState(false);
  const items = (useAtomValue(basketAtom) as BasketEntry[]) || [];
  const count = useAtomValue(basketCountAtom);
  const removeItem = useSetAtom(removeFromBasketAtom);
  const setQty = useSetAtom(setBasketQtyAtom);
  const clear = useSetAtom(clearBasketAtom);
  const rates = (useAtomValue(exchangeRatesAtom) as Record<string, number> | null) || {};
  const setRefNumAtomValue = useSetAtom(expandedRefNumAtom);
  const itemsAll = (useAtomValue(itemsAtom) as any[]) || [];
  const changeVariant = useSetAtom(changeBasketVariantAtom as any);
  const chosenCurrency = (ctxCurrency ?? 'GBP') as DisplayCurrency;
  const usdPerGbp = typeof rates?.USD === 'number' && rates.USD > 0 ? rates.USD : null;
  const headerBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [headerVisible, setHeaderVisible] = useState(true);

  const toGBPFromUSD = useCallback((amountUSD: number | null | undefined) => {
    if (typeof amountUSD !== 'number' || !isFinite(amountUSD)) return 0;
    const gbp = convertToGBP(amountUSD, 'USD', rates);
    return gbp == null ? amountUSD : gbp;
  }, [rates]);

  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (count > 0) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 350);
      return () => clearTimeout(timer);
    }
  }, [count]);

  const groups = useMemo<SellerGroup[]>(() => {
    const map = new Map<string, SellerGroup>();
    for (const it of items) {
      const key = (it?.sellerName || 'unknown').toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          sellerName: it?.sellerName || 'Unknown seller',
          items: [],
          includeShip: false,
          shipUsd: null,
        });
      }
      const group = map.get(key);
      if (!group) continue;
      group.items.push(it);
      if (it?.includeShip && typeof it?.shippingUsd === 'number') {
        group.includeShip = true;
        group.shipUsd = group.shipUsd == null ? it.shippingUsd : Math.min(group.shipUsd, it.shippingUsd);
      }
    }
    return Array.from(map.values());
  }, [items]);

  const totals = useMemo(() => {
    let itemsUsd = 0;
    let itemsGbpLegacy = 0;
    let shipUsdTotal = 0;
    for (const group of groups) {
      for (const it of group.items) {
        const q = typeof it?.qty === 'number' ? it.qty : 1;
        if (typeof it?.priceUSD === 'number') itemsUsd += it.priceUSD * q;
        else if (typeof it?.priceGBP === 'number') itemsGbpLegacy += it.priceGBP * q;
      }
      if (group.includeShip && typeof group.shipUsd === 'number') {
        shipUsdTotal += group.shipUsd;
      }
    }
    const itemsGbp = itemsGbpLegacy + toGBPFromUSD(itemsUsd);
    const shippingGbp = toGBPFromUSD(shipUsdTotal);
    return { itemsGbp, shippingGbp, totalGbp: itemsGbp + shippingGbp };
  }, [groups, toGBPFromUSD]);

  useEffect(() => {
    const el = headerBtnRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setHeaderVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === el) setHeaderVisible(entry.isIntersecting);
      });
    }, { threshold: 0.01 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const body = document.body;
    const originalOverflow = body.style.overflow;
    const originalPaddingRight = body.style.paddingRight;
    const root = document.documentElement;
    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
    let paddingApplied = false;
    if (scrollbarWidth > 0) {
      const computed = window.getComputedStyle(body).paddingRight;
      const basePadding = Number.parseFloat(computed || '0') || 0;
      body.style.paddingRight = `${basePadding + scrollbarWidth}px`;
      paddingApplied = true;
    }
    body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      body.style.overflow = originalOverflow;
      if (paddingApplied) body.style.paddingRight = originalPaddingRight;
    };
  }, [open]);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  const showStickyButton = count > 0 && !headerVisible;

  if (count === 0) return null;

  const renderBadge = () => (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full text-[10px] leading-none px-0.5 font-bold transition-all',
        pulse ? 'animate-pulse bg-blue-600 text-white scale-110' : 'bg-blue-600 dark:bg-blue-500 text-white'
      )}
    >
      {count}
    </span>
  );

  const renderTrigger = (compact = false) => (
    <>
      <svg viewBox="0 0 32 32" className="w-3.5 h-3.5" aria-hidden="true" fill="currentColor">
        <path d="M29.4,8.85A2.48,2.48,0,0,0,27.53,8H14a1,1,0,0,0,0,2H27.53a.47.47,0,0,1,.36.16.48.48,0,0,1,.11.36l-1.45,10A1.71,1.71,0,0,1,24.85,22H14.23a1.72,1.72,0,0,1-1.68-1.33L10,8.79v0h0L9.5,6.87A3.79,3.79,0,0,0,5.82,4H3A1,1,0,0,0,3,6H5.82A1.8,1.8,0,0,1,7.56,7.36L8,9.21H8L10.6,21.09A3.72,3.72,0,0,0,14.23,24H24.85a3.74,3.74,0,0,0,3.68-3.16l1.45-10A2.45,2.45,0,0,0,29.4,8.85Z"/>
        <path d="M16,25H14a1,1,0,0,0,0,2h2a1,1,0,0,0,0-2Z"/>
        <path d="M25,25H23a1,1,0,0,0,0,2h2a1,1,0,0,0,0-2Z"/>
      </svg>
      {!compact && <span className="text-[13px] font-semibold">{t('button')}</span>}
      {renderBadge()}
    </>
  );

  return (
    <>
      <div className="relative">
        <button
          id="basket-button"
          ref={headerBtnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[13px] font-semibold shadow-sm transition-all',
            'bg-white dark:bg-[#0f1725] backdrop-blur-sm border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100',
            'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#141d30]'
          )}
          aria-expanded={open}
          aria-controls="basket-panel"
          title={t('open')}
        >
          {renderTrigger(false)}
        </button>
      </div>

      <AnimatePresence>
        {showStickyButton && (
          <motion.button
            key="basket-floating"
            id="basket-button-floating"
            type="button"
            variants={floatingButtonVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setOpen(true)}
            className={cn(
              'fixed top-4 right-4 z-[120] inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur-sm transition-all',
              'bg-white dark:bg-[#0f1725] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100',
              'hover:shadow-xl hover:bg-gray-50 dark:hover:bg-[#141d30]'
            )}
            aria-label={t('open')}
          >
            {renderTrigger(true)}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="basket-overlay"
              className="fixed inset-0 z-[140] bg-black/40 dark:bg-black/50"
              variants={overlayVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              key="basket-panel"
              id="basket-panel"
              ref={panelRef}
              tabIndex={-1}
              className="fixed inset-y-0 right-0 z-[150] w-full max-w-[520px] bg-white dark:bg-[#0f1725] border-l border-gray-200 dark:border-gray-800 shadow-2xl focus:outline-none"
              variants={drawerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              role="dialog"
              aria-modal="true"
              aria-label={t('header')}
            >
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200/80 dark:border-gray-700/70">
                  <div>
                    <div className="flex items-center gap-2.5 text-base font-semibold text-gray-900 dark:text-gray-100">
                      {t('header')}
                      <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 dark:bg-blue-500 px-1 text-[10px] font-bold text-white">{count}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t('open')}</div>
                      <button
                        type="button"
                        onClick={() => clear()}
                        className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
                      >
                        {t('clear')}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    aria-label={t('close')}
                  >
                    ×
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 custom-scroll">
                  {groups.map((group, idx) => (
                    <SellerSection
                      // eslint-disable-next-line react/no-array-index-key
                      key={`${group.sellerName}-${idx}`}
                      group={group}
                      usdPerGbp={usdPerGbp}
                      rates={rates}
                      chosenCurrency={chosenCurrency}
                      toGBPFromUSD={toGBPFromUSD}
                      setQty={setQty}
                      removeItem={removeItem}
                      setRefNum={(ref) => setRefNumAtomValue(ref == null ? null : String(ref))}
                      itemsAll={itemsAll}
                      changeVariant={changeVariant}
                    />
                  ))}
                </div>

                <div className="border-t border-gray-200/80 dark:border-gray-700/70 bg-gray-50 dark:bg-[#0a1220] px-5 py-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
                    <span>{t('grandTotal')}</span>
                    <span className="text-base font-bold text-gray-900 dark:text-gray-100">{formatGBP(totals.totalGbp, chosenCurrency, rates, { decimals: 2 })}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                    {t('virtualNote')}
                  </p>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

type SellerSectionProps = {
  group: SellerGroup;
  usdPerGbp: number | null;
  rates: Record<string, number>;
  chosenCurrency: DisplayCurrency;
  toGBPFromUSD: (amountUSD: number | null | undefined) => number;
  setQty: (payload: { id: string | number | null; variantId: string | number | null; qty: number }) => void;
  removeItem: (payload: { id: string | number | null; variantId: string | number | null }) => void;
  setRefNum: (ref: string | number | null) => void;
  itemsAll: any[];
  changeVariant: (payload: any) => void;
};

function SellerSection({
  group,
  usdPerGbp,
  rates,
  chosenCurrency,
  toGBPFromUSD,
  setQty,
  removeItem,
  setRefNum,
  itemsAll,
  changeVariant,
}: SellerSectionProps) {
  const t = useTranslations('Basket');
  let itemsUsd = 0;
  let itemsGbpLegacy = 0;
  for (const it of group.items) {
    const q = typeof it?.qty === 'number' ? it.qty : 1;
    if (typeof it?.priceUSD === 'number') itemsUsd += it.priceUSD * q;
    else if (typeof it?.priceGBP === 'number') itemsGbpLegacy += it.priceGBP * q;
  }
  const shipUsd = group.includeShip && typeof group.shipUsd === 'number' ? group.shipUsd : 0;
  const shipGbp = toGBPFromUSD(shipUsd);
  const itemsGbp = itemsGbpLegacy + toGBPFromUSD(itemsUsd);
  const totalGbp = itemsGbp + shipGbp;

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-[#152542]/40 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">{group.sellerName}</div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400">{group.items.length} {t('items')}</div>
      </div>
      <div className="px-4 pb-4 pt-3 space-y-4">
        <ul className="space-y-3">
          {group.items.map((it, idx) => (
            <BasketLine
              key={`${it.id ?? it.refNum ?? 'line'}-${idx}-${it.variantId ?? 'base'}`}
              it={it}
              usdRate={usdPerGbp}
              rates={rates}
              setQty={setQty}
              removeItem={removeItem}
              setRefNum={setRefNum}
              itemsAll={itemsAll}
              changeVariant={changeVariant}
            />
          ))}
        </ul>
        <div className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-center justify-between">
            <span>{t('items')}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{formatGBP(itemsGbp, chosenCurrency, rates, { decimals: 2 })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('shipping')}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{formatGBP(shipGbp, chosenCurrency, rates, { decimals: 2 })}</span>
          </div>
          <div className="flex items-center justify-between pt-1 text-base font-bold text-gray-900 dark:text-gray-100">
            <span>{t('totalIncl')}</span>
            <span>{formatGBP(totalGbp, chosenCurrency, rates, { decimals: 2 })}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

type BasketLineProps = {
  it: BasketEntry;
  usdRate: number | null;
  rates: Record<string, number>;
  setQty: (payload: { id: string | number | null; variantId: string | number | null; qty: number }) => void;
  removeItem: (payload: { id: string | number | null; variantId: string | number | null }) => void;
  setRefNum: (ref: string | number | null) => void;
  itemsAll: any[];
  changeVariant: (payload: any) => void;
};

function BasketLine({ it, usdRate, rates, setQty, removeItem, setRefNum, itemsAll, changeVariant }: BasketLineProps) {
  const t = useTranslations('Basket');
  const { currency: ctxCurrency } = useDisplayCurrency();
  const displayCur = (ctxCurrency ?? 'GBP') as DisplayCurrency;
  const [variantSelectorOpen, setVariantSelectorOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const variantSelectorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const unitGbp = typeof it?.priceUSD === 'number'
    ? (usdRate ? it.priceUSD / usdRate : it.priceUSD)
    : (typeof it?.priceGBP === 'number' ? it.priceGBP : 0);
  const qty = typeof it?.qty === 'number' ? it.qty : 1;
  const lineGbp = unitGbp * qty;

  const detailHref = it.refNum ? `/?ref=${encodeURIComponent(String(it.refNum))}` : '#';
  const biggyHref = it.biggyLink || null;
  const ref = it.refNum || it.id;
  const { detail } = useItemDetailLazy(String(ref ?? ''), false);
  const base = itemsAll.find((b) => (
    (b.refNum && String(b.refNum) === String(ref)) ||
    (b.id && String(b.id) === String(ref))
  )) || null;
  const variantList = Array.isArray(detail?.variants) && detail.variants.length > 0
    ? detail.variants
    : (Array.isArray(base?.variants) ? base.variants : []);

  useEffect(() => {
    if (variantSelectorOpen && variantSelectorRef.current) {
      const rect = variantSelectorRef.current.getBoundingClientRect();
      const basketPanel = document.getElementById('basket-panel');
      const panelRect = basketPanel?.getBoundingClientRect();
      const dropdownWidth = 260;
      const top = rect.bottom + 4;
      let left = rect.left;
      if (panelRect) {
        const rightEdge = left + dropdownWidth;
        if (rightEdge > panelRect.right - 8) left = panelRect.right - dropdownWidth - 8;
        if (left < panelRect.left + 8) left = panelRect.left + 8;
      } else {
        left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8));
      }
      setDropdownPos({ top, left });
    }
  }, [variantSelectorOpen]);

  useEffect(() => {
    if (!variantSelectorOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (variantSelectorRef.current && !variantSelectorRef.current.contains(e.target as Node)) {
        setVariantSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [variantSelectorOpen]);

  const handleQtyChange = (next: number) => {
    if (Number.isNaN(next) || next < 1) return;
    setQty({ id: it.id ?? it.refNum, variantId: it.variantId, qty: next });
  };

  return (
    <li className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#152542]/30 shadow-sm hover:shadow-md transition-all overflow-hidden">
      {it.imageUrl ? (
        <a
          href={detailHref}
          className="shrink-0 group relative"
          title={t('viewDetails')}
          onClick={(e) => {
            if (!it.refNum) return;
            e.preventDefault();
            setRefNum(it.refNum == null ? null : String(it.refNum));
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('ref', String(it.refNum));
              window.history.pushState({}, '', url.toString());
            } catch {}
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.imageUrl} alt="thumb" className="w-20 h-20 rounded-lg object-cover border border-gray-200 dark:border-gray-700 group-hover:border-gray-300 dark:group-hover:border-gray-600 transition-colors" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors pointer-events-none">
            <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
        </a>
      ) : (
        <div className="w-20 h-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5 mb-1">
          {biggyHref ? (
            <a
              href={biggyHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1 text-sm font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
              title={`${it.name} - View on Little Biggy`}
            >
              <span className="truncate">{it.name}</span>
              <svg className="shrink-0 w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                if (!it.refNum) return;
                e.preventDefault();
                setRefNum(it.refNum == null ? null : String(it.refNum));
                try {
                  const url = new URL(window.location.href);
                  url.searchParams.set('ref', String(it.refNum));
                  window.history.pushState({}, '', url.toString());
                } catch {}
              }}
              className="group inline-flex items-center gap-1 text-sm font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors text-left"
              title={`${it.name} - View details`}
            >
              <span className="truncate">{it.name}</span>
              <svg className="shrink-0 w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0 mb-2">
          {it.variantDesc && <div className="text-xs text-gray-600 dark:text-gray-400 truncate px-2 py-0.5 bg-gray-100 dark:bg-gray-700/50 rounded" title={it.variantDesc}>{it.variantDesc}</div>}
          {Array.isArray(variantList) && variantList.length > 0 && (
            <div className="relative shrink-0" ref={variantSelectorRef}>
              <button
                type="button"
                onClick={() => setVariantSelectorOpen((v) => !v)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium cursor-pointer select-none transition-colors"
              >
                {t('change')}
              </button>
              {mounted && variantSelectorOpen && createPortal(
                <div
                  className="fixed z-[200] w-[260px] max-h-56 overflow-auto custom-scroll bg-white/98 dark:bg-[#0f1725]/97 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-1.5 backdrop-blur-xl"
                  style={{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px` }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {variantList.map((variant: any, vi: number) => {
                      const vid = variant.id ?? vi;
                      const isActive = String(vid) === String(it.variantId);
                      const desc = variant.description || variant.desc || t('variant', { num: vi + 1 });
                      const baseAmount = typeof variant.baseAmount === 'number'
                        ? variant.baseAmount
                        : (typeof variant.priceUSD === 'number' ? variant.priceUSD : null);
                      const priceLabel = baseAmount != null
                        ? formatUSD(baseAmount, displayCur, rates, { decimals: 2 })
                        : null;
                      return (
                        <li key={vid}>
                          <button
                            type="button"
                            disabled={isActive}
                            onClick={() => {
                              changeVariant({
                                id: it.id ?? it.refNum,
                                variantId: it.variantId,
                                next: {
                                  variantId: vid,
                                  variantDesc: desc,
                                  priceUSD: baseAmount,
                                },
                              });
                              setVariantSelectorOpen(false);
                            }}
                            className={cn(
                              'w-full text-left px-2 py-1.5 text-[12px] hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded flex items-center justify-between transition-colors',
                              isActive ? 'opacity-60 cursor-default' : ''
                            )}
                          >
                            <span className="truncate pr-2">{desc}</span>
                            {priceLabel && (
                              <span className="shrink-0 font-mono text-[11px] text-gray-700 dark:text-gray-300">{priceLabel}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>,
                document.body
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Qty:</label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => handleQtyChange(Number(e.target.value))}
              className="w-14 h-9 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f1725] px-2 text-center focus:border-gray-300 dark:focus:border-gray-600 focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 outline-none transition-colors"
            />
          </div>
          <div className="ml-auto text-base font-bold text-gray-900 dark:text-gray-100 font-price">
            {formatGBP(lineGbp, displayCur, rates, { decimals: 2 })}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => removeItem({ id: it.id ?? it.refNum, variantId: it.variantId })}
        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800/50 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-xl font-bold transition-all"
        title={t('remove')}
      >
        ×
      </button>
    </li>
  );
}
