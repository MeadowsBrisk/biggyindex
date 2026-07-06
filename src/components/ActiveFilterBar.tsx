"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { shipFromLabel } from "@/lib/shipFrom";
import {
  attrFiltersAtom,
  availableSellersAtom,
  categoryAtom,
  clearFiltersAtom,
  excludedShipFromAtom,
  excludedSubcategoriesAtom,
  priceRangeAtom,
  searchQueryAtom,
  selectedSellersAtom,
  selectedShipFromAtom,
  selectedWeightsAtom,
  subcategoryAtom,
} from "@/store/atoms";

interface ActiveChip {
  key: string;
  label: string;
  /** Country code — renders a flag on the chip (ship-from filters). */
  flag?: string;
  /** Exclusion chip — rendered strikethrough/red to read as "not this". */
  excluded?: boolean;
  clear: () => void;
}

interface ActiveGroup {
  key: string;
  label: string;
  chips: ActiveChip[];
}

/**
 * Active filters as a grouped bar above the grid (ported from Roast Radar):
 * a rounded accent-tinted card where each filter family gets a small uppercase
 * label and removable chips, with a Clear-all on the right. Replaces the
 * cramped single-line pill strip that overflowed inside the toolbar.
 */
export function ActiveFilterBar() {
  const t = useTranslations("browse.activeBar");
  const tFilters = useTranslations("browse.filters");
  const tToolbar = useTranslations("browse.toolbar");
  const locale = useLocale();
  const search = useAtomValue(searchQueryAtom);
  const setSearch = useSetAtom(searchQueryAtom);
  const category = useAtomValue(categoryAtom);
  const setCategory = useSetAtom(categoryAtom);
  const subcategory = useAtomValue(subcategoryAtom);
  const setSubcategory = useSetAtom(subcategoryAtom);
  const excludedSubcategory = useAtomValue(excludedSubcategoriesAtom);
  const setExcludedSubcategory = useSetAtom(excludedSubcategoriesAtom);
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
  const clearFilters = useSetAtom(clearFiltersAtom);
  const [, startTransition] = useTransition();

  const sellerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSellers) map.set(s.id, s.name);
    return map;
  }, [allSellers]);

  const tx = (fn: () => void) => startTransition(fn);
  const groups: ActiveGroup[] = [];

  if (search.trim()) {
    groups.push({
      key: "search",
      label: t("search"),
      chips: [
        {
          key: "search",
          label: `"${search.trim()}"`,
          clear: () => tx(() => setSearch("")),
        },
      ],
    });
  }
  if (category !== "All") {
    groups.push({
      key: "category",
      label: t("category"),
      chips: [
        {
          key: "category",
          label: category,
          clear: () =>
            tx(() => {
              setCategory("All");
              setSubcategory([]);
            }),
        },
      ],
    });
  }
  if (subcategory.length > 0) {
    groups.push({
      key: "subcategory",
      label: t("subcategory"),
      chips: subcategory.map((sc) => ({
        key: sc,
        label: sc,
        clear: () =>
          tx(() => setSubcategory((prev) => prev.filter((s) => s !== sc))),
      })),
    });
  }
  if (excludedSubcategory.length > 0) {
    groups.push({
      key: "subcategory-exclude",
      label: t("subcategoryNot"),
      chips: excludedSubcategory.map((sc) => ({
        key: sc,
        label: sc,
        excluded: true,
        clear: () =>
          tx(() =>
            setExcludedSubcategory((prev) => prev.filter((s) => s !== sc)),
          ),
      })),
    });
  }
  if (sellers.length > 0) {
    groups.push({
      key: "sellers",
      label: t("sellers"),
      chips: sellers.map((sid) => ({
        key: sid,
        label: sellerMap.get(sid) ?? `#${sid}`,
        clear: () =>
          tx(() => setSellers((prev) => prev.filter((s) => s !== sid))),
      })),
    });
  }
  if (shipInclude.length > 0) {
    groups.push({
      key: "ship-include",
      label: t("shipFrom"),
      chips: shipInclude.map((sf) => ({
        key: sf,
        label: shipFromLabel(sf, locale),
        flag: sf,
        clear: () =>
          tx(() => setShipInclude((prev) => prev.filter((v) => v !== sf))),
      })),
    });
  }
  if (shipExclude.length > 0) {
    groups.push({
      key: "ship-exclude",
      label: t("shipNot"),
      chips: shipExclude.map((sf) => ({
        key: sf,
        label: shipFromLabel(sf, locale),
        flag: sf,
        clear: () =>
          tx(() => setShipExclude((prev) => prev.filter((v) => v !== sf))),
      })),
    });
  }
  if (weights.length > 0) {
    groups.push({
      key: "weights",
      label: t("weight"),
      chips: weights.map((w) => ({
        key: String(w),
        label: `${w}g`,
        clear: () =>
          tx(() => setWeights((prev) => prev.filter((g) => g !== w))),
      })),
    });
  }
  if (priceRange.min > 0 || priceRange.max < Infinity) {
    groups.push({
      key: "price",
      label: t("price"),
      chips: [
        {
          key: "price",
          label:
            priceRange.max < Infinity
              ? `£${priceRange.min}–£${priceRange.max}`
              : `£${priceRange.min}+`,
          clear: () => tx(() => setPriceRange({ min: 0, max: Infinity })),
        },
      ],
    });
  }
  // Attribute filters — one group per attr key (Effect, Tier, …)
  for (const [key, vals] of Object.entries(attrs)) {
    if (!vals || vals.length === 0) continue;
    groups.push({
      key: `attr:${key}`,
      label: tFilters(`attrs.${key}`),
      chips: vals.map((val) => ({
        key: val,
        label: val,
        clear: () =>
          tx(() =>
            setAttrs((prev) => ({
              ...prev,
              [key]: (prev[key] ?? []).filter((v) => v !== val),
            })),
          ),
      })),
    });
  }

  if (groups.length === 0) return null;

  return (
    <div className="active-bar">
      {groups.map((g) => (
        <div className="active-grp" key={g.key}>
          <span className="active-grp-k">{g.label}</span>
          {g.chips.map((c) => (
            <button
              key={`${g.key}-${c.key}`}
              type="button"
              className={
                c.excluded ? "active-chip active-chip--excluded" : "active-chip"
              }
              onClick={c.clear}
              title={tToolbar("removeFilter", { label: c.label })}
            >
              {c.flag ? <CountryFlag code={c.flag} size={13} /> : null}
              {c.label}
              <X size={11} aria-hidden="true" className="active-chip-x" />
            </button>
          ))}
        </div>
      ))}
      <span className="active-bar-spacer" />
      <button
        type="button"
        className="active-bar-clear"
        onClick={() => tx(() => clearFilters())}
        title={tFilters("clearAllTitle")}
      >
        {tFilters("clearAll")}
      </button>
    </div>
  );
}
