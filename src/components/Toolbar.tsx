"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Heart,
  LayoutGrid,
  List,
  Package,
  Truck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  useTransition,
} from "react";
import { FilterToggle } from "@/components/FilterPanel";
import type { SortKey } from "@/lib/types";
import {
  attrFiltersAtom,
  availableSellersAtom,
  bookmarksAtom,
  bookmarksOnlyAtom,
  categoryAtom,
  excludedShipFromAtom,
  filteredItemsAtom,
  freeShippingOnlyAtom,
  includeShippingAtom,
  itemsAtom,
  priceRangeAtom,
  searchQueryAtom,
  selectedSellersAtom,
  selectedShipFromAtom,
  selectedWeightsAtom,
  sortDirAtom,
  sortKeyAtom,
  subcategoryAtom,
  viewModeAtom,
} from "@/store/atoms";

/**
 * Toolbar — sticky at the top of the viewport (header scrolls away above it).
 * BiggyIndex-distinct: hotness indicator, bookmark toggle.
 */
export function Toolbar() {
  const ref = useRef<HTMLDivElement>(null);

  // Publish the live toolbar height to `--toolbar-h` so the filter sidebar
  // (which is sticky below the toolbar) can pin flush against it. The toolbar
  // changes height across breakpoints (mobile gets a 2nd row) so a hardcoded
  // `top-[44px]` left visible gaps / overlaps when scrolling.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--toolbar-h",
        `${Math.round(h)}px`,
      );
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/78 dark:bg-[var(--background)]/80 backdrop-blur-[28px]"
      data-tour="toolbar"
    >
      {/* Row 1: action buttons + count + sort */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-1 sm:pb-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <FilterToggle />
          <BookmarkToggle />
          <ShippingToggle />
          <FreeShippingToggle />
          <ViewModeToggle />
        </div>

        {/* Active filter pills — scrollable between buttons and sort */}
        <div className="min-w-0 flex-1 overflow-hidden basis-full sm:basis-auto">
          <ActivePills />
        </div>

        {/* Desktop: result count + sort */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <ResultCount />
          <SortPills />
        </div>
      </div>

      {/* Row 2 (mobile only): result count + sort select */}
      <div className="flex sm:hidden items-center justify-between gap-2 px-4 pb-2">
        <ResultCount mobile />
        <SortSelect />
      </div>
    </div>
  );
}

// ─── Active filter pills ───────────────────────────────────────────

