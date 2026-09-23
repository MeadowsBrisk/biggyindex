"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Check,
  EyeOff,
  LayoutGrid,
  MoreHorizontal,
  Pin,
  Rows3,
  Search,
  Star,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Section } from "@/components/filters/Section";
import { OffWallBadge } from "@/components/OffWall";
import {
  EMPTY_SELLER_SELECTION,
  excludeSeller,
  hasSellerSelection,
  isSellerTicked,
  onlySeller,
  type SellerFacet as SellerFacetEntry,
  sortSellersByRating,
  tickSellers,
  toggleSellerTick,
} from "@/lib/browse/filter-engine";
import { cx } from "@/lib/cn";
import { getSellerImageUrl } from "@/lib/images";
import type { Seller } from "@/lib/types";
import {
  availableSellersAtom,
  filteredSellersAtom,
  hiddenSellersAtom,
  pinnedSellersAtom,
  selectedSellersAtom,
  sellerFacetViewAtom,
  sellerSelectionAtom,
  sellersMapAtom,
  toggleHiddenSellerAtom,
} from "@/store/atoms";

const SELLER_COLLAPSED_COUNT = 6;

const SMALL_CONTROL =
  "shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer";

const TEXT_ACTION =
  "rounded-md py-1 text-[10px] font-medium uppercase tracking-wider text-muted enabled:hover:text-foreground transition-colors cursor-pointer disabled:cursor-default disabled:opacity-60";

function scrollResultsToTop() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function SellerChip({
  name,
  tone,
  title,
  onClick,
}: {
  name: string;
  tone: "excluded" | "selected";
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] cursor-pointer",
        tone === "excluded"
          ? "bg-red-500/20 text-red-400 line-through"
          : "bg-primary/15 text-primary hover:bg-primary/25 transition-colors",
      )}
    >
      <span className="truncate max-w-24">{name}</span>
      <X size={10} className="shrink-0 opacity-60" />
    </button>
  );
}

