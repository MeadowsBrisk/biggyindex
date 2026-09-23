"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { useCallback, useEffect } from "react";
import {
  FilterChip,
  PinToggle,
  SUB_LABEL,
  SubLabel,
  SwitchRow,
  TEXT_ACTION,
} from "@/components/filters/primitives";
import { Section } from "@/components/filters/Section";
import { SellerFacet } from "@/components/filters/SellerFacet";
import { getCategoryMeta } from "@/components/icons/CategoryIcons";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { PriceRangeSlider } from "@/components/PriceRangeSlider";
import { cx } from "@/lib/cn";
import { CATEGORIES } from "@/lib/constants";
import {
  SHIP_FROM_UNKNOWN,
  shipFromLabel,
  shipFromShortLabel,
} from "@/lib/shipFrom";
import {
  activeFiltersCountAtom,
  attrFiltersAtom,
  attrOptionCountsAtom,
  availableShipFromAtom,
  availableSubcategoriesAtom,
  availableWeightsAtom,
  categoryAtom,
  categoryCountsAtom,
  clearFiltersAtom,
  excludedShipFromAtom,
  excludedSubcategoriesAtom,
  freeShippingOnlyAtom,
  hasOffWallItemsAtom,
  includeShippingAtom,
  offWallAtom,
  pinnedShipFromAtom,
  priceRangeAtom,
  searchQueryAtom,
  selectedShipFromAtom,
  selectedWeightsAtom,
  subcategoryAtom,
} from "@/store/atoms";

// Effect spans most categories; AttrFilterGroup hides it when results carry none.
const ALWAYS_ATTR_KEYS: { key: string }[] = [{ key: "effect" }];