function ActivePills() {
  const t = useTranslations("browse.toolbar");
  const search = useAtomValue(searchQueryAtom);
  const setSearch = useSetAtom(searchQueryAtom);
  const category = useAtomValue(categoryAtom);
  const setCategory = useSetAtom(categoryAtom);
  const subcategory = useAtomValue(subcategoryAtom);
  const setSubcategory = useSetAtom(subcategoryAtom);
  const sellers = useAtomValue(selectedSellersAtom);
  const setSellers = useSetAtom(selectedSellersAtom);
  const allSellers = useAtomValue(availableSellersAtom);
  const shipInclude = useAtomValue(selectedShipFromAtom);
  const setShipInclude = useSetAtom(selectedShipFromAtom);
  const shipExclude = useAtomValue(excludedShipFromAtom);
  const setShipExclude = useSetAtom(excludedShipFromAtom);
  const weights = useAtomValue(selectedWeightsAtom);
  const setWeights = useSetAtom(selectedWeightsAtom);
  const attrs = useAtomValue(attrFiltersAtom);
  const setAttrs = useSetAtom(attrFiltersAtom);
  const priceRange = useAtomValue(priceRangeAtom);
  const setPriceRange = useSetAtom(priceRangeAtom);
  const freeOnly = useAtomValue(freeShippingOnlyAtom);
  const setFreeOnly = useSetAtom(freeShippingOnlyAtom);
  const [, startTransition] = useTransition();

  const sellerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSellers) map.set(s.id, s.name);
    return map;
  }, [allSellers]);

  const pills = useMemo(() => {
    const p: { label: string; clear: () => void }[] = [];

    if (search.trim()) {
      p.push({
        label: `"${search}"`,
        clear: () => startTransition(() => setSearch("")),
      });
    }
    if (category !== "All") {
      p.push({
        label: category,
        clear: () =>
          startTransition(() => {
            setCategory("All");
            setSubcategory([]);
          }),
      });
    }
    for (const sc of subcategory) {
      p.push({
        label: sc,
        clear: () =>
          startTransition(() =>
            setSubcategory((prev) => prev.filter((s) => s !== sc)),
          ),
      });
    }
    for (const sid of sellers) {
      const name = sellerMap.get(sid) ?? `#${sid}`;
      p.push({
        label: name,
        clear: () =>
          startTransition(() =>
            setSellers((prev) => prev.filter((s) => s !== sid)),
          ),
      });
    }
    for (const sf of shipInclude) {
      p.push({
        label: t("fromFilter", { value: sf }),
        clear: () =>
          startTransition(() =>
            setShipInclude((prev) => prev.filter((v) => v !== sf)),
          ),
      });
    }
    for (const sf of shipExclude) {
      p.push({
        label: t("notFilter", { value: sf }),
        clear: () =>
          startTransition(() =>
            setShipExclude((prev) => prev.filter((v) => v !== sf)),
          ),
      });
    }
    // Free shipping pill omitted — already visible as toolbar toggle
    for (const w of weights) {
      p.push({
        label: `${w}g`,
        clear: () =>
          startTransition(() =>
            setWeights((prev) => prev.filter((g) => g !== w)),
          ),
      });
    }
    if (priceRange.min > 0 || priceRange.max < Infinity) {
      p.push({
        label: t("priceRange"),
        clear: () =>
          startTransition(() => setPriceRange({ min: 0, max: Infinity })),
      });
    }
    for (const [key, vals] of Object.entries(attrs)) {
      for (const val of vals) {
        p.push({
          label: val,
          clear: () =>
            startTransition(() =>
              setAttrs((prev) => ({
                ...prev,
                [key]: (prev[key] ?? []).filter((v) => v !== val),
              })),
            ),
        });
      }
    }
    return p;
  }, [
    search,
    category,
    subcategory,
    sellers,
    sellerMap,
    shipInclude,
    shipExclude,
    freeOnly,
    weights,
    priceRange,
    attrs,
    startTransition,
    setSearch,
    setCategory,
    setSubcategory,
    setSellers,
    setShipInclude,
    setShipExclude,
    setFreeOnly,
    setWeights,
    setPriceRange,
    setAttrs,
    t,
  ]);

  if (pills.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
      {pills.map((pill, i) => (
        <button
          key={`${pill.label}-${i}`}
          type="button"
          onClick={pill.clear}
          className="group flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
          title={t("removeFilter", { label: pill.label })}
        >
          {pill.label}
          <X size={10} className="opacity-60 group-hover:opacity-100" />
        </button>
      ))}
    </div>
  );
}

// ─── Bookmark toggle ───────────────────────────────────────────────

function BookmarkToggle() {
  const t = useTranslations("browse.toolbar");
  const bookmarks = useAtomValue(bookmarksAtom);
  const [active, setActive] = useAtom(bookmarksOnlyAtom);
  const count = bookmarks.length;

  return (
    <button
      type="button"
      onClick={() => setActive((v) => !v)}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
        active
          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
          : "text-muted hover:text-foreground"
      }`}
      title={active ? t("bookmarksShowAll") : t("bookmarksOnly")}
    >
      <Heart size={13} fill={active ? "currentColor" : "none"} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

// ─── Shipping-included toggle ──────────────────────────────────────

function ShippingToggle() {
  const t = useTranslations("browse.toolbar");
  const [active, setActive] = useAtom(includeShippingAtom);

  return (
    <button
      type="button"
      onClick={() => setActive((v) => !v)}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
        active
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "text-muted hover:text-foreground"
      }`}
      title={active ? t("shippingIncluded") : t("addShipping")}
    >
      <Truck size={13} />
      <span>{t("shippingShort")}</span>
    </button>
  );
}

// ─── Result count ──────────────────────────────────────────────────

function ResultCount({ mobile }: { mobile?: boolean }) {
  const t = useTranslations("browse.toolbar");
  const filtered = useAtomValue(filteredItemsAtom);
  const total = useAtomValue(itemsAtom);
  const isFiltered = filtered.length !== total.length;

  return (
    <span
      className={`text-[11px] font-medium text-muted tabular-nums ${mobile ? "inline" : "hidden sm:inline"}`}
    >
      {filtered.length}
      {isFiltered && (
        <span className="text-muted-foreground">/{total.length}</span>
      )}{" "}
      {t("itemsLabel", { count: filtered.length })}
    </span>
  );
}

// ─── Sort pills (desktop) ──────────────────────────────────────────

const BASE_SORT_OPTIONS: {
  key: SortKey;
  labelKey:
    | "hottest"
    | "newest"
    | "updated"
    | "price"
    | "pricePerGram"
    | "name";
  defaultDir: "asc" | "desc";
}[] = [
  { key: "hottest", labelKey: "hottest", defaultDir: "desc" },
  { key: "newest", labelKey: "newest", defaultDir: "desc" },
  { key: "updated", labelKey: "updated", defaultDir: "desc" },
  { key: "price", labelKey: "price", defaultDir: "asc" },
  { key: "ppg", labelKey: "pricePerGram", defaultDir: "asc" },
  { key: "name", labelKey: "name", defaultDir: "asc" },
];

