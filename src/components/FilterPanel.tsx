"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { SlidersHorizontal, X, Search, Pin, RotateCcw, ChevronDown, EyeOff } from "lucide-react";
import { getCategoryMeta } from "@/components/icons/CategoryIcons";
import {
  useState,
  useMemo,
  useDeferredValue,
  useCallback,
  useRef,
  useEffect,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  filterPanelOpenAtom,
  activeFiltersCountAtom,
  gateCompleteAtom,
  categoryAtom,
  subcategoryAtom,
  searchQueryAtom,
  categoryCountsAtom,
  availableSubcategoriesAtom,
  selectedSellersAtom,
  hiddenSellersAtom,
  toggleHiddenSellerAtom,
  availableSellersAtom,
  filteredSellersAtom,
  selectedShipFromAtom,
  excludedShipFromAtom,
  availableShipFromAtom,
  selectedWeightsAtom,
  availableWeightsAtom,
  attrFiltersAtom,
  pinnedSellersAtom,
  pinnedShipFromAtom,
  clearFiltersAtom,
  attrOptionCountsAtom,
  sectionOpenAtom,
} from "@/store/atoms";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/constants";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { SHIP_FROM_CODES } from "@/lib/shipFrom";
import { PriceRangeSlider } from "@/components/PriceRangeSlider";

// ─── Width constant ────────────────────────────────────────────────

const PANEL_WIDTH = 280;

// ─── Collapsible section (accordion) ───────────────────────────────

