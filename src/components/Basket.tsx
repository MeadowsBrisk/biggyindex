"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/cn";
import { fmtPrice } from "@/lib/format";
import {
  type BasketEntry,
  basketAtom,
  basketCountAtom,
  basketOpenAtom,
  basketShipSelectionAtom,
  clearBasketAtom,
  currencyDisplayAtom,
  expandedRefNumAtom,
  removeFromBasketAtom,
  setBasketQtyAtom,
} from "@/store/atoms";

interface SellerGroup {
  /** Stable key — lowercased seller name (matches basketShipSelectionAtom key) */
  key: string;
  sellerName: string;
  items: BasketEntry[];
  /** Union of shipping options across items in this group, deduped by label */
  shOpts: { label: string; cost: number }[];
}

export function Basket() {
  const [open, setOpen] = useAtom(basketOpenAtom);
  const items = useAtomValue(basketAtom);
  const count = useAtomValue(basketCountAtom);
  const removeItem = useSetAtom(removeFromBasketAtom);
  const setQty = useSetAtom(setBasketQtyAtom);
  const clear = useSetAtom(clearBasketAtom);
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const [shipSelection, setShipSelection] = useAtom(basketShipSelectionAtom);
  const { symbol: cSym, rate: cRate } = useAtomValue(currencyDisplayAtom);
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setOpen(false);
    }, 200);
  }, [setOpen]);

  // Escape key + body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  // Focus panel on open
  useEffect(() => {
    if (open && panelRef.current) panelRef.current.focus();
  }, [open]);

  // Group items by seller
  const groups = useMemo<SellerGroup[]>(() => {
    const map = new Map<string, SellerGroup>();
    for (const it of items) {
      const key = (it.sellerName || "unknown").toLowerCase();
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          sellerName: it.sellerName || "Unknown",
          items: [],
          shOpts: [],
        };
        map.set(key, g);
      }
      g.items.push(it);
      // Merge shipping options from all entries of this seller, deduped by label.
      if (it.shOpts && it.shOpts.length > 0) {
        const seen = new Set(g.shOpts.map((o) => o.label.toLowerCase()));
        for (const o of it.shOpts) {
          const k = o.label.toLowerCase();
          if (!seen.has(k)) {
            seen.add(k);
            g.shOpts.push(o);
          }
        }
      }
    }
    // Sort options cheapest-first for nicer UX
    for (const g of map.values()) g.shOpts.sort((a, b) => a.cost - b.cost);
    return Array.from(map.values());
  }, [items]);

  // Resolve the selected shipping cost for a given group.
  // Selection is stored by label; unknown/missing → no shipping ($0).
  const resolveShipCost = useCallback(
    (g: SellerGroup): { label: string | null; cost: number } => {
      const sel = shipSelection[g.key];
      if (!sel) return { label: null, cost: 0 };
      const match = g.shOpts.find((o) => o.label === sel);
      if (!match) return { label: null, cost: 0 };
      return { label: match.label, cost: match.cost };
    },
    [shipSelection],
  );

  const setShipForGroup = useCallback(
    (key: string, label: string | null) => {
      setShipSelection((prev) => {
        const next = { ...prev };
        if (label == null) delete next[key];
        else next[key] = label;
        return next;
      });
    },
    [setShipSelection],
  );

  // Total
  const total = useMemo(() => {
    let sum = 0;
    for (const it of items) sum += it.priceUSD * it.qty;
    for (const g of groups) sum += resolveShipCost(g).cost;
    return sum;
  }, [items, groups, resolveShipCost]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={cx("basket-overlay", closing && "basket-overlay--closing")}
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={panelRef}
        tabIndex={-1}
        className={cx("basket-drawer", closing && "basket-drawer--closing")}
        role="dialog"
        aria-modal="true"
        aria-label="Basket"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-2.5 text-base font-semibold text-foreground">
              <ShoppingCart size={18} />
              Basket
              {count > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => clear()}
                  className="text-xs font-semibold text-red-500 hover:underline cursor-pointer"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-muted hover:bg-surface cursor-pointer"
                aria-label="Close basket"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {items.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">
                Your basket is empty.
              </p>
            ) : (
              groups.map((group) => {
                const itemsTotal = group.items.reduce(
                  (s, e) => s + e.priceUSD * e.qty,
                  0,
                );
                const { label: selectedLabel, cost: shipCost } =
                  resolveShipCost(group);
                const sellerTotal = itemsTotal + shipCost;
                const hasOptions = group.shOpts.length > 0;
                return (
                  <section
                    key={group.key}
                    className="rounded-xl border border-[var(--border)] bg-surface/50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 pt-3">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted">
                        {group.sellerName}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {group.items.length} item
                        {group.items.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="px-4 pb-3 pt-2 space-y-2">
                      {group.items.map((entry) => (
                        <BasketLine
                          key={`${entry.refNum}-${entry.variantId}`}
                          entry={entry}
                          cSym={cSym}
                          cRate={cRate}
                          setQty={setQty}
                          removeItem={removeItem}
                          onItemClick={() => {
                            close();
                            setTimeout(() => setRefNum(entry.refNum), 220);
                          }}
                        />
                      ))}

                      {hasOptions && (
                        <div className="pt-2">
                          <label className="mb-1 block text-[11px] font-medium text-muted">
                            Shipping
                          </label>
                          <select
                            value={selectedLabel ?? ""}
                            onChange={(e) =>
                              setShipForGroup(group.key, e.target.value || null)
                            }
                            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
                          >
                            <option value="">
                              No shipping — {fmtPrice(0, cSym, cRate)}
                            </option>
                            {group.shOpts.map((o) => (
                              <option key={o.label} value={o.label}>
                                {o.label} — {fmtPrice(o.cost, cSym, cRate)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="space-y-1 border-t border-[var(--border)] pt-2 text-xs text-muted">
                        <div className="flex justify-between">
                          <span>Items</span>
                          <span className="font-semibold text-foreground">
                            {fmtPrice(itemsTotal, cSym, cRate)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>
                            Shipping
                            {selectedLabel && (
                              <span className="ml-1 text-muted-foreground">
                                ({selectedLabel})
                              </span>
                            )}
                          </span>
                          <span className="font-semibold text-foreground">
                            {hasOptions ? fmtPrice(shipCost, cSym, cRate) : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 text-sm font-bold text-foreground">
                          <span>Total</span>
                          <span>{fmtPrice(sellerTotal, cSym, cRate)}</span>
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })
            )}
          </div>

          {/* Footer totals */}
          {items.length > 0 && (
            <div className="border-t border-[var(--border)] bg-surface px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Total</span>
                <span className="text-base font-bold text-foreground">
                  {fmtPrice(total, cSym, cRate)}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                This is a virtual basket for price comparison — no checkout.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/* ── Basket line item ── */

interface BasketLineProps {
  entry: BasketEntry;
  cSym: string;
  cRate: number;
  setQty: (p: { refNum: string; variantId: string; qty: number }) => void;
  removeItem: (p: { refNum: string; variantId: string }) => void;
  onItemClick: () => void;
}

function BasketLine({
  entry,
  cSym,
  cRate,
  setQty,
  removeItem,
  onItemClick,
}: BasketLineProps) {
  const lineTotal = entry.priceUSD * entry.qty;

  return (
    <div className="flex gap-3 rounded-lg border border-[var(--border)] p-3">
      {/* Image */}
      {entry.imageUrl && (
        <button
          type="button"
          onClick={onItemClick}
          className="flex-shrink-0 w-14 h-14 rounded-md overflow-hidden bg-surface cursor-pointer"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.imageUrl}
            alt={entry.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      )}

      {/* Details */}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onItemClick}
          className="text-sm font-medium text-foreground hover:text-primary truncate block w-full text-left cursor-pointer"
        >
          {entry.name}
        </button>
        <div className="text-xs text-muted truncate">{entry.variantDesc}</div>
        <div className="mt-1 text-xs font-medium text-primary">
          {fmtPrice(entry.priceUSD, cSym, cRate)} each
        </div>
      </div>

      {/* Qty + total */}
      <div className="flex flex-col items-end gap-1">
        <div className="text-sm font-semibold text-foreground">
          {fmtPrice(lineTotal, cSym, cRate)}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              entry.qty <= 1
                ? removeItem({
                    refNum: entry.refNum,
                    variantId: entry.variantId,
                  })
                : setQty({
                    refNum: entry.refNum,
                    variantId: entry.variantId,
                    qty: entry.qty - 1,
                  })
            }
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] text-muted hover:bg-surface cursor-pointer"
          >
            {entry.qty <= 1 ? <Trash2 size={12} /> : <Minus size={12} />}
          </button>
          <span className="w-6 text-center text-xs font-medium text-foreground">
            {entry.qty}
          </span>
          <button
            type="button"
            onClick={() =>
              setQty({
                refNum: entry.refNum,
                variantId: entry.variantId,
                qty: entry.qty + 1,
              })
            }
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] text-muted hover:bg-surface cursor-pointer"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
