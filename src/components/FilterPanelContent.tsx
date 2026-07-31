"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  ChevronDown,
  EyeOff,
  Pin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCategoryMeta } from "@/components/icons/CategoryIcons";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { PriceRangeSlider } from "@/components/PriceRangeSlider";
import { CATEGORIES } from "@/lib/constants";
import { shipFromLabel } from "@/lib/shipFrom";
import {
  activeFiltersCountAtom,
  attrFiltersAtom,
  attrOptionCountsAtom,
  availableSellersAtom,
  availableShipFromAtom,
  availableSubcategoriesAtom,
  availableWeightsAtom,
  categoryAtom,
  categoryCountsAtom,
  clearFiltersAtom,
  excludedShipFromAtom,
  excludedSubcategoriesAtom,
  filteredSellersAtom,
  freeShippingOnlyAtom,
  hiddenSellersAtom,
  includeShippingAtom,
  pinnedSellersAtom,
  pinnedShipFromAtom,
  searchQueryAtom,
  sectionOpenAtom,
  selectedSellersAtom,
  selectedShipFromAtom,
  selectedWeightsAtom,
  subcategoryAtom,
  toggleHiddenSellerAtom,
} from "@/store/atoms";

function Section({
  title,
  children,
  defaultOpen = true,
  storageKey,
  activeCount,
  trailing,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  activeCount?: number;
  trailing?: ReactNode;
}) {
  const sectionKey = storageKey ?? title.toLowerCase().replace(/\s+/g, "-");
  const [sections, setSections] = useAtom(sectionOpenAtom);
  const open = sections[sectionKey] ?? defaultOpen;

  const toggle = () => {
    setSections((prev) => ({ ...prev, [sectionKey]: !open }));
  };

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex w-full items-center justify-between py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
        <button
          type="button"
          onClick={toggle}
          className="flex flex-1 items-center justify-between cursor-pointer transition-colors hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            {title}
            {!open && activeCount != null && activeCount > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground normal-case tracking-normal">
                {activeCount}
              </span>
            )}
          </span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
        {trailing && <span className="ml-1 flex items-center">{trailing}</span>}
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? "max-h-500 opacity-100 pb-3" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

const ATTR_KEYS_BY_CATEGORY: Record<string, { key: string }[]> = {
  Flower: [{ key: "effect" }],
  Shake: [{ key: "effect" }],
  Hash: [{ key: "micron" }, { key: "filtration" }, { key: "texture" }],
  Concentrates: [{ key: "process" }, { key: "form" }],
  Vapes: [{ key: "extract" }, { key: "form" }],
  Edibles: [{ key: "dietary" }, { key: "strength" }],
};

function scrollResultsToTop() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