function Section({
  title,
  children,
  defaultOpen = true,
  storageKey,
  activeCount,
  trailing,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  activeCount?: number;
  trailing?: React.ReactNode;
}) {
  const sectionKey = storageKey ?? title.toLowerCase().replace(/\s+/g, "-");
  const [sections, setSections] = useAtom(sectionOpenAtom);
  const open = sections[sectionKey] ?? defaultOpen;

  const toggle = () => {
    setSections((prev) => ({ ...prev, [sectionKey]: !open }));
  };

  return (
    <div className="border-b border-[var(--border)] last:border-0">
      <div className="flex w-full items-center justify-between py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
        <div
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
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
        </div>
        {trailing && <span className="ml-1 flex items-center">{trailing}</span>}
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? "max-h-[2000px] opacity-100 pb-3" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Panel toggle button (used in Toolbar) ─────────────────────────

export function FilterToggle() {
  const setOpen = useAtom(filterPanelOpenAtom)[1];
  const filterCount = useAtomValue(activeFiltersCountAtom);

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-label="Toggle filters"
      data-tour="filter-toggle"
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
        filterCount > 0
          ? "border-primary bg-primary/10 text-primary"
          : "border-[var(--border)] text-muted hover:text-foreground hover:bg-surface-hover"
      }`}
    >
      <SlidersHorizontal size={14} />
      <span className="hidden sm:inline">Filters</span>
      {filterCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
          {filterCount}
        </span>
      )}
    </button>
  );
}

// ─── Panel content ─────────────────────────────────────────────────

/** Attribute filter keys relevant per category */
const ATTR_KEYS_BY_CATEGORY: Record<string, { key: string; label: string }[]> = {
  Flower: [
    { key: "effect", label: "Effect" },
    { key: "tier", label: "Tier" },
  ],
  Shake: [
    { key: "effect", label: "Effect" },
    { key: "tier", label: "Tier" },
  ],
  Hash: [
    { key: "micron", label: "Micron" },
    { key: "filtration", label: "Filtration" },
    { key: "texture", label: "Texture" },
    { key: "tier", label: "Tier" },
  ],
  Concentrates: [
    { key: "process", label: "Process" },
    { key: "form", label: "Form" },
    { key: "tier", label: "Tier" },
  ],
  Vapes: [
    { key: "extract", label: "Extract" },
    { key: "form", label: "Form" },
  ],
  Edibles: [
    { key: "dietary", label: "Dietary" },
    { key: "strength", label: "Strength" },
  ],
};

function PanelContent({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useAtom(categoryAtom);
  const [subcategory, setSubcategory] = useAtom(subcategoryAtom);
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
  const weightOptions = useAtomValue(availableWeightsAtom);
  const [selectedWeights, setSelectedWeights] = useAtom(selectedWeightsAtom);
  const [pinnedSellers, setPinnedSellers] = useAtom(pinnedSellersAtom);
  const [pinnedShipFrom, setPinnedShipFrom] = useAtom(pinnedShipFromAtom);
  const clearFilters = useSetAtom(clearFiltersAtom);
  const filterCount = useAtomValue(activeFiltersCountAtom);

  // Seller search
  const [sellerQuery, setSellerQuery] = useState("");
  const [showAllSellers, setShowAllSellers] = useState(false);
  const [sellerSort, setSellerSort] = useState<"alpha" | "count">("alpha");
  const hiddenSet = useMemo(() => new Set(hiddenSellers), [hiddenSellers]);

  // Visible sellers (not hidden, from filtered items). Sort locally by
  // the user-selected mode — default A–Z because it's easier to scan than
  // a count-ranked list that changes on every filter tweak.
  const visibleSellers = useMemo(() => {
    const base = filteredSellers.filter((s) => !hiddenSet.has(s.id));
    if (sellerSort === "alpha") {
      return [...base].sort((a, b) => a.name.localeCompare(b.name));
    }
    return base; // filteredSellersAtom is already sorted by count desc
  }, [filteredSellers, hiddenSet, sellerSort]);

  // Query-filtered list used by the dropdown body.
  const querySellers = useMemo(() => {
    const q = sellerQuery.toLowerCase().trim();
    if (!q) return visibleSellers;
    return visibleSellers.filter((s) => s.name.toLowerCase().includes(q));
  }, [sellerQuery, visibleSellers]);

  const SELLER_COLLAPSED_COUNT = 6;
  const sellerRows = useMemo(
    () => (showAllSellers || sellerQuery.trim() ? querySellers : querySellers.slice(0, SELLER_COLLAPSED_COUNT)),
    [querySellers, showAllSellers, sellerQuery],
  );

  const handleCategoryClick = useCallback(
    (cat: string) => {
      setCategory(cat);
      setSubcategory([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setCategory, setSubcategory],
  );

  const toggleSubcategory = useCallback(
    (name: string) => {
      setSubcategory((prev) =>
        prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setSubcategory],
  );

  const toggleSeller = useCallback(
    (id: string) => {
      setSelectedSellers((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setSelectedSellers],
  );

  /** Ships-from 3-state cycle: neutral → include → exclude → neutral */
  const cycleShipFrom = useCallback(
    (value: string, e: React.MouseEvent) => {
      e.preventDefault();
      const isIncluded = shipInclude.includes(value);
      const isExcluded = shipExclude.includes(value);

      if (isIncluded) {
        // include → exclude
        setShipInclude((prev) => prev.filter((v) => v !== value));
        setShipExclude((prev) => [...prev, value]);
      } else if (isExcluded) {
        // exclude → neutral
        setShipExclude((prev) => prev.filter((v) => v !== value));
      } else {
        // neutral → include
        setShipInclude((prev) => [...prev, value]);
      }
    },
    [shipInclude, shipExclude, setShipInclude, setShipExclude],
  );

  const toggleWeight = useCallback(
    (grams: number) => {
      setSelectedWeights((prev) =>
        prev.includes(grams) ? prev.filter((g) => g !== grams) : [...prev, grams],
      );
    },
    [setSelectedWeights],
  );

  const toggleAttr = useCallback(
    (key: string, value: string) => {
      setAttrFilters((prev) => {
        const current = prev[key] ?? [];
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        return { ...prev, [key]: next };
      });
    },
    [setAttrFilters],
  );

  const attrDefs = category !== "All" ? ATTR_KEYS_BY_CATEGORY[category] ?? [] : [];

  return (
    <div className="flex h-full flex-col">
      {/* Header — close only. Matches the "N active" row height below so the
          two strips read as a single balanced strip when filters are set. */}
      <div className="flex h-8 items-center justify-end border-b border-[var(--border)] px-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
          aria-label="Close filters"
          title="Close filters"
        >
          <X size={14} />
        </button>
      </div>

      {/* "N active / Clear all" row — only when filters are set. */}
      {filterCount > 0 && (
        <div className="flex h-8 items-center justify-between border-b border-[var(--border)] bg-surface/40 px-4">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
            {filterCount} active
          </span>
          <button
            type="button"
            onClick={() => clearFilters()}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            title="Clear all non-pinned filters"
          >
            <RotateCcw size={11} />
            Clear all
          </button>
        </div>
      )}

      {/* Search — inline × clear button appears only when text is present,
          keeping it visually distinct from the panel-close X in the header. */}
      <div className="px-4 pt-2 pb-1 lg:pl-0">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full rounded-lg border border-[var(--border)] bg-surface py-1.5 pl-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors ${search ? "pr-8" : "pr-3"}`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              title="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 lg:pl-0 py-3 pb-10">
        {/* Category chips */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            Categories
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleCategoryClick("All")}
              className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer ${
                category === "All"
                  ? "bg-primary text-primary-foreground"
                  : "border border-[var(--border)] text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              All{" "}
              <span className="opacity-60">{categoryCounts.All ?? 0}</span>
            </button>
            {CATEGORIES.map((cat) => {
              const count = categoryCounts[cat] ?? 0;
              const active = category === cat;
              // Hide zero-count pills unless this category is currently active
              // (so the user can still see/click it to deselect).
              if (count === 0 && !active) return null;
              const meta = getCategoryMeta(cat);
              const Icon = meta.icon;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryClick(cat)}
                  className={`group inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "border border-[var(--border)] text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  <Icon
                    size={12}
                    className={`shrink-0 transition-opacity duration-200 ${
                      active ? "opacity-90" : "opacity-70 group-hover:opacity-100"
                    }`}
                  />
                  <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                  <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subcategory chips */}
        {subcategories.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              Subcategories
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {subcategories.map((sc) => (
                <button
                  key={sc.name}
                  type="button"
                  onClick={() => toggleSubcategory(sc.name)}
                  className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer border ${
                    subcategory.includes(sc.name)
                      ? "border-primary/40 bg-primary/20 text-primary"
                      : "border-[var(--border)] text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {sc.name}{" "}
                  <span className="opacity-60">{sc.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attribute filters (category-specific) */}
        {attrDefs.map((def) => (
          <AttrFilterGroup
            key={def.key}
            attrKey={def.key}
            label={def.label}
            selected={attrFilters[def.key] ?? []}
            onToggle={(val) => toggleAttr(def.key, val)}
          />
        ))}

        {/* Ships From (3-state: neutral → include → exclude) */}
        {shipFromOptions.length > 0 && (
          <Section
            title="Ships From"
            storageKey="ships-from"
            activeCount={shipInclude.length + shipExclude.length}
            trailing={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedShipFrom((v) => !v);
                }}
                title={pinnedShipFrom ? "Unpin — will clear with filters" : "Pin — keeps selection when clearing filters"}
                className={`p-0.5 rounded transition-colors cursor-pointer ${
                  pinnedShipFrom ? "text-primary" : "text-muted/40 hover:text-muted"
                }`}
              >
                <Pin size={12} className={pinnedShipFrom ? "fill-current" : ""} />
              </button>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {shipFromOptions.map((sf) => {
                const isIncluded = shipInclude.includes(sf.value);
                const isExcluded = shipExclude.includes(sf.value);
                return (
                  <button
                    key={sf.value}
                    type="button"
                    onClick={(e) => cycleShipFrom(sf.value, e)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (shipExclude.includes(sf.value)) {
                        setShipExclude((prev) => prev.filter((v) => v !== sf.value));
                      } else {
                        setShipInclude((prev) => prev.filter((v) => v !== sf.value));
                        setShipExclude((prev) => [...prev, sf.value]);
                      }
                    }}
                    title="Click: include · Right-click: exclude"
                    className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                      isIncluded
                        ? "bg-primary/20 text-primary"
                        : isExcluded
                          ? "bg-red-500/20 text-red-400 line-through"
                          : "border border-[var(--border)] text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    {SHIP_FROM_CODES[sf.value] && (
                      <CountryFlag code={SHIP_FROM_CODES[sf.value]} size={12} />
                    )}
                    {sf.label}{" "}
                    <span className="opacity-60">{sf.count}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Weight tiers */}
        {weightOptions.length > 0 && (
          <Section title="Weight" activeCount={selectedWeights.length}>
            <div className="flex flex-wrap gap-1.5">
              {weightOptions.map((w) => (
                <button
                  key={w.grams}
                  type="button"
                  onClick={() => toggleWeight(w.grams)}
                  className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer transition-colors border ${
                    selectedWeights.includes(w.grams)
                      ? "border-primary/40 bg-primary/20 text-primary"
                      : "border-[var(--border)] text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {w.label}{" "}
                  <span className="opacity-60">{w.count}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Price range */}
        <Section title="Price" defaultOpen={false} storageKey="price">
          <PriceRangeSlider />
        </Section>

        {/* Sellers — search + select chips */}
        {visibleSellers.length > 0 && (
          <Section
            title="Sellers"
            activeCount={selectedSellers.length}
            trailing={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedSellers((v) => !v);
                }}
                title={pinnedSellers ? "Unpin — will clear with filters" : "Pin — keeps selection when clearing filters"}
                className={`p-0.5 rounded transition-colors cursor-pointer ${
                  pinnedSellers ? "text-primary" : "text-muted/40 hover:text-muted"
                }`}
              >
                <Pin size={12} className={pinnedSellers ? "fill-current" : ""} />
              </button>
            }
          >

            {/* Search + sort row */}
            <div className="mb-2 flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search
                  size={12}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="text"
                  placeholder="Search sellers…"
                  value={sellerQuery}
                  onChange={(e) => setSellerQuery(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-surface py-1.5 pl-7 pr-3 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={() => setSellerSort((v) => (v === "alpha" ? "count" : "alpha"))}
                title={sellerSort === "alpha" ? "Sorted A–Z — click for most items first" : "Sorted by item count — click for A–Z"}
                className="shrink-0 rounded-md border border-[var(--border)] bg-surface px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer"
              >
                {sellerSort === "alpha" ? "A–Z" : "№"}
              </button>
            </div>

            {/* Selected seller chips */}
            {selectedSellers.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedSellers.map((id) => {
                  const seller = visibleSellers.find((s) => s.id === id) ?? allSellers.find((s) => s.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleSeller(id)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/25 transition-colors cursor-pointer"
                      title={`Remove ${seller?.name ?? id}`}
                    >
                      <span className="truncate max-w-24">{seller?.name ?? `#${id}`}</span>
                      <X size={10} className="shrink-0 opacity-60" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Seller list — 2-column grid. Hairlines via cell borders rather
                than a gap-px trick so the selected bg extends cleanly to the
                edge with no visible seam under the absolutely-positioned hide
                button. The list scrolls in-place when expanded or searching. */}
            {sellerRows.length > 0 ? (
              <div
                className={`rounded-md border border-[var(--border)] bg-surface overflow-hidden ${
                  showAllSellers || sellerQuery.trim()
                    ? "max-h-[19rem] overflow-y-auto"
                    : ""
                }`}
              >
                <div className="grid grid-cols-2">
                  {sellerRows.map((s, i) => {
                    const isSelected = selectedSellers.includes(s.id);
                    // Right column gets no right border; bottom row (last two
                    // cells of an even count, or last cell of odd count) skip the
                    // bottom border — container radius handles the corners.
                    const isRightCol = i % 2 === 1;
                    const rowsCount = Math.ceil(sellerRows.length / 2);
                    const isLastRow = Math.floor(i / 2) === rowsCount - 1;
                    return (
                      <div
                        key={s.id}
                        className={`group relative flex items-center text-[11px] transition-colors ${
                          !isRightCol ? "border-r border-[var(--border)]" : ""
                        } ${!isLastRow ? "border-b border-[var(--border)]" : ""} ${
                          isSelected
                            ? "bg-primary/10 text-primary"
                            : "text-muted hover:bg-surface-hover hover:text-foreground"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSeller(s.id)}
                          className="flex flex-1 items-center gap-1.5 px-2 py-1.5 text-left cursor-pointer min-w-0"
                          title={isSelected ? `Unselect ${s.name}` : `Select ${s.name}`}
                        >
                          <span className="truncate flex-1">{s.name}</span>
                          <span className="tabular-nums opacity-50 text-[10px] shrink-0">{s.count}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSelected) {
                              setSelectedSellers((prev) => prev.filter((id) => id !== s.id));
                            }
                            toggleHiddenSeller(s.id);
                          }}
                          title={`Hide ${s.name} — removes all their items from results`}
                          aria-label={`Hide ${s.name}`}
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
              <div className="rounded-md border border-dashed border-[var(--border)] px-2 py-3 text-center text-[11px] text-muted">
                {sellerQuery.trim() ? "No sellers match" : "No sellers available"}
              </div>
            )}

            {/* Show more/less toggle — lives OUTSIDE the scroll container so it's
                always reachable, never hidden below a long list. */}
            {!sellerQuery.trim() && querySellers.length > SELLER_COLLAPSED_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllSellers((v) => !v)}
                className="mt-1.5 w-full rounded-md py-1 text-[10px] font-medium uppercase tracking-wider text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                {showAllSellers
                  ? "Show less"
                  : `Show all ${querySellers.length}`}
              </button>
            )}

            {/* Hidden seller count hint */}
            {hiddenSellers.length > 0 && (
              <div className="mt-1.5 text-[10px] text-muted italic">
                {hiddenSellers.length} seller{hiddenSellers.length > 1 ? "s" : ""} hidden — manage in Settings
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

// ─── Attribute filter chip group ──────────────────────────────────

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
    <Section title={label} storageKey={`attr-${attrKey}`} activeCount={selected.length}>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map(([val, count]) => {
          const dotColor = attrKey === "effect" ? EFFECT_DOT_COLORS[val.toLowerCase()] : undefined;
          return (
            <button
              key={val}
              type="button"
              onClick={() => onToggle(val)}
              className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer border inline-flex items-center gap-1.5 ${
                selected.includes(val)
                  ? "border-primary/40 bg-primary/20 text-primary"
                  : "border-[var(--border)] text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {dotColor && (
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden="true"
                />
              )}
              {val}{" "}
              <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ─── FilterPanel ───────────────────────────────────────────────────

const emptySubscribe = () => () => {};

export function FilterPanel() {
  const [open, setOpen] = useAtom(filterPanelOpenAtom);
  const drawerRef = useRef<HTMLElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (open && isMobile) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open, isMobile]);

  // Set inert on background content when mobile drawer is open
  useEffect(() => {
    if (!(open && isMobile)) return;
    const main = document.querySelector("main");
    const header = document.querySelector("header");
    const toolbar = document.querySelector('[data-tour="toolbar"]');
    const targets = [main, header, toolbar].filter(
      Boolean,
    ) as HTMLElement[];
    for (const el of targets) el.setAttribute("inert", "");
    return () => {
      for (const el of targets) el.removeAttribute("inert");
    };
  }, [open, isMobile]);

  // Client-mount flag — gates createPortal (can't run during SSR)
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // Suppress CSS transitions until HydrationGate has fully faded out
  const gateComplete = useAtomValue(gateCompleteAtom);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) closePanel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closePanel]);

  return (
    <>
      {/* ── Desktop: inline sliding panel ── */}
      <aside
        className={`hidden md:block shrink-0 self-start sticky overflow-hidden ${
          gateComplete ? "transition-all duration-300 ease-out" : ""
        }`}
        style={{
          width: open ? PANEL_WIDTH : 0,
          top: "var(--toolbar-h, 44px)",
        }}
      >
        <div
          className="border-r border-[var(--border)] bg-[var(--background)]"
          style={{
            width: PANEL_WIDTH,
            height: "calc(100vh - var(--toolbar-h, 44px))",
          }}
        >
          <PanelContent onClose={() => setOpen(false)} />
        </div>
      </aside>

      {/* ── Mobile: overlay drawer (portalled to body for inert isolation) ── */}
      {mounted &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden transition-opacity duration-300 ${
                open ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
              onClick={closePanel}
              onKeyDown={() => {}}
              role="presentation"
            />
            <aside
              ref={drawerRef}
              className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-[var(--background)] shadow-2xl md:hidden transition-transform duration-300 ease-out ${
                open ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <PanelContent onClose={closePanel} />
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
