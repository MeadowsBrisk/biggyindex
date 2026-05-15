"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Check,
  ExternalLink,
  Eye,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cn";
import { fmtPrice } from "@/lib/format";
import { getLittleBiggyItemUrl } from "@/lib/tracking/littlebiggy";
import type { Item } from "@/lib/types";
import {
  itemVariantContext,
  parseVariant,
  pricePerUnit,
  UNIT_DISPLAY_LABEL,
} from "@/lib/variants";
import {
  type BasketEntry,
  basketAtom,
  basketCountAtom,
  basketOpenAtom,
  basketShipSelectionAtom,
  changeBasketVariantAtom,
  clearBasketAtom,
  currencyDisplayAtom,
  expandedRefNumAtom,
  itemsAtom,
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
  const t = useTranslations("basket");
  const [open, setOpen] = useAtom(basketOpenAtom);
  const items = useAtomValue(basketAtom);
  const count = useAtomValue(basketCountAtom);
  const removeItem = useSetAtom(removeFromBasketAtom);
  const setQty = useSetAtom(setBasketQtyAtom);
  const changeVariant = useSetAtom(changeBasketVariantAtom);
  const clear = useSetAtom(clearBasketAtom);
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const browseItems = useAtomValue(itemsAtom);
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
      } else if (it.includeShip && it.shippingUsd != null) {
        const fallbackLabel = t("shipping");
        if (!g.shOpts.some((o) => o.label === fallbackLabel)) {
          g.shOpts.push({ label: fallbackLabel, cost: it.shippingUsd });
        }
      }
    }
    // Sort options cheapest-first for nicer UX
    for (const g of map.values()) g.shOpts.sort((a, b) => a.cost - b.cost);
    return Array.from(map.values());
  }, [items, t]);

  const itemByRef = useMemo(() => {
    const map = new Map<string, Item>();
    for (const item of browseItems) {
      map.set(String(item.refNum ?? item.id), item);
    }
    return map;
  }, [browseItems]);

  // Resolve the selected shipping cost for a given group.
  // Selection is stored by label; unknown/missing defaults to cheapest real shipping.
  const resolveShipCost = useCallback(
    (g: SellerGroup): { label: string | null; cost: number } => {
      if (g.shOpts.length === 0) return { label: null, cost: 0 };
      const sel = shipSelection[g.key];
      if (!sel) return { label: g.shOpts[0].label, cost: g.shOpts[0].cost };
      const match = g.shOpts.find((o) => o.label === sel);
      if (!match) return { label: g.shOpts[0].label, cost: g.shOpts[0].cost };
      return { label: match.label, cost: match.cost };
    },
    [shipSelection],
  );

  const setShipForGroup = useCallback(
    (key: string, label: string) => {
      setShipSelection((prev) => {
        return { ...prev, [key]: label };
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
        aria-label={t("label")}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2.5 text-base font-semibold text-foreground">
              <ShoppingCart size={18} />
              {t("label")}
              {count > 0 && (
                <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
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
                  {t("clearAll")}
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted hover:bg-surface cursor-pointer"
                aria-label={t("close")}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {items.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">
                {t("empty")}
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
                const shippingSelectId = `basket-shipping-${group.key.replace(/[^a-z0-9_-]/gi, "-")}`;
                return (
                  <section
                    key={group.key}
                    className="rounded-xl border border-border bg-surface/50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 pt-3">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted">
                        {group.sellerName}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {t("sellerItemCount", { count: group.items.length })}
                      </span>
                    </div>
                    <div className="px-4 pb-4 pt-3 space-y-3">
                      {group.items.map((entry) => (
                        <BasketLine
                          key={`${entry.refNum}-${entry.variantId}`}
                          entry={entry}
                          cSym={cSym}
                          cRate={cRate}
                          item={itemByRef.get(entry.refNum) ?? null}
                          setQty={setQty}
                          changeVariant={changeVariant}
                          removeItem={removeItem}
                          onItemClick={() => {
                            close();
                            setTimeout(() => setRefNum(entry.refNum), 220);
                          }}
                        />
                      ))}

                      {hasOptions && (
                        <div className="pt-2">
                          <label
                            htmlFor={shippingSelectId}
                            className="mb-1 block text-[11px] font-medium text-muted"
                          >
                            {t("shipping")}
                          </label>
                          <select
                            id={shippingSelectId}
                            value={
                              selectedLabel ?? group.shOpts[0]?.label ?? ""
                            }
                            onChange={(e) =>
                              setShipForGroup(group.key, e.target.value)
                            }
                            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
                          >
                            {group.shOpts.map((o) => (
                              <option key={o.label} value={o.label}>
                                {o.label} — {fmtPrice(o.cost, cSym, cRate)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="space-y-1 border-t border-border pt-2 text-xs text-muted">
                        <div className="flex justify-between">
                          <span>{t("items")}</span>
                          <span className="font-semibold text-foreground">
                            {fmtPrice(itemsTotal, cSym, cRate)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>
                            {t("shipping")}
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
                          <span>{t("total")}</span>
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
            <div className="border-t border-border bg-surface px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{t("total")}</span>
                <span className="text-base font-bold text-foreground">
                  {fmtPrice(total, cSym, cRate)}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                {t("virtualNotice")}
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
  item: Item | null;
  setQty: (p: { refNum: string; variantId: string; qty: number }) => void;
  changeVariant: (p: {
    refNum: string;
    variantId: string;
    next: { variantId: string; variantDesc: string; priceUSD: number };
  }) => void;
  removeItem: (p: { refNum: string; variantId: string }) => void;
  onItemClick: () => void;
}

function BasketLine({
  entry,
  cSym,
  cRate,
  item,
  setQty,
  changeVariant,
  removeItem,
  onItemClick,
}: BasketLineProps) {
  const t = useTranslations("basket");
  const [variantSelectorOpen, setVariantSelectorOpen] = useState(false);
  const [variantMenuPosition, setVariantMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 300,
  });
  const [mounted, setMounted] = useState(false);
  const variantSelectorRef = useRef<HTMLDivElement | null>(null);
  const variantDropdownRef = useRef<HTMLDivElement | null>(null);
  const lineTotal = entry.priceUSD * entry.qty;
  const littleBiggyUrl = getLittleBiggyItemUrl(entry);
  const variants = useMemo(
    () => (item?.v ?? []).filter((variant) => variant.usd > 0),
    [item],
  );
  const variantContext = useMemo(
    () => (item ? itemVariantContext(item) : entry.name),
    [entry.name, item],
  );
  const variantOptions = useMemo(
    () =>
      variants.map((variant, index) => {
        const parsed = parseVariant(variant, variantContext);
        const ppu = pricePerUnit(variant.usd, parsed);
        return {
          id: String(variant.vid ?? index),
          label: variant.d || variant.dEn || t("variant"),
          priceUSD: variant.usd,
          ppuLabel:
            ppu != null && parsed
              ? `${fmtPrice(ppu, cSym, cRate)}/${UNIT_DISPLAY_LABEL[parsed.unit] ?? parsed.unit}`
              : null,
        };
      }),
    [cRate, cSym, variantContext, variants, t],
  );
  const activeVariantLabel = entry.variantDesc || t("variant");

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateVariantMenuPosition = useCallback(() => {
    const trigger = variantSelectorRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - width - 8),
    );
    const menuHeight = 256;
    const hasRoomBelow = rect.bottom + menuHeight + 8 <= window.innerHeight;
    const top = hasRoomBelow
      ? rect.bottom + 6
      : Math.max(8, rect.top - menuHeight - 6);
    setVariantMenuPosition({ top, left, width });
  }, []);

  useEffect(() => {
    if (!variantSelectorOpen) return;
    updateVariantMenuPosition();

    const onDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (variantSelectorRef.current?.contains(target)) return;
      if (variantDropdownRef.current?.contains(target)) return;
      setVariantSelectorOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVariantSelectorOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", updateVariantMenuPosition);
    window.addEventListener("scroll", updateVariantMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", updateVariantMenuPosition);
      window.removeEventListener("scroll", updateVariantMenuPosition, true);
    };
  }, [variantSelectorOpen, updateVariantMenuPosition]);

  return (
    <>
      <div className="flex items-start gap-4 rounded-xl border border-border bg-card/70 p-4 shadow-sm transition-shadow hover:shadow-md">
        {entry.imageUrl ? (
          <button
            type="button"
            onClick={onItemClick}
            aria-label={t("viewItem", { item: entry.name })}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-surface cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          >
            <Image
              src={entry.imageUrl}
              alt={entry.name}
              width={80}
              height={80}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25 group-focus-visible:bg-black/25">
              <Eye className="size-5 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </span>
          </button>
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-lg border border-border bg-surface" />
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start gap-1.5">
            {littleBiggyUrl ? (
              <a
                href={littleBiggyUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={t("viewOnLittleBiggy", { item: entry.name })}
                className="group inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground transition-colors hover:text-primary"
              >
                <span className="truncate">{entry.name}</span>
                <ExternalLink
                  size={13}
                  className="shrink-0 opacity-55 transition-opacity group-hover:opacity-100"
                />
              </a>
            ) : (
              <button
                type="button"
                onClick={onItemClick}
                aria-label={t("viewItem", { item: entry.name })}
                className="block w-full truncate text-left text-sm font-semibold text-foreground transition-colors hover:text-primary cursor-pointer"
              >
                {entry.name}
              </button>
            )}
          </div>

          <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
            <span
              className="max-w-full truncate rounded-md bg-surface px-2 py-1 text-xs text-muted"
              title={activeVariantLabel}
            >
              {activeVariantLabel}
            </span>
            {variantOptions.length > 1 && (
              <div className="relative shrink-0" ref={variantSelectorRef}>
                <button
                  type="button"
                  aria-label={t("changeVariant", { item: entry.name })}
                  aria-expanded={variantSelectorOpen}
                  onClick={() => {
                    if (!variantSelectorOpen) updateVariantMenuPosition();
                    setVariantSelectorOpen((value) => !value);
                  }}
                  className="inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-surface-hover cursor-pointer"
                >
                  {t("change")}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-medium text-primary">
              {fmtPrice(entry.priceUSD, cSym, cRate)} {t("each")}
            </div>
            <div className="ml-auto flex items-center gap-3">
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
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer"
                  aria-label={t(entry.qty <= 1 ? "removeItem" : "decreaseQty", {
                    item: entry.name,
                  })}
                >
                  {entry.qty <= 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                </button>
                <span className="w-7 text-center text-sm font-semibold tabular-nums text-foreground">
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
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer"
                  aria-label={t("increaseQty", { item: entry.name })}
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="min-w-20 text-right text-base font-bold tabular-nums text-foreground">
                {fmtPrice(lineTotal, cSym, cRate)}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            removeItem({ refNum: entry.refNum, variantId: entry.variantId })
          }
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
          aria-label={t("removeItem", { item: entry.name })}
        >
          <X size={15} />
        </button>
      </div>

      {mounted &&
        variantSelectorOpen &&
        createPortal(
          <div
            ref={variantDropdownRef}
            className="fixed z-320 max-h-64 overflow-auto rounded-lg border border-border bg-card/98 p-1.5 shadow-2xl backdrop-blur-xl"
            style={variantMenuPosition}
          >
            <ul className="divide-y divide-border/70">
              {variantOptions.map((option) => {
                const isActive = option.id === String(entry.variantId);
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={isActive}
                      title={option.label}
                      onClick={() => {
                        changeVariant({
                          refNum: entry.refNum,
                          variantId: entry.variantId,
                          next: {
                            variantId: option.id,
                            variantDesc: option.label,
                            priceUSD: option.priceUSD,
                          },
                        });
                        setVariantSelectorOpen(false);
                      }}
                      className={cx(
                        "flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
                        isActive
                          ? "cursor-default bg-primary/10 text-primary"
                          : "text-foreground hover:bg-surface-hover cursor-pointer",
                      )}
                    >
                      <span className="min-w-0 flex-1 whitespace-normal wrap-break-word leading-snug">
                        {option.label}
                      </span>
                      <span className="flex shrink-0 items-start gap-1.5 text-right tabular-nums">
                        <span className="flex flex-col items-end">
                          <span className="text-[11px] font-semibold text-muted">
                            {fmtPrice(option.priceUSD, cSym, cRate)}
                          </span>
                          {option.ppuLabel && (
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {option.ppuLabel}
                            </span>
                          )}
                        </span>
                        {isActive && (
                          <Check size={14} className="mt-0.5 text-primary" />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