const ATTR_KEYS_BY_CATEGORY: Record<string, { key: string }[]> = {
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
  const [attrFilters, setAttrFilters] = useAtom(attrFiltersAtom);
  const shipFromOptions = useAtomValue(availableShipFromAtom);
  const [shipInclude, setShipInclude] = useAtom(selectedShipFromAtom);
  const [shipExclude, setShipExclude] = useAtom(excludedShipFromAtom);
  const [freeShippingOnly, setFreeShippingOnly] = useAtom(freeShippingOnlyAtom);
  const [includeShipping, setIncludeShipping] = useAtom(includeShippingAtom);
  const [offWall, setOffWall] = useAtom(offWallAtom);
  const hasOffWallItems = useAtomValue(hasOffWallItemsAtom);
  const weightOptions = useAtomValue(availableWeightsAtom);
  const [selectedWeights, setSelectedWeights] = useAtom(selectedWeightsAtom);
  const [pinnedShipFrom, setPinnedShipFrom] = useAtom(pinnedShipFromAtom);
  const [priceRange, setPriceRange] = useAtom(priceRangeAtom);
  const clearFilters = useSetAtom(clearFiltersAtom);
  const filterCount = useAtomValue(activeFiltersCountAtom);
  const t = useTranslations("browse.filters");
  const tCategories = useTranslations("categories");
  const tPrice = useTranslations("browse.priceRange");
  const locale = useLocale();

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const handleCategoryClick = useCallback(
    (cat: string) => {
      setCategory(cat);
      setSubcategory([]);
      setExcludedSubcategory([]);
      scrollResultsToTop();
    },
    [setCategory, setSubcategory, setExcludedSubcategory],
  );

  // Left-click toggles INCLUDE and clears any exclusion on the same value.
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

  // Right-click (desktop only) toggles EXCLUDE; removable from the ActiveFilterBar on any device.
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

  // Click: excluded → neutral, neutral → included, included → neutral.
  const cycleShipFrom = useCallback(
    (value: string) => {
      if (shipExclude.includes(value)) {
        setShipExclude((prev) => prev.filter((entry) => entry !== value));
      } else if (shipInclude.includes(value)) {
        setShipInclude((prev) => prev.filter((entry) => entry !== value));
      } else {
        setShipInclude((prev) => [...prev, value]);
      }
      scrollResultsToTop();
    },
    [shipInclude, shipExclude, setShipInclude, setShipExclude],
  );

  const excludeShipFrom = useCallback(
    (value: string, event: MouseEvent) => {
      event.preventDefault();
      if (shipExclude.includes(value)) {
        setShipExclude((prev) => prev.filter((entry) => entry !== value));
      } else {
        setShipInclude((prev) => prev.filter((entry) => entry !== value));
        setShipExclude((prev) => [...prev, value]);
      }
      scrollResultsToTop();
    },
    [shipExclude, setShipInclude, setShipExclude],
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

  const attrDefs = [
    ...ALWAYS_ATTR_KEYS,
    ...(ATTR_KEYS_BY_CATEGORY[category] ?? []),
  ];

  const offWallOn = offWall.includes("u");
  const flaggedOn = offWall.includes("f");
  const priceActive = priceRange.min > 0 || priceRange.max < Infinity;

  return (
    <div className="flex h-full flex-col">
      {/* Mobile-only header; the desktop panel is toggled from the toolbar. */}
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
          <span className={SUB_LABEL}>
            {t("active", { count: filterCount })}
          </span>
          <button
            type="button"
            onClick={() => {
              clearFilters();
              scrollResultsToTop();
            }}
            className={cx(
              TEXT_ACTION,
              "flex items-center gap-1 px-2 py-0.5 hover:bg-surface-hover",
            )}
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

      {/* `relative` keeps absolutely positioned descendants inside this clip, so focusing one never scrolls the outer aside. */}
      <div className="sidebar-scroll relative flex-1 overflow-y-auto overscroll-contain px-4 lg:pl-0 py-1 pb-10">
        <Section
          title={t("categories")}
          storageKey="categories"
          activeCount={category === "All" ? 0 : 1}
        >
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              tone={category === "All" ? "solid" : "neutral"}
              count={categoryCounts.All ?? 0}
              onClick={() => handleCategoryClick("All")}
            >
              {tCategories("all")}
            </FilterChip>
            {CATEGORIES.map((cat) => {
              const count = categoryCounts[cat] ?? 0;
              const active = category === cat;
              if (count === 0 && !active) return null;
              const Icon = getCategoryMeta(cat).icon;
              return (
                <FilterChip
                  key={cat}
                  tone={active ? "solid" : "neutral"}
                  count={count}
                  icon={<Icon size={12} className="shrink-0 opacity-80" />}
                  onClick={() => handleCategoryClick(cat)}
                >
                  {tCategories(cat)}
                </FilterChip>
              );
            })}
          </div>
        </Section>

        {subcategories.length > 0 && (
          <Section
            title={t("subcategories")}
            storageKey="subcategories"
            activeCount={subcategory.length + excludedSubcategory.length}
          >
            <div className="flex flex-wrap gap-1.5">
              {subcategories.map((sc) => {
                const isIncluded = subcategory.includes(sc.name);
                const isExcluded = excludedSubcategory.includes(sc.name);
                return (
                  <FilterChip
                    key={sc.name}
                    tone={
                      isExcluded
                        ? "excluded"
                        : isIncluded
                          ? "selected"
                          : "neutral"
                    }
                    count={sc.count}
                    pressed={isIncluded || isExcluded}
                    title={
                      isExcluded
                        ? t("subcategoryExcludeRemove")
                        : t("subcategoryExcludeHint")
                    }
                    onClick={() => toggleSubcategory(sc.name)}
                    onContextMenu={(event) =>
                      excludeSubcategory(sc.name, event)
                    }
                  >
                    {sc.name}
                  </FilterChip>
                );
              })}
            </div>
          </Section>
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
            shipInclude.length + shipExclude.length + (freeShippingOnly ? 1 : 0)
          }
          trailing={
            shipFromOptions.length > 0 ? (
              <PinToggle
                pinned={pinnedShipFrom}
                onToggle={() => setPinnedShipFrom((value) => !value)}
                pinTitle={t("pin.pin")}
                unpinTitle={t("pin.unpin")}
              />
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <SwitchRow
                label={t("freeShippingOnly")}
                checked={freeShippingOnly}
                onChange={() => {
                  setFreeShippingOnly((value) => !value);
                  scrollResultsToTop();
                }}
              />
              <SwitchRow
                label={t("addShippingToPrices")}
                checked={includeShipping}
                onChange={() => setIncludeShipping((value) => !value)}
              />
            </div>

            {shipFromOptions.length > 0 && (
              <div>
                <SubLabel>{t("shippingFrom")}</SubLabel>
                <div className="flex flex-wrap gap-1.5">
                  {shipFromOptions.map((shipFrom) => {
                    const isIncluded = shipInclude.includes(shipFrom.value);
                    const isExcluded = shipExclude.includes(shipFrom.value);
                    const name = shipFromLabel(shipFrom.value, locale);
                    return (
                      <FilterChip
                        key={shipFrom.value}
                        tone={
                          isIncluded
                            ? "selected"
                            : isExcluded
                              ? "excluded"
                              : "neutral"
                        }
                        count={shipFrom.count}
                        pressed={isIncluded || isExcluded}
                        icon={<CountryFlag code={shipFrom.value} size={12} />}
                        title={`${name} — ${t("shipFromHelp")}`}
                        onClick={() => cycleShipFrom(shipFrom.value)}
                        onContextMenu={(event) =>
                          excludeShipFrom(shipFrom.value, event)
                        }
                      >
                        {shipFrom.value === SHIP_FROM_UNKNOWN
                          ? null
                          : shipFromShortLabel(shipFrom.value)}
                      </FilterChip>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Section>

        {(hasOffWallItems || offWall.length > 0) && (
          <Section title={t("offWall.heading")} storageKey="off-wall">
            <div className="flex flex-col gap-1">
              <SwitchRow
                label={t("offWall.show")}
                title={t("offWall.unlistedHelp")}
                checked={offWallOn}
                onChange={() => {
                  setOffWall(offWallOn ? [] : ["u"]);
                  scrollResultsToTop();
                }}
              />
              {offWallOn && (
                <div className="ml-3 border-l border-border pl-3">
                  <SwitchRow
                    label={t("offWall.includeFlagged")}
                    checked={flaggedOn}
                    onChange={() => {
                      setOffWall(flaggedOn ? ["u"] : ["u", "f"]);
                      scrollResultsToTop();
                    }}
                  />
                  <p className="text-[10px] leading-4 text-muted">
                    {t("offWall.flaggedHelp")}
                  </p>
                </div>
              )}
            </div>
          </Section>
        )}

        {weightOptions.length > 0 && (
          <Section
            title={t("sections.weight")}
            storageKey="weight"
            activeCount={selectedWeights.length}
          >
            <div className="flex flex-wrap gap-1.5">
              {weightOptions.map((weight) => (
                <FilterChip
                  key={weight.grams}
                  tone={
                    selectedWeights.includes(weight.grams)
                      ? "selected"
                      : "neutral"
                  }
                  count={weight.count}
                  pressed={selectedWeights.includes(weight.grams)}
                  onClick={() => toggleWeight(weight.grams)}
                >
                  {weight.label}
                </FilterChip>
              ))}
            </div>
          </Section>
        )}

        <Section
          title={t("sections.price")}
          storageKey="price"
          defaultOpen={false}
          activeCount={priceActive ? 1 : 0}
          trailing={
            priceActive ? (
              <button
                type="button"
                onClick={() => {
                  setPriceRange({ min: 0, max: Infinity });
                  scrollResultsToTop();
                }}
                title={tPrice("reset")}
                className="p-0.5 rounded text-muted/40 hover:text-muted transition-colors cursor-pointer"
              >
                <RotateCcw size={12} />
              </button>
            ) : undefined
          }
        >
          <PriceRangeSlider onFilterChange={scrollResultsToTop} />
        </Section>

        <SellerFacet />
      </div>
    </div>
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
      <div className="flex flex-wrap gap-1.5">
        {sorted.map(([value, count]) => {
          const dotColor =
            attrKey === "effect"
              ? EFFECT_DOT_COLORS[value.toLowerCase()]
              : undefined;
          const active = selected.includes(value);
          return (
            <FilterChip
              key={value}
              tone={active ? "selected" : "neutral"}
              count={count}
              pressed={active}
              dense
              className="capitalize"
              icon={
                dotColor ? (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                    aria-hidden="true"
                  />
                ) : undefined
              }
              onClick={() => onToggle(value)}
            >
              {value}
            </FilterChip>
          );
        })}
      </div>
    </Section>
  );
}