function SellerListRow({
  seller,
  meta,
  ticked,
  excluded,
  actionsOpen,
  onToggle,
  onOnly,
  onExclude,
  onHide,
  onActionsToggle,
}: {
  seller: SellerFacetEntry;
  meta: Seller | undefined;
  ticked: boolean;
  excluded: boolean;
  actionsOpen: boolean;
  onToggle: () => void;
  onOnly: () => void;
  onExclude: () => void;
  onHide: () => void;
  onActionsToggle: () => void;
}) {
  const t = useTranslations("browse.filters");
  const avatarUrl = getSellerImageUrl(meta?.imageUrl);
  const rating =
    typeof meta?.averageRating === "number" && meta.averageRating > 0
      ? meta.averageRating
      : null;
  const excludeLabel = excluded ? t("sellerInclude") : t("sellerExclude");
  const excludeTitle = excluded
    ? t("sellerIncludeTitle", { seller: seller.name })
    : t("sellerExcludeTitle", { seller: seller.name });

  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && actionsOpen) {
      event.stopPropagation();
      onActionsToggle();
    }
  };

  return (
    <div
      className={cx(
        "group border-b border-border last:border-0 transition-colors",
        ticked ? "bg-primary/10" : "hover:bg-surface-hover",
      )}
    >
      <div className="flex items-stretch">
        <label
          onContextMenu={(event) => {
            event.preventDefault();
            onExclude();
          }}
          title={
            ticked
              ? t("unselectSeller", { seller: seller.name })
              : t("selectSeller", { seller: seller.name })
          }
          className={cx(
            "flex min-h-10 min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-[11px] cursor-pointer",
            ticked ? "text-primary" : "text-muted hover:text-foreground",
          )}
        >
          <input
            type="checkbox"
            checked={ticked}
            onChange={onToggle}
            aria-label={seller.name}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={cx(
              "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
              ticked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background",
            )}
          >
            {ticked && <Check size={10} strokeWidth={3} />}
          </span>
          <span className="seller-card__avatar" aria-hidden="true">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                loading="lazy"
                className="h-full w-full rounded-[inherit] object-cover"
              />
            ) : (
              seller.name.charAt(0).toUpperCase()
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
            <span className="flex min-w-0 items-center gap-1">
              <span
                className={cx(
                  "truncate",
                  excluded && "text-red-400 line-through",
                )}
              >
                {seller.name}
              </span>
              {meta?.ow ? <OffWallBadge ow={meta.ow} owr={meta.owr} /> : null}
            </span>
            {rating != null && (
              <span className="flex items-center">
                <span
                  className="seller-card__badge seller-card__badge--rating"
                  title={t("sellerReviewsTitle", {
                    rating: rating.toFixed(1),
                    count: meta?.numberOfReviews ?? 0,
                  })}
                >
                  <Star size={9} className="fill-current" /> {rating.toFixed(1)}
                </span>
              </span>
            )}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums opacity-50">
            {seller.count}
          </span>
        </label>
        <button
          type="button"
          aria-expanded={actionsOpen}
          onKeyDown={closeOnEscape}
          aria-label={t("sellerMoreActions", { seller: seller.name })}
          title={t("sellerMoreActions", { seller: seller.name })}
          onClick={onActionsToggle}
          className={cx(
            "flex w-8 shrink-0 items-center justify-center cursor-pointer transition-opacity focus:outline-none focus-visible:opacity-100",
            "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100",
            actionsOpen
              ? "text-foreground pointer-fine:opacity-100"
              : "text-muted/60 hover:text-foreground",
          )}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
      {actionsOpen && (
        <div className="flex items-center gap-1.5 px-2 pb-2 pt-1.5">
          <button
            type="button"
            onClick={onOnly}
            onKeyDown={closeOnEscape}
            title={t("sellerOnlyTitle", { seller: seller.name })}
            className={SMALL_CONTROL}
          >
            {t("sellerOnly")}
          </button>
          <button
            type="button"
            onClick={onExclude}
            onKeyDown={closeOnEscape}
            title={excludeTitle}
            className={SMALL_CONTROL}
          >
            {excludeLabel}
          </button>
          <button
            type="button"
            onClick={onHide}
            onKeyDown={closeOnEscape}
            title={t("hideSeller", { seller: seller.name })}
            className={cx(SMALL_CONTROL, "inline-flex items-center gap-1")}
          >
            <EyeOff size={11} />
            {t("sellerHide")}
          </button>
        </div>
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "list" | "chips";
  onChange: (view: "list" | "chips") => void;
}) {
  const t = useTranslations("browse.filters");
  const seg = (active: boolean) =>
    cx(
      "flex items-center justify-center px-1.5 py-1.5 transition-colors cursor-pointer",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted hover:bg-surface-hover hover:text-foreground",
    );
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-border bg-surface">
      <button
        type="button"
        onClick={() => onChange("list")}
        className={seg(view === "list")}
        aria-label={t("sellerViewList")}
        title={t("sellerViewList")}
        aria-pressed={view === "list"}
      >
        <Rows3 size={12} />
      </button>
      <button
        type="button"
        onClick={() => onChange("chips")}
        className={seg(view === "chips")}
        aria-label={t("sellerViewChips")}
        title={t("sellerViewChips")}
        aria-pressed={view === "chips"}
      >
        <LayoutGrid size={12} />
      </button>
    </div>
  );
}

