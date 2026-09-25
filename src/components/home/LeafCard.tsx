"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RelativeTime } from "@/components/home/RelativeTime";
import { categoryToSlug } from "@/lib/categories";
import type {
  HeroStatValues,
  LeafCategory,
  LeafListing,
} from "@/lib/home/leaf-data";

const COUNT_MS = 320;

const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

function CountUp({ value, nf }: { value: number; nf: Intl.NumberFormat }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const [initial] = useState(() => nf.format(value));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (
      from === value ||
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      shown.current = value;
      el.textContent = nf.format(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / COUNT_MS);
      shown.current = Math.round(from + (value - from) * easeInOut(k));
      el.textContent = nf.format(shown.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, nf]);

  return <span ref={ref}>{initial}</span>;
}

export function dropPct(item: LeafListing): number | null {
  if (item.k !== "drop" || item.was == null || item.u == null) return null;
  return Math.max(1, Math.round((1 - item.u / item.was) * 100));
}

export function LeafCard({
  cat,
  cats,
  stats,
  isPreview,
  pinned,
  list,
  index,
  money,
  categoryName,
  onClear,
  onStep,
  onOpen,
}: {
  cat: LeafCategory | null;
  cats: LeafCategory[];
  stats: HeroStatValues;
  isPreview: boolean;
  pinned: boolean;
  list: LeafListing[];
  index: number;
  money: (usd: number, whole?: boolean) => string;
  categoryName: (c: string) => string;
  onClear: () => void;
  onStep: (delta: number) => void;
  onOpen: (ref: string) => void;
}) {
  const t = useTranslations("home.hero.leaf");
  const locale = useLocale();
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const bold = (chunks: ReactNode) => <b>{chunks}</b>;

  const slug = cat ? categoryToSlug(cat.c) : null;
  const browseHref = !cat
    ? "/browse"
    : slug
      ? `/category/${slug}`
      : `/browse?cat=${encodeURIComponent(cat.c)}`;
  const values = cat
    ? [cat.cnt, cat.sellers, cat.newCnt, cat.dropCnt]
    : [stats.listings, stats.sellers, stats.newThisWeek, stats.priceDrops];
  const labels = [
    t("stats.listings"),
    t("stats.sellers"),
    t("stats.new"),
    t("stats.drops"),
  ];

  let insight: ReactNode = null;
  if (cat) {
    const prices =
      cat.min != null && cat.med != null
        ? t.rich("insight.prices", {
            min: money(cat.min),
            median: money(cat.med, true),
            b: bold,
          })
        : null;
    const top = cat.top
      ? t.rich("insight.topSeller", { seller: cat.top, b: bold })
      : null;
    insight = (
      <>
        {prices}
        {prices && top && " · "}
        {top}
      </>
    );
  } else {
    const biggest = [...cats].sort((a, b) => b.newCnt - a.newCnt)[0];
    insight =
      biggest && biggest.newCnt > 0
        ? t.rich("insight.mostNew", {
            category: categoryName(biggest.c),
            count: biggest.newCnt,
            b: bold,
          })
        : t("insight.summary", {
            categories: cats.length,
            sellers: stats.sellers,
          });
  }

  const item = list[index] ?? null;
  const pct = item ? dropPct(item) : null;
  const open = (event: MouseEvent<HTMLAnchorElement>, ref: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    event.preventDefault();
    onOpen(ref);
  };

  return (
    <div
      className={`home-leaf-card${isPreview ? " is-preview" : ""}`}
      aria-live="polite"
    >
      <div className="home-leaf-head">
        <div className="home-leaf-scope">
          <span className="home-leaf-pill">
            {!cat
              ? t("scope.market")
              : isPreview
                ? t("scope.preview")
                : t("scope.category")}
          </span>
          <span className="home-leaf-scope-name">
            {cat ? categoryName(cat.c) : t("allCategories")}
          </span>
          {pinned && (
            <button
              type="button"
              className="home-leaf-x"
              aria-label={t("clear")}
              onClick={onClear}
            >
              ×
            </button>
          )}
        </div>
        <Link href={browseHref} prefetch={false} className="home-leaf-browse">
          {cat
            ? t("browseCategory", { category: categoryName(cat.c) })
            : t("browseAll")}
          <span className="home-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </div>

      <dl className="home-leaf-stats">
        {labels.map((label, i) => (
          <div key={label} className="home-leaf-stat">
            <dt>{label}</dt>
            <dd className={i === 2 ? "is-hot" : undefined}>
              <CountUp value={values[i]} nf={nf} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="home-leaf-insight">
        <span className="home-leaf-insight-text">{insight}</span>
        {!cat && (
          <Link
            href="/prices"
            prefetch={false}
            className="home-leaf-insight-link"
          >
            {t("priceIndex")}
            <span className="home-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        )}
      </div>

      <div className="home-leaf-row">
        {item && (
          <>
            {item.img ? (
              // biome-ignore lint/performance/noImgElement: 40px CDN thumb, same as the home strip cards
              <img
                src={item.img}
                alt=""
                width={40}
                height={40}
                loading="lazy"
                className="home-leaf-thumb"
              />
            ) : (
              <span className="home-leaf-thumb" />
            )}
            <a
              href={`/item/${encodeURIComponent(item.ref)}`}
              onClick={(event) => open(event, item.ref)}
              className="home-leaf-row-link"
            >
              <span className="home-leaf-rn">{item.n}</span>
              <span className="home-leaf-rm">
                <span className={`home-leaf-badge home-leaf-badge--${item.k}`}>
                  {item.k === "new"
                    ? t("badge.new")
                    : item.k === "drop"
                      ? `−${pct}%`
                      : t("badge.cheapest")}
                </span>
                {item.k !== "cheap" && item.at && (
                  <>
                    {" · "}
                    <RelativeTime iso={item.at} />
                  </>
                )}
                {item.s && ` · ${item.s}`}
              </span>
            </a>
            <span className="home-leaf-rp">
              {item.k === "drop" && item.was != null && (
                <s>{money(item.was)}</s>
              )}
              {item.u != null ? money(item.u) : ""}
            </span>
            <span className="home-leaf-step">
              <button
                type="button"
                aria-label={t("prevListing")}
                disabled={index === 0}
                onClick={() => onStep(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={t("nextListing")}
                disabled={index >= list.length - 1}
                onClick={() => onStep(1)}
              >
                ›
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