export function FilterPanelContent({
  onClose,
  onReady,
}: {
  onClose: () => void;
  onReady?: () => void;
}) {
  const [category, setCategory] = useAtom(categoryAtom);
  const [subcategory, setSubcategory] = useAtom(subcategoryAtom);
  const [excludedSubcategory, setExcludedSubcategory] = useAtom(
    excludedSubcategoriesAtom,
  );
  const [search, setSearch] = useAtom(searchQueryAtom);
  const categoryCounts = useAtomValue(categoryCountsAtom);
  const subcategories = useAtomValue(availableSubcategoriesAtom);
  const allSellers = useAtomValue(availableSellersAtom);
  const filteredSellers = useAtomValue(filteredSellersAtom);
  const [selectedSellers, setSelectedSellers] = useAtom(selectedSellersAtom);
  const hiddenSellers = useAtomValue(hiddenSellersAtom);
  const toggleHiddenSeller = useSetAtom(toggleHiddenSellerAtom);
  const [attrFilters, setAttrFilters] = useAtom(attrFiltersAtom);
  const shipFromOptions = useAtomValue(availableShipFromAtom);
  const [shipInclude, setShipInclude] = useAtom(selectedShipFromAtom);
  const [shipExclude, setShipExclude] = useAtom(excludedShipFromAtom);
  const [freeShippingOnly, setFreeShippingOnly] = useAtom(freeShippingOnlyAtom);
  const [includeShipping, setIncludeShipping] = useAtom(includeShippingAtom);
  const weightOptions = useAtomValue(availableWeightsAtom);
  const [selectedWeights, setSelectedWeights] = useAtom(selectedWeightsAtom);
  const [pinnedSellers, setPinnedSellers] = useAtom(pinnedSellersAtom);
  const [pinnedShipFrom, setPinnedShipFrom] = useAtom(pinnedShipFromAtom);
  const clearFilters = useSetAtom(clearFiltersAtom);
  const filterCount = useAtomValue(activeFiltersCountAtom);
  const t = useTranslations("browse.filters");
  const tCategories = useTranslations("categories");
  const locale = useLocale();

  const [sellerQuery, setSellerQuery] = useState("");
  const [showAllSellers, setShowAllSellers] = useState(false);
  const [sellerSort, setSellerSort] = useState<"alpha" | "count">("alpha");
  const sellerSearchInputRef = useRef<HTMLInputElement>(null);
  const hiddenSet = useMemo(() => new Set(hiddenSellers), [hiddenSellers]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const visibleSellers = useMemo(() => {
    const base = filteredSellers.filter((seller) => !hiddenSet.has(seller.id));
    if (sellerSort === "alpha") {
      return [...base].sort((a, b) => a.name.localeCompare(b.name));
    }
    return base;
  }, [filteredSellers, hiddenSet, sellerSort]);

  const querySellers = useMemo(() => {
    const query = sellerQuery.toLowerCase().trim();
    if (!query) return visibleSellers;
    return visibleSellers.filter((seller) =>
      seller.name.toLowerCase().includes(query),
    );
  }, [sellerQuery, visibleSellers]);

  const SELLER_COLLAPSED_COUNT = 6;
  const sellerRows = useMemo(
    () =>
      showAllSellers || sellerQuery.trim()
        ? querySellers
        : querySellers.slice(0, SELLER_COLLAPSED_COUNT),
    [querySellers, showAllSellers, sellerQuery],
  );

  const handleCategoryClick = useCallback(
    (cat: string) => {
      setCategory(cat);
      setSubcategory([]);
      setExcludedSubcategory([]);
      scrollResultsToTop();
    },
    [setCategory, setSubcategory, setExcludedSubcategory],
  );

  // Left-click toggles INCLUDE. Including a subcategory clears any exclusion
  // on the same value so the two states can't both be set at once.
  const toggleSubcategory = useCallback(
    (name: string) => {
      setExcludedSubcategory((prev) => prev.filter((entry) => entry !== name));
      setSubcategory((prev) =>
        prev.includes(name)
          ? prev.filter((subcategory) => subcategory !== name)
          : [...prev, name],
      );
      scrollResultsToTop();
    },
    [setSubcategory, setExcludedSubcategory],
  );

  // Right-click (desktop) toggles EXCLUDE. Excluding clears any include on the
  // same value. Mobile has no contextmenu — exclusion is desktop-only for now
  // (removable from the ActiveFilterBar on any device).
  const excludeSubcategory = useCallback(
    (name: string, event: MouseEvent) => {
      event.preventDefault();
      setSubcategory((prev) => prev.filter((entry) => entry !== name));
      setExcludedSubcategory((prev) =>
        prev.includes(name)
          ? prev.filter((entry) => entry !== name)
          : [...prev, name],
      );
      scrollResultsToTop();
    },
    [setSubcategory, setExcludedSubcategory],
  );

  const toggleSeller = useCallback(
    (id: string) => {
      setSelectedSellers((prev) =>
        prev.includes(id)
          ? prev.filter((sellerId) => sellerId !== id)
          : [...prev, id],
      );
      scrollResultsToTop();
    },
    [setSelectedSellers],
  );

  const clearSellerQuery = useCallback(() => {
    setSellerQuery("");
    window.requestAnimationFrame(() => sellerSearchInputRef.current?.focus());
  }, []);

  // Left-click toggles INCLUDE. Right-click (desktop) handler below
  // toggles EXCLUDE. Previous behaviour was a 3-state cycle on every
  // click — confusing on desktop (right-click already exists for the
  // exclude action) and easy to overshoot.
  const cycleShipFrom = useCallback(
    (value: string, event: MouseEvent) => {
      event.preventDefault();
      const isIncluded = shipInclude.includes(value);
      const isExcluded = shipExclude.includes(value);

      // Clicking an excluded chip clears the exclusion (back to neutral).
      // Clicking a neutral chip includes it. Clicking an included chip
      // clears it back to neutral.
      if (isExcluded) {
        setShipExclude((prev) => prev.filter((entry) => entry !== value));
      } else if (isIncluded) {
        setShipInclude((prev) => prev.filter((entry) => entry !== value));
      } else {
        setShipInclude((prev) => [...prev, value]);
      }
      scrollResultsToTop();
    },
    [shipInclude, shipExclude, setShipInclude, setShipExclude],
  );

  const toggleWeight = useCallback(
    (grams: number) => {
      setSelectedWeights((prev) =>
        prev.includes(grams)
          ? prev.filter((weight) => weight !== grams)
          : [...prev, grams],
      );
      scrollResultsToTop();
    },
    [setSelectedWeights],
  );

  const toggleAttr = useCallback(
    (key: string, value: string) => {
      setAttrFilters((prev) => {
        const current = prev[key] ?? [];
        const next = current.includes(value)
          ? current.filter((entry) => entry !== value)
          : [...current, value];
        return { ...prev, [key]: next };
      });
      scrollResultsToTop();
    },
    [setAttrFilters],
  );

  const attrDefs =
    category !== "All" ? (ATTR_KEYS_BY_CATEGORY[category] ?? []) : [];

  return (
    <div className="flex h-full flex-col">
      {/* Header bar — mobile only. The desktop panel is toggled from the
          toolbar's Filters button, so its own close X was redundant (mirrors
          food-aggregator, which dropped the desktop header entirely). The
          mobile drawer still needs an explicit close affordance. */}
      <div className="ido-filter-header flex h-10 items-center justify-between border-b border-border px-3 md:hidden">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <SlidersHorizontal size={14} aria-hidden="true" />
          {t("label")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
          aria-label={t("close")}
          title={t("close")}
        >
          <X size={16} />
        </button>
      </div>

      {filterCount > 0 && (
        <div className="flex h-8 items-center justify-between border-b border-border bg-surface/40 px-4">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
            {t("active", { count: filterCount })}
          </span>
          <button
            type="button"
            onClick={() => {
              clearFilters();
              scrollResultsToTop();
            }}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            title={t("clearAllTitle")}
          >
            <RotateCcw size={11} />
            {t("clearAll")}
          </button>
        </div>
      )}

      <div className="px-4 pt-2 pb-1 lg:pl-0">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            type="text"
            placeholder={t("searchItems")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={`w-full rounded-lg border border-border bg-surface py-2.5 pl-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors ${search ? "pr-8" : "pr-3"}`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("clearSearch")}
              title={t("clearSearch")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-scroll flex-1 overflow-y-auto overscroll-contain px-4 lg:pl-0 py-3 pb-10">
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            {t("categories")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleCategoryClick("All")}
              className={`rounded-md border px-3 py-1 text-xs font-medium cursor-pointer transition-colors ${
                category === "All"
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {tCategories("all")}{" "}
              <span className="opacity-60">{categoryCounts.All ?? 0}</span>
            </button>
            {CATEGORIES.map((cat) => {
              const count = categoryCounts[cat] ?? 0;
              const active = category === cat;
              if (count === 0 && !active) return null;
              const meta = getCategoryMeta(cat);
              const Icon = meta.icon;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryClick(cat)}
                  className={`group inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  <Icon
                    size={12}
                    className={`shrink-0 transition-opacity duration-200 ${
                      active
                        ? "opacity-90"
                        : "opacity-70 group-hover:opacity-100"
                    }`}
                  />
                  <span>{tCategories(cat)}</span>
                  <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {subcategories.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              {t("subcategories")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {subcategories.map((sc) => {
                const isIncluded = subcategory.includes(sc.name);
                const isExcluded = excludedSubcategory.includes(sc.name);
                return (
                  <button
                    key={sc.name}
                    type="button"
                    onClick={() => toggleSubcategory(sc.name)}
                    onContextMenu={(event) =>
                      excludeSubcategory(sc.name, event)
                    }
                    aria-pressed={isIncluded || isExcluded}
                    title={
                      isExcluded
                        ? t("subcategoryExcludeRemove")
                        : t("subcategoryExcludeHint")
                    }
                    className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer border select-none inline-flex items-center gap-1.5 ${
                      isExcluded
                        ? "border-transparent bg-red-500/20 text-red-400 line-through"
                        : isIncluded
                          ? "border-primary/40 bg-primary/20 text-primary"
                          : "border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    {isExcluded && (
                      <X size={11} aria-hidden="true" className="shrink-0" />
                    )}
                    {sc.name} <span className="opacity-60">{sc.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {attrDefs.map((def) => (
          <AttrFilterGroup
            key={def.key}
            attrKey={def.key}
            label={t(`attrs.${def.key}`)}
            selected={attrFilters[def.key] ?? []}
            onToggle={(value) => toggleAttr(def.key, value)}
          />
        ))}

        <Section
          title={t("sections.shipping")}
          storageKey="shipping"
          activeCount={
            shipInclude.length +
            shipExclude.length +
            (freeShippingOnly ? 1 : 0) +
            (includeShipping ? 1 : 0)
          }
          trailing={
            shipFromOptions.length > 0 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPinnedShipFrom((value) => !value);
                }}
                title={pinnedShipFrom ? t("pin.unpin") : t("pin.pin")}
                className={`p-0.5 rounded transition-colors cursor-pointer ${
                  pinnedShipFrom
                    ? "text-primary"
                    : "text-muted/40 hover:text-muted"
                }`}
              >
                <Pin
                  size={12}
                  className={pinnedShipFrom ? "fill-current" : ""}
                />
              </button>
            ) : undefined
          }
        >
          {/* Cost toggles: free-only filter + add-shipping-to-prices. */}
          <div className="mb-3 flex flex-col gap-2">
            <ShippingSwitch
              label={t("freeShippingOnly")}
              checked={freeShippingOnly}
              onChange={() => {
                setFreeShippingOnly((value) => !value);
                scrollResultsToTop();
              }}
            />
            <ShippingSwitch
              label={t("addShippingToPrices")}
              checked={includeShipping}
              onChange={() => setIncludeShipping((value) => !value)}
            />
          </div>

          {shipFromOptions.length > 0 && (
            <>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                {t("shippingFrom")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {shipFromOptions.map((shipFrom) => {
                  const isIncluded = shipInclude.includes(shipFrom.value);
                  const isExcluded = shipExclude.includes(shipFrom.value);
                  const label = shipFromLabel(shipFrom.value, locale);
                  return (
                    <button
                      key={shipFrom.value}
                      type="button"
                      onClick={(event) => cycleShipFrom(shipFrom.value, event)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (shipExclude.includes(shipFrom.value)) {
                          setShipExclude((prev) =>
                            prev.filter((value) => value !== shipFrom.value),
                          );
                        } else {
                          setShipInclude((prev) =>
                            prev.filter((value) => value !== shipFrom.value),
                          );
                          setShipExclude((prev) => [...prev, shipFrom.value]);
                        }
                        scrollResultsToTop();
                      }}
                      title={t("shipFromHelp")}
                      className={`rounded-md border px-3 py-1 text-xs font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                        isIncluded
                          ? "border-transparent bg-primary/20 text-primary"
                          : isExcluded
                            ? "border-transparent bg-red-500/20 text-red-400 line-through"
                            : "border-border text-muted hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      {/* shipFrom.value is already a normalized code
                          (gb / nl / multi / unknown) coming from
                          item-index.ts. CountryFlag renders synthetic
                          codes (multi → globe, unknown → ?) too. */}
                      <CountryFlag code={shipFrom.value} size={12} />
                      {label}{" "}
                      <span className="opacity-60">{shipFrom.count}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Section>

        {weightOptions.length > 0 && (
          <Section
            title={t("sections.weight")}
            activeCount={selectedWeights.length}
          >
            <div className="flex flex-wrap gap-1.5">
              {weightOptions.map((weight) => (
                <button
                  key={weight.grams}
                  type="button"
                  onClick={() => toggleWeight(weight.grams)}
                  className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer transition-colors border ${
                    selectedWeights.includes(weight.grams)
                      ? "border-primary/40 bg-primary/20 text-primary"
                      : "border-border text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {weight.label}{" "}
                  <span className="opacity-60">{weight.count}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section
          title={t("sections.price")}
          defaultOpen={false}
          storageKey="price"
        >
          <PriceRangeSlider onFilterChange={scrollResultsToTop} />
        </Section>

        {visibleSellers.length > 0 && (
          <Section
            title={t("sections.sellers")}
            activeCount={selectedSellers.length}
            trailing={
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPinnedSellers((value) => !value);
                }}
                title={pinnedSellers ? t("pin.unpin") : t("pin.pin")}
                className={`p-0.5 rounded transition-colors cursor-pointer ${
                  pinnedSellers
                    ? "text-primary"
                    : "text-muted/40 hover:text-muted"
                }`}
              >
                <Pin
                  size={12}
                  className={pinnedSellers ? "fill-current" : ""}
                />
              </button>
            }
          >
            <div className="mb-2 flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search
                  size={12}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  ref={sellerSearchInputRef}
                  type="text"
                  placeholder={t("searchSellers")}
                  value={sellerQuery}
                  onChange={(event) => setSellerQuery(event.target.value)}
                  className="w-full rounded-md border border-border bg-surface py-1.5 pl-7 pr-7 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                />
                {sellerQuery && (
                  <button
                    type="button"
                    onClick={clearSellerQuery}
                    title={t("clearSearch")}
                    aria-label={t("clearSearch")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  setSellerSort((value) =>
                    value === "alpha" ? "count" : "alpha",
                  )
                }
                title={
                  sellerSort === "alpha"
                    ? t("sellerSortAlpha")
                    : t("sellerSortCount")
                }
                className="shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer"
              >
                {sellerSort === "alpha" ? "A-Z" : "No."}
              </button>
            </div>

            {selectedSellers.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedSellers.map((id) => {
                  const seller =
                    visibleSellers.find((entry) => entry.id === id) ??
                    allSellers.find((entry) => entry.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleSeller(id)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/25 transition-colors cursor-pointer"
                      title={t("removeSeller", { seller: seller?.name ?? id })}
                    >
                      <span className="truncate max-w-24">
                        {seller?.name ?? `#${id}`}
                      </span>
                      <X size={10} className="shrink-0 opacity-60" />
                    </button>
                  );
                })}
              </div>
            )}

            {sellerRows.length > 0 ? (
              <div
                className={`rounded-md border border-border bg-surface overflow-hidden ${
                  showAllSellers || sellerQuery.trim()
                    ? "sidebar-scroll max-h-76 overflow-y-auto"
                    : ""
                }`}
              >
                <div className="grid grid-cols-2">
                  {sellerRows.map((seller, index) => {
                    const isSelected = selectedSellers.includes(seller.id);
                    const isRightCol = index % 2 === 1;
                    const rowsCount = Math.ceil(sellerRows.length / 2);
                    const isLastRow = Math.floor(index / 2) === rowsCount - 1;
                    return (
                      <div
                        key={seller.id}
                        className={`group relative flex items-center text-[11px] transition-colors ${
                          !isRightCol ? "border-r border-border" : ""
                        } ${!isLastRow ? "border-b border-border" : ""} ${
                          isSelected
                            ? "bg-primary/10 text-primary"
                            : "text-muted hover:bg-surface-hover hover:text-foreground"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            toggleSeller(seller.id);
                            if (sellerQuery.trim()) {
                              setSellerQuery("");
                              setShowAllSellers(false);
                            }
                          }}
                          className="flex flex-1 items-center gap-1.5 px-2 py-1.5 text-left cursor-pointer min-w-0"
                          title={
                            isSelected
                              ? t("unselectSeller", { seller: seller.name })
                              : t("selectSeller", { seller: seller.name })
                          }
                        >
                          <span className="truncate flex-1">{seller.name}</span>
                          <span className="tabular-nums opacity-50 text-[10px] shrink-0">
                            {seller.count}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isSelected) {
                              setSelectedSellers((prev) =>
                                prev.filter((id) => id !== seller.id),
                              );
                            }
                            toggleHiddenSeller(seller.id);
                          }}
                          title={t("hideSeller", { seller: seller.name })}
                          aria-label={t("hideSellerAria", {
                            seller: seller.name,
                          })}
                          className="absolute right-0 top-0 bottom-0 flex items-center px-1.5 bg-inherit text-muted/50 hover:text-red-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none transition-opacity cursor-pointer"
                        >
                          <EyeOff size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted">
                {sellerQuery.trim()
                  ? t("noSellersMatch")
                  : t("noSellersAvailable")}
              </div>
            )}

            {!sellerQuery.trim() &&
              querySellers.length > SELLER_COLLAPSED_COUNT && (
                <button
                  type="button"
                  onClick={() => setShowAllSellers((value) => !value)}
                  className="mt-1.5 w-full rounded-md py-1 text-[10px] font-medium uppercase tracking-wider text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  {showAllSellers
                    ? t("showLess")
                    : t("showAll", { count: querySellers.length })}
                </button>
              )}

            {hiddenSellers.length > 0 && (
              <div className="mt-1.5 text-[10px] text-muted italic">
                {t("hiddenSellers", { count: hiddenSellers.length })}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

/**
 * Labelled on/off switch used by the Shipping section. Matches the sidebar's
 * primary-accent conventions (track fills `bg-primary` when on).
 */
function ShippingSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="group flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-xs font-medium cursor-pointer transition-colors text-muted hover:text-foreground"
    >
      <span>{label}</span>
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-border"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

const EFFECT_DOT_COLORS: Record<string, string> = {
  indica: "#a78bfa",
  sativa: "#fbbf24",
  hybrid: "#34d399",
};

function AttrFilterGroup({
  attrKey,
  label,
  selected,
  onToggle,
}: {
  attrKey: string;
  label: string;
  selected: string[];
  onToggle: (val: string) => void;
}) {
  const allCounts = useAtomValue(attrOptionCountsAtom);
  const optionCounts = allCounts[attrKey];

  if (!optionCounts || Object.keys(optionCounts).length === 0) return null;

  const sorted = Object.entries(optionCounts).sort((a, b) => b[1] - a[1]);

  return (
    <Section
      title={label}
      storageKey={`attr-${attrKey}`}
      activeCount={selected.length}
    >
      {/* The effect group is always exactly three options (Hybrid/Sativa/
          Indica), and free-wrapping pills put the third on its own line —
          messy for a fixed-size set. A 3-column grid keeps them on one row
          at any sidebar width; every other attribute keeps the wrap layout
          since its option count varies. Same pill styling in both. */}
      <div
        className={
          attrKey === "effect"
            ? "grid grid-cols-3 gap-1.5"
            : "flex flex-wrap gap-1.5"
        }
      >
        {sorted.map(([value, count]) => {
          const dotColor =
            attrKey === "effect"
              ? EFFECT_DOT_COLORS[value.toLowerCase()]
              : undefined;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              /* `capitalize` is display-only — `value` stays the raw lowercase
                 filter key for onToggle / selected / the URL param. */
              className={`rounded-md py-1 text-xs font-medium cursor-pointer border inline-flex items-center capitalize ${
                attrKey === "effect"
                  ? "justify-center gap-1 px-1 min-w-0"
                  : "gap-1.5 px-3"
              } ${
                selected.includes(value)
                  ? "border-primary/40 bg-primary/20 text-primary"
                  : "border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {dotColor && (
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{value}</span>{" "}
              <span className="opacity-60 text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