export function SellerFacet() {
  const allSellers = useAtomValue(availableSellersAtom);
  const filteredSellers = useAtomValue(filteredSellersAtom);
  const [selectedSellers, setSelectedSellers] = useAtom(selectedSellersAtom);
  const [sellerSelection, setSellerSelection] = useAtom(sellerSelectionAtom);
  const sellersMap = useAtomValue(sellersMapAtom);
  const hiddenSellers = useAtomValue(hiddenSellersAtom);
  const toggleHiddenSeller = useSetAtom(toggleHiddenSellerAtom);
  const [pinnedSellers, setPinnedSellers] = useAtom(pinnedSellersAtom);
  const [view, setView] = useAtom(sellerFacetViewAtom);
  const t = useTranslations("browse.filters");

  const [sellerQuery, setSellerQuery] = useState("");
  const [showAllSellers, setShowAllSellers] = useState(false);
  const [sellerSort, setSellerSort] = useState<"alpha" | "rating">("alpha");
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const sellerSearchInputRef = useRef<HTMLInputElement>(null);
  const hiddenSet = useMemo(() => new Set(hiddenSellers), [hiddenSellers]);

  const visibleSellers = useMemo(() => {
    const base = filteredSellers.filter((seller) => !hiddenSet.has(seller.id));
    if (sellerSort === "alpha") {
      return [...base].sort((a, b) => a.name.localeCompare(b.name));
    }
    return sortSellersByRating(base, sellersMap);
  }, [filteredSellers, hiddenSet, sellerSort, sellersMap]);

  const querySellers = useMemo(() => {
    const query = sellerQuery.toLowerCase().trim();
    if (!query) return visibleSellers;
    return visibleSellers.filter((seller) =>
      seller.name.toLowerCase().includes(query),
    );
  }, [sellerQuery, visibleSellers]);

  const expanded = showAllSellers || Boolean(sellerQuery.trim());
  const sellerRows = useMemo(
    () =>
      expanded ? querySellers : querySellers.slice(0, SELLER_COLLAPSED_COUNT),
    [querySellers, expanded],
  );

  const resetQuery = useCallback(() => {
    if (sellerQuery.trim()) {
      setSellerQuery("");
      setShowAllSellers(false);
    }
  }, [sellerQuery]);

  const applySelection = useCallback(
    (next: typeof sellerSelection) => {
      setSellerSelection(next);
      setActionsFor(null);
      resetQuery();
      scrollResultsToTop();
    },
    [setSellerSelection, resetQuery],
  );

  const toggleSeller = useCallback(
    (id: string) => {
      setSellerSelection(toggleSellerTick(sellerSelection, id));
      scrollResultsToTop();
    },
    [sellerSelection, setSellerSelection],
  );

  const hideSeller = useCallback(
    (id: string) => {
      if (isSellerTicked(sellerSelection, id) && !sellerSelection.all) {
        setSelectedSellers((prev) => prev.filter((entry) => entry !== id));
      }
      toggleHiddenSeller(id);
      setActionsFor(null);
    },
    [sellerSelection, setSelectedSellers, toggleHiddenSeller],
  );

  const allListedTicked = querySellers.every((seller) =>
    isSellerTicked(sellerSelection, seller.id),
  );

  const selectAllSellers = useCallback(() => {
    setSellerSelection(
      tickSellers(
        sellerSelection,
        querySellers.map((seller) => seller.id),
        !sellerQuery.trim(),
      ),
    );
    scrollResultsToTop();
  }, [sellerSelection, setSellerSelection, querySellers, sellerQuery]);

  const clearSellers = useCallback(() => {
    setSellerSelection(EMPTY_SELLER_SELECTION);
    scrollResultsToTop();
  }, [setSellerSelection]);

  const clearSellerQuery = useCallback(() => {
    setSellerQuery("");
    window.requestAnimationFrame(() => sellerSearchInputRef.current?.focus());
  }, []);

  const sellerName = useCallback(
    (id: string) =>
      visibleSellers.find((entry) => entry.id === id)?.name ??
      allSellers.find((entry) => entry.id === id)?.name ??
      `#${id}`,
    [visibleSellers, allSellers],
  );

  if (visibleSellers.length === 0) return null;

  let list: ReactNode;
  if (sellerRows.length === 0) {
    list = (
      <div className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted">
        {sellerQuery.trim() ? t("noSellersMatch") : t("noSellersAvailable")}
      </div>
    );
  } else if (view === "list") {
    list = (
      <div
        className={cx(
          "rounded-md border border-border bg-surface overflow-hidden",
          expanded && "sidebar-scroll max-h-76 overflow-y-auto",
        )}
      >
        {sellerRows.map((seller) => {
          const ticked = isSellerTicked(sellerSelection, seller.id);
          return (
            <SellerListRow
              key={seller.id}
              seller={seller}
              meta={sellersMap.get(seller.id)}
              ticked={ticked}
              excluded={
                sellerSelection.all &&
                sellerSelection.excluded.includes(seller.id)
              }
              actionsOpen={actionsFor === seller.id}
              onToggle={() => {
                toggleSeller(seller.id);
                resetQuery();
              }}
              onOnly={() => applySelection(onlySeller(seller.id))}
              onExclude={() =>
                applySelection(excludeSeller(sellerSelection, seller.id))
              }
              onHide={() => hideSeller(seller.id)}
              onActionsToggle={() =>
                setActionsFor((current) =>
                  current === seller.id ? null : seller.id,
                )
              }
            />
          );
        })}
      </div>
    );
  } else {
    list = (
      <div
        className={cx(
          "rounded-md border border-border bg-surface overflow-hidden",
          expanded && "sidebar-scroll max-h-76 overflow-y-auto",
        )}
      >
        <div className="grid grid-cols-2">
          {sellerRows.map((seller, index) => {
            const isSelected = isSellerTicked(sellerSelection, seller.id);
            const isRightCol = index % 2 === 1;
            const rowsCount = Math.ceil(sellerRows.length / 2);
            const isLastRow = Math.floor(index / 2) === rowsCount - 1;
            return (
              <div
                key={seller.id}
                className={cx(
                  "group relative flex items-center text-[11px] transition-colors",
                  !isRightCol && "border-r border-border",
                  !isLastRow && "border-b border-border",
                  isSelected
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-surface-hover hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    toggleSeller(seller.id);
                    resetQuery();
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    applySelection(excludeSeller(sellerSelection, seller.id));
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
                    hideSeller(seller.id);
                  }}
                  title={t("hideSeller", { seller: seller.name })}
                  aria-label={t("hideSellerAria", { seller: seller.name })}
                  className="absolute right-0 top-0 bottom-0 flex items-center px-1.5 bg-inherit text-muted/50 hover:text-red-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none transition-opacity cursor-pointer"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Section
      title={t("sections.sellers")}
      activeCount={
        sellerSelection.selected.length + sellerSelection.excluded.length
      }
      trailing={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setPinnedSellers((value) => !value);
          }}
          title={pinnedSellers ? t("pin.unpin") : t("pin.pin")}
          className={cx(
            "p-0.5 rounded transition-colors cursor-pointer",
            pinnedSellers ? "text-primary" : "text-muted/40 hover:text-muted",
          )}
        >
          <Pin size={12} className={pinnedSellers ? "fill-current" : ""} />
        </button>
      }
    >
      <div className="mb-2 flex items-stretch gap-1.5">
        <div className="relative min-w-0 flex-1">
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
            setSellerSort((value) => (value === "alpha" ? "rating" : "alpha"))
          }
          title={
            sellerSort === "alpha"
              ? t("sellerSortAlpha")
              : t("sellerSortRating")
          }
          className={SMALL_CONTROL}
        >
          {sellerSort === "alpha" ? "A-Z" : t("sellerSortRatingLabel")}
        </button>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="mb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={selectAllSellers}
          disabled={querySellers.length === 0 || allListedTicked}
          title={
            sellerQuery.trim()
              ? t("sellersSelectAllMatchingTitle")
              : t("sellersSelectAllTitle")
          }
          className={TEXT_ACTION}
        >
          {t("sellersSelectAll")}
        </button>
        <button
          type="button"
          onClick={clearSellers}
          disabled={!hasSellerSelection(sellerSelection)}
          title={t("sellersClearTitle")}
          className={TEXT_ACTION}
        >
          {t("sellersClear")}
        </button>
      </div>

      {sellerSelection.excluded.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {sellerSelection.excluded.map((id) => (
            <SellerChip
              key={id}
              name={sellerName(id)}
              tone="excluded"
              title={t("selectSeller", { seller: sellerName(id) })}
              onClick={() => toggleSeller(id)}
            />
          ))}
        </div>
      )}

      {selectedSellers.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedSellers.map((id) => (
            <SellerChip
              key={id}
              name={sellerName(id)}
              tone="selected"
              title={t("removeSeller", { seller: sellerName(id) })}
              onClick={() => toggleSeller(id)}
            />
          ))}
        </div>
      )}

      {list}

      {!sellerQuery.trim() && querySellers.length > SELLER_COLLAPSED_COUNT && (
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
  );
}
