"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { getCategoryMeta } from "@/components/icons/CategoryIcons";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { categoryToSlug } from "@/lib/categories";
import { CATEGORIES, type Category } from "@/lib/constants";
import { decodeEntities } from "@/lib/format";
import {
  loadSearchIndex,
  peekSearchIndex,
  searchAll,
} from "@/lib/home/search-index";
import { getImageUrl, getSellerImageUrl } from "@/lib/images";
import type { ServerCurrency } from "@/lib/market/currency";
import type {
  SearchIndex,
  SearchIndexCategory,
  SearchIndexItem,
  SearchIndexSeller,
} from "@/lib/types";
import {
  expandedRefNumAtom,
  marketAtom,
  sellerModalIdAtom,
} from "@/store/atoms";

type Entry =
  | { kind: "item"; item: SearchIndexItem }
  | { kind: "seller"; seller: SearchIndexSeller }
  | { kind: "category"; category: SearchIndexCategory };

const DEBOUNCE_MS = 80;

function initialOf(name: string): string {
  const m = name.match(/[A-Za-z0-9]/);
  return (m?.[0] ?? name.charAt(0)).toUpperCase();
}

function sellerImage(img: string | null | undefined): string | undefined {
  if (!img) return undefined;
  return img.startsWith("http")
    ? getSellerImageUrl(img)
    : getImageUrl(img, undefined, "icon");
}

