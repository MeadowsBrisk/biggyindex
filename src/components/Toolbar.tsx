"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Heart,
  LayoutGrid,
  List,
  Rows3,
  Shuffle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore, useTransition } from "react";
import { FilterToggle } from "@/components/FilterPanel";
import { cx } from "@/lib/cn";
import type { SortKey } from "@/lib/types";
import { DEFAULT_SORT_DIR, DEFAULT_SORT_KEY } from "@/lib/urlFilters";
import {
  activeBookmarksCountAtom,
  bookmarksOnlyAtom,
  filteredItemsAtom,
  itemsAtom,
  randomSeedAtom,
  sortDirAtom,
  sortKeyAtom,
  viewLayoutAtom,
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
      {/* Row 1: filters + count (left) · saved → sort → layout (right) */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-1 sm:pb-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <FilterToggle />
          {/* Result count sits immediately after Filters on desktop. On mobile
              the count lives in row 2 (this instance self-hides via its span). */}
          <ResultCount />
          {/* Saved is desktop-anchored on the right; on mobile it stays here in
              the left cluster so it's still reachable. */}
          <span className="sm:hidden">
            <BookmarkToggle />
          </span>
          <ViewModeToggle />
        </div>

        {/* Active filters moved to the ActiveFilterBar above the grid (the
            grouped accent card) — the in-toolbar strip was cramped/overflowy. */}
        <div className="min-w-0 flex-1" />

        {/* Desktop: saved → sort → layout, pinned to the far right. */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <BookmarkToggle />
          <SortPills />
          <ViewLayoutToggle />
        </div>
      </div>

      {/* Row 2 (mobile only): result count + layout + sort select */}
      <div className="flex sm:hidden items-center justify-between gap-2 px-4 pb-2">
        <ResultCount mobile />
        <div className="flex items-center gap-2">
          <ViewLayoutToggle />
          <SortSelect />
        </div>
      </div>
    </div>
  );
}

// ─── Bookmark toggle ───────────────────────────────────────────────

function BookmarkToggle() {
  const t = useTranslations("browse.toolbar");
  // Count only bookmarks that still match a listed item — the persisted list
  // keeps refs for delisted items (they can be relisted), so the raw length
  // overstated the saved count shown here.
  const count = useAtomValue(activeBookmarksCountAtom);
  const [active, setActive] = useAtom(bookmarksOnlyAtom);

  return (
    <button
      type="button"
      onClick={() => setActive((v) => !v)}
      className={cx(
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer",
        active
          ? "border-rose-500 bg-rose-500 text-white"
          : "border-border text-muted hover:text-foreground hover:bg-surface-hover",
      )}
      aria-pressed={active}
      title={active ? t("bookmarksShowAll") : t("bookmarksOnly")}
    >
      <Heart size={13} fill={active ? "currentColor" : "none"} />
      <span className="hidden sm:inline">{t("saved")}</span>
      {count > 0 && (
        <span
          className={cx(
            "flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
            active
              ? "bg-white/20 text-white"
              : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Result count ──────────────────────────────────────────────────

function ResultCount({ mobile }: { mobile?: boolean }) {
  const t = useTranslations("browse.toolbar");
  const filtered = useAtomValue(filteredItemsAtom);
  const total = useAtomValue(itemsAtom);
  const isFiltered = filtered.length !== total.length;

  // Distinct sellers among the currently-visible (filtered) items — mirrors
  // roast-radar's `new Set(items.map(i => i.sid)).size`. Deriving straight
  // from the visible set (rather than the seller-facet atom) keeps the count
  // honest even when explicit sellers are selected.
  const sellerCount = new Set(
    filtered.map((i) => i.sid).filter((sid): sid is number => sid != null),
  ).size;

  return (
    <span
      className={`flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-sm tabular-nums ${mobile ? "inline-flex" : "hidden sm:inline-flex"}`}
    >
      <span className="font-bold text-foreground">
        {(isFiltered ? filtered.length : total.length).toLocaleString()}
      </span>
      <span className="text-muted">
        {isFiltered
          ? `${t("ofLabel")} ${total.length.toLocaleString()}`
          : t("itemsLabel", { count: total.length })}
      </span>
      {sellerCount > 0 && (
        <span className="hidden text-muted-foreground sm:inline">
          · {sellerCount.toLocaleString()}{" "}
          {t("sellersLabel", { count: sellerCount })}
        </span>
      )}
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
    | "shuffle";
  defaultDir: "asc" | "desc";
}[] = [
  { key: "hottest", labelKey: "hottest", defaultDir: "desc" },
  { key: "newest", labelKey: "newest", defaultDir: "desc" },
  { key: "updated", labelKey: "updated", defaultDir: "desc" },
  { key: "price", labelKey: "price", defaultDir: "asc" },
  { key: "ppg", labelKey: "pricePerGram", defaultDir: "asc" },
  { key: "shuffle", labelKey: "shuffle", defaultDir: "desc" },
];

const newRandomSeed = () => Math.floor(Math.random() * 0x7fffffff);

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
  const setRandomSeed = useSetAtom(randomSeedAtom);
  const mounted = useIsClient();
  const [, startTransition] = useTransition();

  const effectiveSortKey: SortKey = mounted ? sortKey : DEFAULT_SORT_KEY;
  const effectiveSortDir = mounted ? sortDir : DEFAULT_SORT_DIR;

  const handleSortChange = (key: SortKey) => {
    startTransition(() => {
      if (key === "shuffle") {
        // Re-roll the order each time Shuffle is tapped.
        setSortKey("shuffle");
        setRandomSeed(newRandomSeed());
        return;
      }
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
      {/* Decorative sort glyph — matches roast-radar. Direction itself is
          toggled by re-clicking the active pill (trailing arrow), so this is
          presentational only, not a separate toggle. */}
      <ArrowUpDown
        size={13}
        className="hidden text-muted lg:block sort-bar__lead"
        aria-hidden="true"
      />
      {BASE_SORT_OPTIONS.map((opt) => {
        const active = effectiveSortKey === opt.key;
        const isShuffle = opt.key === "shuffle";
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => handleSortChange(opt.key)}
            className={`sort-bar__btn${active ? " sort-bar__btn--active" : ""}`}
            title={isShuffle && active ? tSort("shuffleAgain") : undefined}
          >
            {tSort(opt.labelKey)}
            {isShuffle ? (
              <Shuffle size={10} className="sort-bar__dir" />
            ) : (
              active && <DirIcon size={10} className="sort-bar__dir" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Grid / list layout toggle ─────────────────────────────────────

function ViewLayoutToggle() {
  const t = useTranslations("browse.toolbar");
  const [layout, setLayout] = useAtom(viewLayoutAtom);
  const [, startTransition] = useTransition();

  const seg = (active: boolean) =>
    cx(
      "flex items-center justify-center px-2 py-1.5 transition-colors cursor-pointer",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted hover:text-foreground hover:bg-surface-hover",
    );

  return (
    <div className="flex overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => startTransition(() => setLayout("grid"))}
        className={seg(layout === "grid")}
        aria-label={t("gridView")}
        title={t("gridView")}
        aria-pressed={layout === "grid"}
      >
        <LayoutGrid size={14} />
      </button>
      <button
        type="button"
        onClick={() => startTransition(() => setLayout("list"))}
        className={seg(layout === "list")}
        aria-label={t("listView")}
        title={t("listView")}
        aria-pressed={layout === "list"}
      >
        <Rows3 size={14} />
      </button>
    </div>
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
  const setRandomSeed = useSetAtom(randomSeedAtom);
  const mounted = useIsClient();
  const [, startTransition] = useTransition();

  const effectiveSortKey: SortKey = mounted ? sortKey : DEFAULT_SORT_KEY;
  const effectiveSortDir = mounted ? sortDir : DEFAULT_SORT_DIR;
  const isShuffle = effectiveSortKey === "shuffle";

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value as SortKey;
    startTransition(() => {
      if (key === "shuffle") {
        setSortKey("shuffle");
        setRandomSeed(newRandomSeed());
        return;
      }
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
          startTransition(() =>
            isShuffle
              ? setRandomSeed(newRandomSeed())
              : setSortDir(sortDir === "asc" ? "desc" : "asc"),
          )
        }
        className="sort-select__dir"
        aria-label={
          isShuffle
            ? tSort("shuffleAgain")
            : sortDir === "asc"
              ? tSort("ascending")
              : tSort("descending")
        }
      >
        {isShuffle ? <Shuffle size={14} /> : <DirIcon size={14} />}
      </button>
    </div>
  );
}
