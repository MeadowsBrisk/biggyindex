import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import cn from '@/app/cn';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  basketAtom,
  basketCountAtom,
  basketTotalAtom,
  removeFromBasketAtom,
  setBasketQtyAtom,
  clearBasketAtom,
  exchangeRatesAtom,
  expandedRefNumAtom,
} from '@/store/atoms';
import { displayCurrencyAtom } from '@/store/atoms';
import { changeBasketVariantAtom } from '@/store/atoms';
import { useItemDetailLazy } from '@/hooks/useItemDetail';
import { itemsAtom } from '@/store/atoms';

export default function Basket() {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState('header'); // 'header' | 'fab'
  const items = useAtomValue(basketAtom) || [];
  const count = useAtomValue(basketCountAtom);
  const total = useAtomValue(basketTotalAtom);
  const removeItem = useSetAtom(removeFromBasketAtom);
  const setQty = useSetAtom(setBasketQtyAtom);
  const clear = useSetAtom(clearBasketAtom);
  const rates = useAtomValue(exchangeRatesAtom) || {};
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const displayCurrency = useAtomValue(displayCurrencyAtom);
  const itemsAll = useAtomValue(itemsAtom) || [];
  const changeVariant = useSetAtom(changeBasketVariantAtom);
  const usdRate = typeof rates['USD'] === 'number' && rates['USD'] > 0 ? rates['USD'] : null;
  const headerBtnRef = useRef(null);
  const fabBtnRef = useRef(null);
  const [headerVisible, setHeaderVisible] = useState(true);

  // badge pulse on count change
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (count > 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 350);
      return () => clearTimeout(t);
    }
  }, [count]);

  // build per-seller groups
  const groups = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = (it?.sellerName || 'Unknown').toLowerCase();
      if (!map.has(key)) map.set(key, { sellerName: it?.sellerName || 'Unknown seller', items: [], shipUsd: null, includeShip: false });
      const g = map.get(key);
      g.items.push(it);
      if (it?.includeShip && typeof it?.shippingUsd === 'number') {
        g.includeShip = true;
        g.shipUsd = g.shipUsd == null ? it.shippingUsd : Math.min(g.shipUsd, it.shippingUsd);
      }
    }
    return Array.from(map.values());
  }, [items]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const panel = document.getElementById('basket-panel');
      const btn = document.getElementById('basket-button');
      const fab = document.getElementById('basket-fab');
      if (!panel) return;
      const t = e.target;
      if (panel.contains(t) || (btn && btn.contains(t)) || (fab && fab.contains(t))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  // Observe header basket button visibility – show FAB when it's not visible
  useEffect(() => {
    if (!headerBtnRef.current || typeof IntersectionObserver === 'undefined') {
      setHeaderVisible(true);
      return;
    }
    const el = headerBtnRef.current;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === el) {
          setHeaderVisible(entry.isIntersecting);
        }
      }
    }, { root: null, threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [headerBtnRef.current]);

  const showFab = count > 0 && !headerVisible;

  if (count === 0) return null;

  return (
    <div className="relative">
      <button
        id="basket-button"
        type="button"
        ref={headerBtnRef}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            setOrigin('header');
            setOpen(true);
          }
        }}
        className={cn(
          'relative inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm font-semibold shadow-sm',
          'bg-white/85 dark:bg-gray-900/85 backdrop-blur border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100',
          'hover:bg-white dark:hover:bg-gray-900'
        )}
        aria-expanded={open}
        aria-controls="basket-panel"
        title="Open basket"
      >
        <span className="inline-block">Basket</span>
        <span className={cn('ml-1 inline-flex items-center justify-center min-w-5 h-5 rounded-full text-xs px-1 font-bold transition', pulse ? 'animate-pulse bg-blue-600 text-white' : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900')}>{count}</span>
      </button>

      {open && (
        <div className={origin === 'fab' ? 'fixed bottom-20 right-4 z-[60] pointer-events-none' : 'relative'}>
          <div
            id="basket-panel"
            className={cn(
              origin === 'fab'
                ? 'absolute right-[50px] bottom-[20px] w-[92vw] max-w-[460px] max-h-[75vh] overflow-auto custom-scroll pointer-events-auto'
                : 'absolute right-0 mt-2 w-[460px] max-h-[78vh] overflow-auto custom-scroll z-50',
              'rounded-2xl border bg-white dark:bg-gray-800 backdrop-blur supports-[backdrop-filter]:bg-white supports-[backdrop-filter]:dark:bg-gray-800',
              'border-gray-300 dark:border-gray-700 shadow-2xl'
            )}
          >
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">Your "Basket"</div>
            <button
              type="button"
              onClick={() => clear()}
              className="text-xs text-red-600 dark:text-red-400 hover:underline"
            >Clear</button>
          </div>

          <div className="p-3 space-y-4">
            {groups.map((g, gi) => {
              const lines = g.items.map((it, idx) => (
                <BasketLine
                  key={(it.id ?? it.refNum ?? 'x') + '-' + (it.variantId ?? idx)}
                  it={it}
                  idx={idx}
                  usdRate={usdRate}
                  displayCurrency={displayCurrency}
                  setQty={setQty}
                  removeItem={removeItem}
                  setRefNum={setRefNum}
                  itemsAll={itemsAll}
                  changeVariant={changeVariant}
                />
              ));
              // compute sums for this seller group
              let itemsUsd = 0; // sum of USD-priced lines
              let itemsGbpLegacy = 0; // sum of legacy GBP-priced lines
              for (const it of g.items) {
                const q = typeof it?.qty === 'number' ? it.qty : 1;
                if (typeof it?.priceUSD === 'number') itemsUsd += it.priceUSD * q;
                else if (typeof it?.priceGBP === 'number') itemsGbpLegacy += it.priceGBP * q;
              }
              const shipUsd = (g.includeShip && typeof g.shipUsd === 'number') ? g.shipUsd : 0;
              const shipGbp = usdRate ? shipUsd / usdRate : shipUsd;
              const itemsGbp = itemsGbpLegacy + (usdRate ? itemsUsd / usdRate : itemsUsd);
              const totalGbp = itemsGbp + shipGbp;
              const itemsDisplay = displayCurrency === 'USD'
                ? (itemsUsd + (usdRate ? itemsGbpLegacy * usdRate : itemsGbpLegacy))
                : itemsGbp;
              const shipDisplay = displayCurrency === 'USD' ? shipUsd : shipGbp;
              const totalDisplay = displayCurrency === 'USD' ? (itemsDisplay + shipDisplay) : totalGbp;
              return (
                <fieldset key={gi} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                  <legend className="px-2 text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400">{g.sellerName}</legend>
                  <ul className="space-y-2 mb-2">{lines}</ul>
                  <div className="text-[12px] text-gray-600 dark:text-gray-300 flex items-center justify-between">
                    <span>Items</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{displayCurrency === 'USD' ? `$${itemsDisplay.toFixed(2)}` : `£${itemsDisplay.toFixed(2)}`}</span>
                  </div>
                  <div className="text-[12px] text-gray-600 dark:text-gray-300 flex items-center justify-between">
                    <span>Shipping</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{displayCurrency === 'USD' ? `$${shipDisplay.toFixed(2)}` : `£${shipDisplay.toFixed(2)}`}</span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center justify-between">
                    <span>Total (incl. shipping)</span>
                    <span>{displayCurrency === 'USD' ? `$${totalDisplay.toFixed(2)}` : `£${totalDisplay.toFixed(2)}`}</span>
                  </div>
                </fieldset>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-300">Grand total</div>
            {(() => {
              // Recompute a display grand total consistent with group breakdowns
              let itemsUsd = 0, itemsGbpLegacy = 0, shipUsdTotal = 0;
              const usdRate = typeof rates['USD'] === 'number' && rates['USD'] > 0 ? rates['USD'] : null;
              const groups = (() => {
                const map = new Map();
                for (const it of items) {
                  const key = (it?.sellerName || 'Unknown').toLowerCase();
                  if (!map.has(key)) map.set(key, { items: [], shipUsd: null, includeShip: false });
                  const g = map.get(key);
                  g.items.push(it);
                  if (it?.includeShip && typeof it?.shippingUsd === 'number') {
                    g.includeShip = true;
                    g.shipUsd = g.shipUsd == null ? it.shippingUsd : Math.min(g.shipUsd, it.shippingUsd);
                  }
                }
                return Array.from(map.values());
              })();
              for (const g of groups) {
                for (const it of g.items) {
                  const q = typeof it?.qty === 'number' ? it.qty : 1;
                  if (typeof it?.priceUSD === 'number') itemsUsd += it.priceUSD * q;
                  else if (typeof it?.priceGBP === 'number') itemsGbpLegacy += it.priceGBP * q;
                }
                if (g.includeShip && typeof g.shipUsd === 'number') shipUsdTotal += g.shipUsd;
              }
              const itemsGbp = itemsGbpLegacy + (usdRate ? itemsUsd / usdRate : itemsUsd);
              const totalGbp = itemsGbp + (usdRate ? shipUsdTotal / usdRate : shipUsdTotal);
              const totalUsd = itemsUsd + (usdRate ? itemsGbpLegacy * usdRate : itemsGbpLegacy) + shipUsdTotal;
              const display = displayCurrency === 'USD' ? `$${totalUsd.toFixed(2)}` : `£${totalGbp.toFixed(2)}`;
              return <div className="text-base font-bold text-gray-900 dark:text-gray-100">{display}</div>;
            })()}
          </div>
          <div className="px-4 py-2 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            This is just a virtual basket for calculating costs. Follow the links to Biggy above.<br />
              {/*Actual costs may be slightly higher depending on */}
          </div>
          </div>
        </div>
      )}

      {showFab && (
        <button
          id="basket-fab"
          ref={fabBtnRef}
          type="button"
          onClick={() => {
            if (open) {
              setOpen(false);
            } else {
              setOrigin('fab');
              setOpen(true);
            }
          }}
          className={cn(
            'fixed bottom-16 right-4 z-[55] inline-flex items-center justify-center w-12 h-12 rounded-full border shadow-lg backdrop-blur-sm transition',
            'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100',
            'hover:bg-white dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-gray-800'
          )}
          aria-label="Open basket"
          title="Open basket"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 10h12l-1.4 8H7.4L6 10z" />
            <path d="M8 10l4-5 4 5" />
            <path d="M7 13h10M8 16h8" />
          </svg>
          {count > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-4 h-4 rounded-full text-[7px] px-1 font-bold bg-black dark:bg-[#c2c2c2] dark:text-black text-white">
              {count}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

function BasketLine({ it, idx, usdRate, displayCurrency, setQty, removeItem, setRefNum, itemsAll, changeVariant }) {
  const [variantSelectorOpen, setVariantSelectorOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const variantSelectorRef = useRef(null);
  
  useEffect(() => { setMounted(true); }, []);
  
  const unitGbp = typeof it?.priceUSD === 'number'
    ? (usdRate ? it.priceUSD / usdRate : it.priceUSD)
    : (typeof it?.priceGBP === 'number' ? it.priceGBP : 0);
  const q = typeof it?.qty === 'number' ? it.qty : 1;
  const lineGbp = unitGbp * q;
  const lineDisplay = displayCurrency === 'USD'
    ? (typeof it?.priceUSD === 'number' ? (it.priceUSD * q) : (typeof it?.priceGBP === 'number' && usdRate ? (it.priceGBP * usdRate * q) : (it.priceGBP * q)))
    : lineGbp;
  const detailHref = it.refNum ? `/?ref=${encodeURIComponent(it.refNum)}` : '#';
  const biggyHref = it.biggyLink || null;
  const ref = it.refNum || it.id;
  const { detail } = useItemDetailLazy(String(ref), false);
  const base = itemsAll.find(b => (b.refNum && String(b.refNum) === String(ref)) || (b.id && String(b.id) === String(ref))) || null;
  const variantList = Array.isArray(detail?.variants) && detail.variants.length > 0
    ? detail.variants
    : (Array.isArray(base?.variants) ? base.variants : []);

  // Update position when opening
  useEffect(() => {
    if (variantSelectorOpen && variantSelectorRef.current) {
      const rect = variantSelectorRef.current.getBoundingClientRect();
      const basketPanel = document.getElementById('basket-panel');
      const panelRect = basketPanel?.getBoundingClientRect();
      
      const dropdownWidth = 260;
      const top = rect.bottom + 4;
      
      // Position dropdown near the button, but ensure it doesn't overflow the basket panel
      let left = rect.left;
      
      if (panelRect) {
        // If dropdown would extend beyond basket panel's right edge, shift it left
        const rightEdge = left + dropdownWidth;
        if (rightEdge > panelRect.right - 8) {
          left = panelRect.right - dropdownWidth - 8;
        }
        // If dropdown would extend beyond basket panel's left edge, shift it right
        if (left < panelRect.left + 8) {
          left = panelRect.left + 8;
        }
      } else {
        // Fallback: ensure it stays within viewport
        left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8));
      }
      
      setDropdownPos({ top, left });
    }
  }, [variantSelectorOpen]);

  // Close variant selector on outside click
  useEffect(() => {
    if (!variantSelectorOpen) return;
    const onDown = (e) => {
      if (variantSelectorRef.current && !variantSelectorRef.current.contains(e.target)) {
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

  return (
    <li className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/50">
      {it.imageUrl ? (
        <a
          href={detailHref}
          className="shrink-0"
          title="View details"
          onClick={(e) => {
            if (!it.refNum) return;
            e.preventDefault();
            setRefNum(String(it.refNum));
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('ref', String(it.refNum));
              window.history.pushState({}, '', url.toString());
            } catch {}
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.imageUrl} alt="thumb" className="w-12 h-12 rounded object-cover border border-gray-200 dark:border-gray-700" />
        </a>
      ) : (
        <div className="w-12 h-12 rounded bg-gray-200 dark:bg-gray-700" />
      )}
      <div className="min-w-0 flex-1">
        {biggyHref ? (
          <a href={biggyHref} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline truncate" title={`${it.name} (opens Biggy)`}>{it.name}</a>
        ) : (
          <a href={detailHref} className="text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline truncate" title={it.name}>{it.name}</a>
        )}
        <div className="flex items-center gap-2 min-w-0">
          {it.variantDesc && <div className="text-[11px] text-gray-600 dark:text-gray-300 truncate" title={it.variantDesc}>{it.variantDesc}</div>}
          {Array.isArray(variantList) && variantList.length > 0 && (
            <div className="relative shrink-0" ref={variantSelectorRef}>
              <button
                type="button"
                onClick={() => setVariantSelectorOpen(!variantSelectorOpen)}
                className="text-[11px] text-blue-700 dark:text-blue-300 hover:underline cursor-pointer select-none"
              >
                Change
              </button>
              {mounted && variantSelectorOpen && createPortal(
                <div 
                  className="fixed z-[100] w-[260px] max-h-56 overflow-auto custom-scroll bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-1" 
                  style={{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px` }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {variantList.map((v, vi) => {
                    const vid = v.id ?? vi;
                    const isActive = String(vid) === String(it.variantId);
                    const desc = v.description || v.desc || `Variant ${vi + 1}`;
                    const baseAmount = typeof v.baseAmount === 'number' ? v.baseAmount : (typeof v.priceUSD === 'number' ? v.priceUSD : null);
                    // Convert to display currency
                    const displayAmount = baseAmount != null
                      ? (displayCurrency === 'USD' ? baseAmount : (usdRate ? baseAmount / usdRate : baseAmount))
                      : null;
                    const priceLabel = displayAmount != null
                      ? (displayCurrency === 'USD' ? `$${displayAmount.toFixed(2)}` : `£${displayAmount.toFixed(2)}`)
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
                            'w-full text-left px-2 py-1.5 text-[12px] hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center justify-between',
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
              </div>, document.body
              )}
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={q}
            onChange={(e) => setQty({ id: it.id ?? it.refNum, variantId: it.variantId, qty: Number(e.target.value) })}
            className="w-16 h-7 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2"
          />
          <div className="ml-auto text-sm font-semibold text-gray-900 dark:text-gray-100">{displayCurrency === 'USD' ? `$${lineDisplay.toFixed(2)}` : `£${lineDisplay.toFixed(2)}`}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => removeItem({ id: it.id ?? it.refNum, variantId: it.variantId })}
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
        title="Remove"
      >×</button>
    </li>
  );
}