/**
 * Returns `true` only after the first client render (hydration committed).
 * During SSR and the hydration render, returns `false`, so components can
 * render SSR defaults identically on both sides and swap in client state
 * on the next commit. Uses `useSyncExternalStore` — React's canonical
 * primitive for this — which is a pure hook (no setState-in-effect).
 */
const subscribeNoop = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

function SortPills() {
  const tSort = useTranslations("browse.toolbar.sort");
  const [sortKey, setSortKey] = useAtom(sortKeyAtom);
  const [sortDir, setSortDir] = useAtom(sortDirAtom);
  const mounted = useIsClient();
  const [, startTransition] = useTransition();

  const effectiveSortKey: SortKey = mounted ? sortKey : "hottest";
  const effectiveSortDir = mounted ? sortDir : "desc";

  const handleSortChange = (key: SortKey) => {
    startTransition(() => {
      if (key === sortKey) {
        setSortDir(sortDir === "asc" ? "desc" : "asc");
      } else {
        setSortKey(key);
        const opt = BASE_SORT_OPTIONS.find((o) => o.key === key);
        setSortDir(opt?.defaultDir ?? "asc");
      }
    });
  };

  const DirIcon = effectiveSortDir === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="sort-bar">
      {BASE_SORT_OPTIONS.map((opt) => {
        const active = effectiveSortKey === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => handleSortChange(opt.key)}
            className={`sort-bar__btn${active ? " sort-bar__btn--active" : ""}`}
          >
            {tSort(opt.labelKey)}
            {active && <DirIcon size={10} className="sort-bar__dir" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Sort select (mobile) ──────────────────────────────────────────

function FreeShippingToggle() {
  const t = useTranslations("browse.toolbar");
  const [active, setActive] = useAtom(freeShippingOnlyAtom);

  return (
    <button
      type="button"
      onClick={() => setActive((v) => !v)}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
        active
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "text-muted hover:text-foreground"
      }`}
      title={active ? t("freeShippingActive") : t("freeShippingInactive")}
    >
      <Package size={13} />
      <span>{t("freeShippingShort")}</span>
    </button>
  );
}

// ─── Density toggle (mobile only — comfortable ↔ compact) ─────────

function ViewModeToggle() {
  const t = useTranslations("browse.toolbar");
  const [mode, setMode] = useAtom(viewModeAtom);
  const isCompact = mode === "compact";
  return (
    <button
      type="button"
      onClick={() => setMode(isCompact ? "comfortable" : "compact")}
      className="sm:hidden flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer text-muted hover:text-foreground"
      title={isCompact ? t("comfortableCards") : t("compactCards")}
      aria-label={isCompact ? t("comfortableCards") : t("compactCards")}
    >
      {isCompact ? <LayoutGrid size={13} /> : <List size={13} />}
      <span>{isCompact ? t("roomy") : t("compact")}</span>
    </button>
  );
}

// ─── Sort select (mobile) ──────────────────────────────────────────

function SortSelect() {
  const tSort = useTranslations("browse.toolbar.sort");
  const [sortKey, setSortKey] = useAtom(sortKeyAtom);
  const [sortDir, setSortDir] = useAtom(sortDirAtom);
  const mounted = useIsClient();
  const [, startTransition] = useTransition();

  const effectiveSortKey: SortKey = mounted ? sortKey : "hottest";
  const effectiveSortDir = mounted ? sortDir : "desc";

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value as SortKey;
    startTransition(() => {
      if (key === sortKey) {
        setSortDir(sortDir === "asc" ? "desc" : "asc");
      } else {
        setSortKey(key);
        const opt = BASE_SORT_OPTIONS.find((o) => o.key === key);
        setSortDir(opt?.defaultDir ?? "asc");
      }
    });
  };

  const DirIcon = effectiveSortDir === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="flex items-center gap-1.5">
      <div className="sort-select">
        <select
          value={effectiveSortKey}
          onChange={handleChange}
          className="sort-select__field"
          aria-label={tSort("aria")}
        >
          {BASE_SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {tSort(opt.labelKey)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="sort-select__chevron"
          aria-hidden="true"
        />
      </div>
      <button
        type="button"
        onClick={() =>
          startTransition(() => setSortDir(sortDir === "asc" ? "desc" : "asc"))
        }
        className="sort-select__dir"
        aria-label={
          sortDir === "asc" ? tSort("ascending") : tSort("descending")
        }
      >
        <DirIcon size={14} />
      </button>
    </div>
  );
}
