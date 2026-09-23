"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Check,
  EyeOff,
  LayoutGrid,
  MoreHorizontal,
  Rows3,
  Search,
  Star,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { KeyboardEvent, ReactNode } from "react";
import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FilterChip,
  PinToggle,
  SMALL_CONTROL,
  TEXT_ACTION,
} from "@/components/filters/primitives";
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
  favouriteSellersAtom,
  filteredSellersAtom,
  hiddenSellersAtom,
  pinnedSellersAtom,
  selectedSellersAtom,
  sellerFacetViewAtom,
  sellerModalIdAtom,
  sellerSelectionAtom,
  sellersMapAtom,
  toggleFavouriteSellerAtom,
  toggleHiddenSellerAtom,
} from "@/store/atoms";

const SELLER_COLLAPSED_COUNT = 6;

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
    <FilterChip
      tone={tone}
      title={title}
      onClick={onClick}
      trailing={<X size={11} className="shrink-0 opacity-60" />}
    >
      <span className="truncate">{name}</span>
    </FilterChip>
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
  favourite,
  onFavourite,
  onOpen,
}: {
  seller: SellerFacetEntry;
  meta: Seller | undefined;
  ticked: boolean;
  excluded: boolean;
  actionsOpen: boolean;
  onToggle: (row: HTMLElement | null) => void;
  onOnly: () => void;
  onExclude: () => void;
  onHide: () => void;
  onActionsToggle: () => void;
  favourite: boolean;
  onFavourite: () => void;
  onOpen: () => void;
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
  const rowRef = useRef<HTMLDivElement>(null);

  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && actionsOpen) {
      event.stopPropagation();
      onActionsToggle();
    }
  };

  return (
    <div
      ref={rowRef}
      className={cx(
        "group border-b border-border last:border-0 transition-colors",
        ticked ? "bg-primary/10" : "hover:bg-surface-hover",
      )}
    >
      <div
        className={cx(
          "flex min-h-10 items-stretch text-xs",
          ticked ? "text-primary" : "text-muted",
        )}
      >
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
          className="relative flex shrink-0 cursor-pointer items-center pl-2 pr-2"
        >
          {/* The real checkbox sits over the drawn box: a visually hidden one would be treated as off-screen and scroll the panel on every focus. */}
          <span
            className={cx(
              "relative flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              ticked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background",
            )}
          >
            <input
              type="checkbox"
              checked={ticked}
              onChange={() => onToggle(rowRef.current)}
              aria-label={seller.name}
              className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
            />
            {ticked && <Check size={10} strokeWidth={3} aria-hidden="true" />}
          </span>
        </label>
        <button
          type="button"
          onClick={onOpen}
          onKeyDown={closeOnEscape}
          title={t("openSeller", { seller: seller.name })}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 text-left cursor-pointer transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground"
        >
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
        </button>
        <span className="flex shrink-0 items-center pr-1 tabular-nums opacity-60">
          {seller.count}
        </span>
        <button
          type="button"
          aria-pressed={favourite}
          onClick={onFavourite}
          onKeyDown={closeOnEscape}
          aria-label={
            favourite
              ? t("unfavouriteSeller", { seller: seller.name })
              : t("favouriteSeller", { seller: seller.name })
          }
          title={
            favourite
              ? t("unfavouriteSeller", { seller: seller.name })
              : t("favouriteSeller", { seller: seller.name })
          }
          className={cx(
            "flex w-7 shrink-0 items-center justify-center cursor-pointer transition-opacity focus:outline-none focus-visible:opacity-100",
            favourite
              ? "text-amber-500"
              : "text-muted/60 hover:text-foreground pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100",
          )}
        >
          <Star size={12} className={favourite ? "fill-current" : ""} />
        </button>
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
        <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
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
      "flex h-7 items-center justify-center px-1.5 transition-colors cursor-pointer",
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
  const favouriteSellers = useAtomValue(favouriteSellersAtom);
  const toggleFavourite = useSetAtom(toggleFavouriteSellerAtom);
  const setSellerModalId = useSetAtom(sellerModalIdAtom);
  const t = useTranslations("browse.filters");

  const [sellerQuery, setSellerQuery] = useState("");
  const [showAllSellers, setShowAllSellers] = useState(false);
  const [sellerSort, setSellerSort] = useState<"alpha" | "rating">("alpha");
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const sellerSearchInputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<{ el: HTMLElement; top: number } | null>(null);
  const hiddenSet = useMemo(() => new Set(hiddenSellers), [hiddenSellers]);
  const favouriteSet = useMemo(
    () => new Set(favouriteSellers),
    [favouriteSellers],
  );

  const visibleSellers = useMemo(() => {
    const base = filteredSellers.filter((seller) => !hiddenSet.has(seller.id));
    const sorted =
      sellerSort === "alpha"
        ? [...base].sort((a, b) => a.name.localeCompare(b.name))
        : sortSellersByRating(base, sellersMap);
    return [
      ...sorted.filter((seller) => favouriteSet.has(seller.id)),
      ...sorted.filter((seller) => !favouriteSet.has(seller.id)),
    ];
  }, [filteredSellers, hiddenSet, favouriteSet, sellerSort, sellersMap]);

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

  // The facets above re-flow on every tick; pinning the clicked row keeps it under the pointer (WebKit has no scroll anchoring).
  const toggleSeller = useCallback(
    (id: string, row?: HTMLElement | null) => {
      if (row)
        anchorRef.current = { el: row, top: row.getBoundingClientRect().top };
      setSellerSelection(toggleSellerTick(sellerSelection, id));
      scrollResultsToTop();
    },
    [sellerSelection, setSellerSelection],
  );

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null;
    const scroller = anchor.el.closest<HTMLElement>(".sidebar-scroll");
    if (!scroller || !anchor.el.isConnected) return;
    scroller.scrollTop += anchor.el.getBoundingClientRect().top - anchor.top;
  });

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

  const favouriteRowCount = sellerRows.filter((seller) =>
    favouriteSet.has(seller.id),
  ).length;

  let list: ReactNode;
  if (sellerRows.length === 0) {
    list = (
      <div className="rounded-md border border-dashed border-border px-2 py-3 text-center text-xs text-muted">
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
        {sellerRows.map((seller, index) => {
          const ticked = isSellerTicked(sellerSelection, seller.id);
          return (
            <Fragment key={seller.id}>
              {index > 0 && index === favouriteRowCount && (
                <div className="h-0.5 bg-border" aria-hidden="true" />
              )}
              <SellerListRow
                seller={seller}
                meta={sellersMap.get(seller.id)}
                ticked={ticked}
                excluded={
                  sellerSelection.all &&
                  sellerSelection.excluded.includes(seller.id)
                }
                actionsOpen={actionsFor === seller.id}
                onToggle={(row) => {
                  toggleSeller(seller.id, row);
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
                favourite={favouriteSet.has(seller.id)}
                onFavourite={() => toggleFavourite(seller.id)}
                onOpen={() => setSellerModalId(seller.id)}
              />
            </Fragment>
          );
        })}
      </div>
    );
  } else {
    const chipGrid = (rows: SellerFacetEntry[]) => (
      <div className="grid grid-cols-2">
        {rows.map((seller, index) => {
          const isSelected = isSellerTicked(sellerSelection, seller.id);
          const favourite = favouriteSet.has(seller.id);
          const isRightCol = index % 2 === 1;
          const isLastRow =
            Math.floor(index / 2) === Math.ceil(rows.length / 2) - 1;
          return (
            <div
              key={seller.id}
              className={cx(
                "group relative flex items-center text-xs transition-colors",
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
                onClick={(event) => {
                  toggleSeller(seller.id, event.currentTarget.parentElement);
                  resetQuery();
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  applySelection(excludeSeller(sellerSelection, seller.id));
                }}
                className="flex h-8 flex-1 items-center gap-1.5 px-2 text-left cursor-pointer min-w-0"
                title={
                  isSelected
                    ? t("unselectSeller", { seller: seller.name })
                    : t("selectSeller", { seller: seller.name })
                }
              >
                {favourite && (
                  <Star
                    size={10}
                    className="shrink-0 fill-current text-amber-500"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate flex-1">{seller.name}</span>
                <span className="tabular-nums opacity-60 shrink-0">
                  {seller.count}
                </span>
              </button>
              <span className="absolute inset-y-0 right-0 flex items-stretch bg-inherit opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  aria-pressed={favourite}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavourite(seller.id);
                  }}
                  title={
                    favourite
                      ? t("unfavouriteSeller", { seller: seller.name })
                      : t("favouriteSeller", { seller: seller.name })
                  }
                  aria-label={
                    favourite
                      ? t("unfavouriteSeller", { seller: seller.name })
                      : t("favouriteSeller", { seller: seller.name })
                  }
                  className={cx(
                    "flex items-center px-1 cursor-pointer focus:outline-none",
                    favourite
                      ? "text-amber-500"
                      : "text-muted/50 hover:text-foreground",
                  )}
                >
                  <Star size={12} className={favourite ? "fill-current" : ""} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    hideSeller(seller.id);
                  }}
                  title={t("hideSeller", { seller: seller.name })}
                  aria-label={t("hideSellerAria", { seller: seller.name })}
                  className="flex items-center px-1.5 text-muted/50 hover:text-red-400 focus:outline-none cursor-pointer"
                >
                  <EyeOff size={12} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    );
    const favouriteChips = sellerRows.slice(0, favouriteRowCount);
    const otherChips = sellerRows.slice(favouriteRowCount);
    list = (
      <div
        className={cx(
          "rounded-md border border-border bg-surface overflow-hidden",
          expanded && "sidebar-scroll max-h-76 overflow-y-auto",
        )}
      >
        {favouriteChips.length > 0 && chipGrid(favouriteChips)}
        {favouriteChips.length > 0 && otherChips.length > 0 && (
          <div className="h-0.5 bg-border" aria-hidden="true" />
        )}
        {otherChips.length > 0 && chipGrid(otherChips)}
      </div>
    );
  }

  return (
    <Section
      title={t("sections.sellers")}
      activeCount={
        sellerSelection.selected.length + sellerSelection.excluded.length
      }
      storageKey="sellers"
      trailing={
        <PinToggle
          pinned={pinnedSellers}
          onToggle={() => setPinnedSellers((value) => !value)}
          pinTitle={t("pin.pin")}
          unpinTitle={t("pin.unpin")}
        />
      }
    >
      <div className="mb-2 flex items-center gap-1.5">
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
            className="h-7 w-full rounded-md border border-border bg-surface pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
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
        <div className="mb-2 flex flex-wrap gap-1.5">
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
        <div className="mb-2 flex flex-wrap gap-1.5">
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
          className={cx(TEXT_ACTION, "mt-1.5 w-full py-1")}
        >
          {showAllSellers
            ? t("showLess")
            : t("showAll", { count: querySellers.length })}
        </button>
      )}

      {hiddenSellers.length > 0 && (
        <div className="mt-1.5 text-[10px] leading-4 text-muted italic">
          {t("hiddenSellers", { count: hiddenSellers.length })}
        </div>
      )}
    </Section>
  );
}