export function HeroSearch({
  itemCount,
  currency,
}: {
  itemCount: number;
  currency: ServerCurrency;
}) {
  const t = useTranslations("home.hero.search");
  const tFeed = useTranslations("home.feed");
  const tCategories = useTranslations("categories");
  const router = useRouter();
  const market = useAtomValue(marketAtom);
  const { symbol, rate } = useDisplayCurrency(currency);
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const setSellerModalId = useSetAtom(sellerModalIdAtom);

  const baseId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<SearchIndex | null>(() =>
    peekSearchIndex(market),
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);

  // The index is fetched once, on first hover/focus; never at page load.
  const ensureIndex = useCallback(() => {
    if (index || loading || failed) return;
    setLoading(true);
    loadSearchIndex(market).then((idx) => {
      setIndex(idx);
      setFailed(idx == null);
      setLoading(false);
    });
  }, [index, loading, failed, market]);

  useEffect(() => {
    const timer = setTimeout(() => setDq(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = useMemo(() => searchAll(index, dq), [index, dq]);
  const entries = useMemo<Entry[]>(() => {
    if (!results) return [];
    return [
      ...results.items.map((item): Entry => ({ kind: "item", item })),
      ...results.sellers.map((seller): Entry => ({ kind: "seller", seller })),
      ...results.categories.map(
        (category): Entry => ({ kind: "category", category }),
      ),
    ];
  }, [results]);

  const queryReady = dq.trim().length >= 2;
  // Without an index the box degrades to submit-only: no dropdown, Enter still searches.
  const showDrop = open && queryReady && !failed;
  const seeAllIndex = entries.length;

  const goAll = useCallback(() => {
    setOpen(false);
    const term = q.trim();
    router.push(term ? `/browse?q=${encodeURIComponent(term)}` : "/browse");
  }, [q, router]);

  const activate = useCallback(
    (i: number) => {
      if (i === seeAllIndex) {
        goAll();
        return;
      }
      const e = entries[i];
      if (!e) return;
      setOpen(false);
      if (e.kind === "item") setRefNum(e.item.r);
      else if (e.kind === "seller") setSellerModalId(String(e.seller.id));
      else {
        const slug = categoryToSlug(e.category.n);
        router.push(
          slug
            ? `/category/${slug}`
            : `/browse?cat=${encodeURIComponent(e.category.n)}`,
        );
      }
    },
    [entries, seeAllIndex, goAll, router, setRefNum, setSellerModalId],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (showDrop && active >= 0) activate(active);
      else goAll();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        ensureIndex();
      }
      setActive((a) => Math.min(a + 1, seeAllIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    }
  };

  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const rowProps = (i: number) => ({
    id: optionId(i),
    role: "option" as const,
    "aria-selected": active === i,
    className: `home-sdrop-row${active === i ? " is-active" : ""}`,
    onMouseEnter: () => setActive(i),
  });
  const categoryLabel = (name: string) =>
    CATEGORIES.includes(name as Category)
      ? tCategories(name as Category)
      : name;
  const hasResults =
    !!results &&
    (results.items.length > 0 ||
      results.sellers.length > 0 ||
      results.categories.length > 0);
  const term = dq.trim();

  return (
    <div
      className="home-search-wrap"
      ref={wrapRef}
      onPointerEnter={ensureIndex}
    >
      <div className="home-search">
        <Search size={20} aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-expanded={showDrop}
          aria-controls={`${baseId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={
            showDrop && active >= 0 ? optionId(active) : undefined
          }
          placeholder={t("placeholder", { count: itemCount })}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
            ensureIndex();
          }}
          onFocus={() => {
            setOpen(true);
            ensureIndex();
          }}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="home-search-go" onClick={goAll}>
          {t("button")}
        </button>
      </div>

      {showDrop && (
        <div
          className="home-sdrop"
          id={`${baseId}-list`}
          role="listbox"
          aria-label={t("resultsAria")}
        >
          {loading && !index && (
            <div className="home-sdrop-loading">
              <span className="home-sdrop-spin" aria-hidden />
              {t("loading")}
            </div>
          )}

          {index && results && results.items.length > 0 && (
            <>
              <div className="home-sdrop-lbl">{t("items")}</div>
              {results.items.map((it, i) => {
                const img = getImageUrl(it.ih ?? undefined, undefined, "icon");
                const sub = [it.s, categoryLabel(it.c)]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <button
                    key={it.r}
                    type="button"
                    {...rowProps(i)}
                    onClick={() => activate(i)}
                  >
                    <span className="home-sdrop-thumb">
                      {img && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" loading="lazy" />
                      )}
                    </span>
                    <span className="home-sdrop-tx">
                      <span className="home-sdrop-name">
                        {decodeEntities(it.n)}
                      </span>
                      <span className="home-sdrop-sub">{sub}</span>
                    </span>
                    {it.so === 1 ? (
                      <span className="home-sdrop-price home-sdrop-price--out">
                        {tFeed("soldOut")}
                      </span>
                    ) : (
                      it.u != null && (
                        <span className="home-sdrop-price">
                          {symbol}
                          {(it.u * rate).toFixed(2)}
                        </span>
                      )
                    )}
                  </button>
                );
              })}
            </>
          )}

          {index && results && results.sellers.length > 0 && (
            <>
              <div className="home-sdrop-lbl">{t("sellers")}</div>
              {results.sellers.map((s, j) => {
                const gi = results.items.length + j;
                const logo = sellerImage(s.img);
                return (
                  <button
                    key={s.id}
                    type="button"
                    {...rowProps(gi)}
                    onClick={() => activate(gi)}
                  >
                    <span className="seller-card__avatar home-sdrop-ava">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" loading="lazy" />
                      ) : (
                        initialOf(s.n)
                      )}
                    </span>
                    <span className="home-sdrop-tx">
                      <span className="home-sdrop-name">{s.n}</span>
                      <span className="home-sdrop-sub">
                        {t("listings", { count: s.cnt })}
                      </span>
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {index && results && results.categories.length > 0 && (
            <>
              <div className="home-sdrop-lbl">{t("categories")}</div>
              {results.categories.map((c, k) => {
                const gi = results.items.length + results.sellers.length + k;
                const meta = getCategoryMeta(c.n);
                const Icon = meta.icon;
                return (
                  <button
                    key={c.n}
                    type="button"
                    {...rowProps(gi)}
                    onClick={() => activate(gi)}
                  >
                    <span className={`home-sdrop-cat ${meta.tintClass}`}>
                      <Icon size={15} strokeWidth={2.25} />
                    </span>
                    <span className="home-sdrop-tx">
                      <span className="home-sdrop-name">
                        {categoryLabel(c.n)}
                      </span>
                      <span className="home-sdrop-sub">
                        {t("listings", { count: c.cnt })}
                      </span>
                    </span>
                    <ArrowRight className="home-arrow" size={14} aria-hidden />
                  </button>
                );
              })}
            </>
          )}

          {index && !hasResults && (
            <div className="home-sdrop-empty">{t("noMatches", { term })}</div>
          )}

          <button
            type="button"
            id={optionId(seeAllIndex)}
            role="option"
            aria-selected={active === seeAllIndex}
            className={`home-sdrop-all${active === seeAllIndex ? " is-active" : ""}`}
            onMouseEnter={() => setActive(seeAllIndex)}
            onClick={goAll}
          >
            {t("seeAll", { term })}
            <ArrowRight className="home-arrow" size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
