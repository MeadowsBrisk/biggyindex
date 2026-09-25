import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HeroSearch } from "@/components/home/HeroSearch";
import { LeafNavigator } from "@/components/home/LeafNavigator";
import { getCategoryMeta } from "@/components/icons/CategoryIcons";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { ThemeToggle } from "@/components/ThemeToggle";
import { categoryToSlug } from "@/lib/categories";
import { CATEGORIES, MARKETS } from "@/lib/constants";
import type { HeroStatValues, LeafData } from "@/lib/home/leaf-data";
import type { ServerCurrency } from "@/lib/market/currency";
import {
  type MarketCode,
  marketToHost,
  marketToLocale,
} from "@/lib/market/market";
import type { HomeFeedScan } from "@/lib/types";

interface CategoryStat {
  name: string;
  count: number;
}

/** "Under …" chip threshold per display currency (whole local units). */
const UNDER_AMOUNT: Record<ServerCurrency["code"], number> = {
  USD: 25,
  GBP: 20,
  EUR: 20,
  CZK: 500,
  PLN: 100,
};

export async function HomeHero({
  locale,
  market,
  stats,
  categoryCounts,
  leaf,
  scan,
  currency,
}: {
  locale: string;
  market: MarketCode;
  stats: HeroStatValues;
  categoryCounts: CategoryStat[];
  leaf: LeafData;
  scan: HomeFeedScan | null;
  currency: ServerCurrency;
}) {
  const t = await getTranslations({ locale, namespace: "home.hero" });
  const tCategories = await getTranslations({
    locale,
    namespace: "categories",
  });

  const underLocal = UNDER_AMOUNT[currency.code];
  // Browse filters in USD; the chip label shows the local amount it approximates.
  const underUsd = Math.round(underLocal / currency.rate);
  const tryChips = [
    { key: "gelato", href: "/browse?cat=Flower&sub=Gelato" },
    { key: "hash", category: "Hash", href: "/category/hash" },
    { key: "vapes", category: "Vapes", href: "/category/vapes" },
    { key: "edibles", category: "Edibles", href: "/category/edibles" },
    { key: "freeShipping", href: "/browse?q=free%20shipping" },
    { key: "under", href: `/browse?pmax=${underUsd}` },
  ] as const;

  const countOf = new Map(categoryCounts.map((c) => [c.name, c.count]));
  const tiles = [
    {
      key: "all",
      label: tCategories("all"),
      href: "/browse",
      count: stats.listings,
      meta: null,
    },
    ...CATEGORIES.map((name) => {
      const slug = categoryToSlug(name);
      return {
        key: name,
        label: tCategories(name),
        href: slug
          ? `/category/${slug}`
          : `/browse?cat=${encodeURIComponent(name)}`,
        count: countOf.get(name) ?? 0,
        meta: getCategoryMeta(name),
      };
    }),
  ];

  return (
    <section className="home-hero">
      <div className="home-hero-tools">
        <ThemeToggle />
      </div>
      <div className="home-wrap home-hero-in">
        <div className="home-grid">
          <div className="home-main">
            <span className="home-eyebrow">
              <span className="home-dot" />
              {t("eyebrow")}
            </span>
            {/* LCP element: static server HTML, no entrance animation. */}
            <h1>
              {t("title.line1")} <span>{t("title.highlight")}</span>
            </h1>
            <p className="home-sub">{t("subtitle")}</p>

            <HeroSearch itemCount={stats.listings} currency={currency} />

            <div className="home-try">
              <span className="home-try-lbl">{t("try.label")}</span>
              {tryChips.map((chip) => (
                <Link
                  key={chip.key}
                  href={chip.href}
                  prefetch={false}
                  className="home-sug"
                >
                  {chip.key === "under"
                    ? t("try.under", {
                        price: `${currency.symbol}${underLocal}`,
                      })
                    : chip.key === "gelato" || chip.key === "freeShipping"
                      ? t(`try.${chip.key}`)
                      : tCategories(chip.category)}
                </Link>
              ))}
            </div>

            <div className="home-cta">
              {/* The one prefetched hop on the site: home → browse. */}
              <Link
                href="/browse"
                prefetch
                className="home-btn home-btn--primary"
              >
                {t("cta")}
                <ArrowRight size={17} className="home-arrow" aria-hidden />
              </Link>
              <Link
                href="/sellers"
                prefetch={false}
                className="home-btn home-btn--ghost"
              >
                {t("ctaSellers")}
              </Link>
            </div>
          </div>

          <div className="home-side">
            <LeafNavigator
              leaf={leaf}
              stats={stats}
              scan={scan}
              currency={currency}
            />
          </div>
        </div>

        <p className="home-lbl home-cats-lbl" id="home-cats-lbl">
          {t("browseByCategory")}
        </p>
        <nav className="home-cats" aria-labelledby="home-cats-lbl">
          {tiles.map((tile) => {
            const Icon = tile.meta?.icon;
            return (
              <Link
                key={tile.key}
                href={tile.href}
                prefetch={false}
                className="home-cat"
              >
                <span
                  className={`home-cat-icon ${tile.meta?.tintClass ?? "home-cat-icon--all"}`}
                >
                  {Icon ? (
                    <Icon size={14} strokeWidth={2.25} />
                  ) : (
                    <ArrowRight size={14} strokeWidth={2.25} />
                  )}
                </span>
                <span className="home-cat-name">{tile.label}</span>
                <span className="home-cat-cnt">{tile.count}</span>
              </Link>
            );
          })}
        </nav>

        <div className="home-markets">
          <span className="home-lbl" id="home-mkts-lbl">
            {t("editions")}
          </span>
          <nav className="home-mkts" aria-labelledby="home-mkts-lbl">
            {MARKETS.map((m) => {
              const code = m.code as MarketCode;
              const active = code === market;
              const href =
                process.env.NODE_ENV === "production"
                  ? `https://${marketToHost(code)}/`
                  : code === "GB"
                    ? "/"
                    : `/${marketToLocale(code)}`;
              return (
                <Link
                  key={m.code}
                  href={href}
                  prefetch={false}
                  className={`home-mkt${active ? " home-mkt--on" : ""}`}
                  aria-current={active ? "page" : undefined}
                  title={m.name}
                >
                  <CountryFlag code={m.code} size={16} />
                  <span>{m.code}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </section>
  );
}
