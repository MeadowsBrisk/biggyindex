/**
 * /prices — cannabis price-per-gram index, fully server-rendered.
 *
 * Every number on this page is an asking price from a live Little Biggy
 * listing: per-gram = variant USD price ÷ variant grams, converted to the
 * market currency server-side (lib/market/currency.ts). Medians/quantiles
 * are computed over all gram-denominated variants; listing counts are
 * per-item. This is deliberately NOT framed as a street-price survey —
 * the methodology section states exactly what the figures are.
 *
 * No client JS beyond the shared header/footer: stats, tables and the
 * best-value list are plain server markup with crawlable item links.
 */

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { categoryToSlug } from "@/lib/categories";
import { loadItems } from "@/lib/data";
import { decodeEntities } from "@/lib/format";
import { getServerCurrency } from "@/lib/market/currency";
import { ALL_MARKETS, localeToMarket } from "@/lib/market/market";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import { absoluteUrl, marketBaseUrl, pageMetadata } from "@/lib/seo/metadata";
import type { Item } from "@/lib/types";

/** Rows in the best-value list (deduped by item). */
const BEST_VALUE_LIMIT = 10;
/** Categories need this many gram-priced listings to earn a table row. */
const MIN_CATEGORY_LISTINGS = 5;

interface CategoryStats {
  category: string;
  listings: number;
  /** USD per gram over all gram-denominated variants in the category. */
  median: number;
  p25: number;
  p75: number;
  min: number;
}

interface BestValueRow {
  ref: string;
  name: string;
  seller: string | null;
  category: string | null;
  /** Item's cheapest USD-per-gram across its gram-denominated variants. */
  usdPerGram: number;
}

interface PriceIndex {
  /** Items with at least one gram-denominated variant. */
  listingCount: number;
  overallMedian: number;
  cheapest: number;
  categories: CategoryStats[];
  bestValue: BestValueRow[];
}

/** Per-gram asking prices for one item; nonsense values (g/usd ≤ 0) dropped. */
function perGramPrices(item: Item): number[] {
  const prices: number[] = [];
  for (const variant of item.v ?? []) {
    const { usd, g } = variant;
    if (
      typeof usd === "number" &&
      typeof g === "number" &&
      Number.isFinite(usd) &&
      Number.isFinite(g) &&
      usd > 0 &&
      g > 0
    ) {
      prices.push(usd / g);
    }
  }
  return prices;
}

/** Linear-interpolated quantile of an ascending-sorted, non-empty array. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function buildPriceIndex(items: Item[]): PriceIndex | null {
  const byCategory = new Map<string, { prices: number[]; listings: number }>();
  const allPrices: number[] = [];
  const bestValue: BestValueRow[] = [];

  for (const item of items) {
    const prices = perGramPrices(item);
    if (prices.length === 0) continue;
    allPrices.push(...prices);
    bestValue.push({
      ref: String(item.refNum ?? item.id),
      name: decodeEntities(item.n),
      seller: item.sn ?? null,
      category: item.c ?? null,
      usdPerGram: Math.min(...prices),
    });
    if (item.c) {
      let entry = byCategory.get(item.c);
      if (!entry) {
        entry = { prices: [], listings: 0 };
        byCategory.set(item.c, entry);
      }
      entry.prices.push(...prices);
      entry.listings++;
    }
  }

  if (allPrices.length === 0) return null;
  allPrices.sort((a, b) => a - b);
  bestValue.sort((a, b) => a.usdPerGram - b.usdPerGram);

  const categories: CategoryStats[] = [...byCategory.entries()]
    .filter(([, entry]) => entry.listings >= MIN_CATEGORY_LISTINGS)
    .map(([category, entry]) => {
      const sorted = entry.prices.sort((a, b) => a - b);
      return {
        category,
        listings: entry.listings,
        median: quantile(sorted, 0.5),
        p25: quantile(sorted, 0.25),
        p75: quantile(sorted, 0.75),
        min: sorted[0],
      };
    })
    .sort((a, b) => b.listings - a.listings);

  return {
    listingCount: bestValue.length,
    overallMedian: quantile(allPrices, 0.5),
    cheapest: allPrices[0],
    categories,
    bestValue: bestValue.slice(0, BEST_VALUE_LIMIT),
  };
}

/**
 * Gram-priced listing count for metadata. Cached with the same profile and
 * tag as the page body (mirrors the category page's categoryCounts) so
 * generateMetadata never pays an uncached R2 fetch per request.
 */
async function gramListingCount(mkt: string): Promise<number> {
  "use cache";
  cacheLife("items");
  cacheTag("items");
  const items = await loadItems(mkt);
  let count = 0;
  for (const item of items) {
    if (perGramPrices(item).length > 0) count++;
  }
  return count;
}

/** Round down to a stable "N+" figure so the title doesn't churn per crawl. */
function roundedCount(count: number): number {
  if (count >= 100) return Math.floor(count / 50) * 50;
  return Math.floor(count / 10) * 10;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const market = localeToMarket(locale);
  const t = await getTranslations({ locale, namespace: "prices" });
  const tMarkets = await getTranslations({ locale, namespace: "markets" });
  const count = roundedCount(await gramListingCount(market.toLowerCase()));

  // GB keeps the dedicated "UK" wording; other markets interpolate the
  // localized market name. Countless fallback mirrors /browse.
  const isGB = market === "GB";
  const marketName = tMarkets(market);

  return pageMetadata({
    market,
    path: "/prices",
    title: isGB ? t("meta.titleGB") : t("meta.title", { market: marketName }),
    description:
      count >= 10
        ? isGB
          ? t("meta.descriptionGB", { count })
          : t("meta.description", { market: marketName, count })
        : isGB
          ? t("meta.descriptionNoCountGB")
          : t("meta.descriptionNoCount", { market: marketName }),
    alternateMarkets: ALL_MARKETS,
  });
}

export default async function PricesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("items");
  cacheTag("items");

  const { locale } = await params;
  const market = localeToMarket(locale);
  const isGB = market === "GB";
  const [t, tMarkets, tCategories, currency, items] = await Promise.all([
    getTranslations({ locale, namespace: "prices" }),
    getTranslations({ locale, namespace: "markets" }),
    getTranslations({ locale, namespace: "categories" }),
    // USD→native conversion, same convention as item/browse SSR prices:
    // falls back to "$"/USD — never a wrong symbol on an unconverted number.
    getServerCurrency(market),
    loadItems(market.toLowerCase()),
  ]);

  const marketName = tMarkets(market);
  const index = buildPriceIndex(items);

  // Unknown category keys fall back to the raw value instead of surfacing a
  // MISSING error string (same guard as the browse seed cards).
  const categoryLabel = (category: string): string => {
    try {
      return tCategories(category);
    } catch {
      return category;
    }
  };

  const price = (usd: number): string =>
    `${currency.symbol}${(usd * currency.rate).toFixed(2)}`;
  const perGram = (usd: number): string =>
    t("stats.perGram", { price: price(usd) });

  const heading = isGB ? t("headingGB") : t("heading", { market: marketName });
  const roundedListings = roundedCount(index?.listingCount ?? 0);
  const description =
    roundedListings >= 10
      ? isGB
        ? t("meta.descriptionGB", { count: roundedListings })
        : t("meta.description", { market: marketName, count: roundedListings })
      : isGB
        ? t("meta.descriptionNoCountGB")
        : t("meta.descriptionNoCount", { market: marketName });

  const flower = index?.categories.find((c) => c.category === "Flower");
  const hash = index?.categories.find((c) => c.category === "Hash");

  const pageUrl = absoluteUrl(market, "/prices");
  const currencyUnit = `${currency.code}/g`;

  // Dataset structured data. No temporalCoverage: the page renders inside
  // "use cache" with no clock reads, so it cannot stamp wall-clock dates.
  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: heading,
    description,
    url: pageUrl,
    isAccessibleForFree: true,
    creator: {
      "@type": "Organization",
      name: "BiggyIndex",
      url: `${marketBaseUrl(market)}/`,
    },
    ...(index
      ? {
          variableMeasured: [
            {
              "@type": "PropertyValue",
              name: t("stats.overallMedianLabel"),
              value: Number((index.overallMedian * currency.rate).toFixed(2)),
              unitText: currencyUnit,
            },
            ...[flower, hash].flatMap((stats) =>
              stats
                ? [
                    {
                      "@type": "PropertyValue",
                      name: t("stats.categoryMedianLabel", {
                        category: categoryLabel(stats.category),
                      }),
                      value: Number((stats.median * currency.rate).toFixed(2)),
                      unitText: currencyUnit,
                    },
                  ]
                : [],
            ),
          ],
        }
      : {}),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: t("breadcrumbHome"),
        item: absoluteUrl(market, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: t("breadcrumbPrices"),
        item: pageUrl,
      },
    ],
  };

  const statCards: Array<{ key: string; label: string; value: string }> = index
    ? [
        {
          key: "overall",
          label: t("stats.overallMedianLabel"),
          value: perGram(index.overallMedian),
        },
        ...[flower, hash].flatMap((stats) =>
          stats
            ? [
                {
                  key: stats.category,
                  label: t("stats.categoryMedianLabel", {
                    category: categoryLabel(stats.category),
                  }),
                  value: perGram(stats.median),
                },
              ]
            : [],
        ),
        {
          key: "cheapest",
          label: t("stats.cheapestLabel"),
          value: perGram(index.cheapest),
        },
      ]
    : [];

  const thClass =
    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const tdClass = "px-4 py-3 text-sm";

  // Section rhythm: heading blocks are mt-12; intra-section gaps are the
  // status/about scale (mb-2 heading→copy, mt-4 copy→content).
  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(datasetJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />

      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
          <h1 className="text-3xl font-bold text-foreground">{heading}</h1>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            {t("intro", {
              count: index?.listingCount ?? 0,
              currency: currency.code,
            })}
          </p>

          {!index && (
            <p className="mt-8 rounded-2xl border border-border bg-surface p-5 text-sm text-muted leading-relaxed">
              {t("empty")}
            </p>
          )}

          {index && (
            <>
              {/* Headline stats — same bordered-card primitive as the other
                  hub pages (bg-surface, rounded-2xl). */}
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {statCards.map((card) => (
                  <div
                    key={card.key}
                    className="rounded-2xl border border-border bg-surface p-4"
                  >
                    <p className="text-lg font-bold text-foreground">
                      {card.value}
                    </p>
                    <p className="mt-1 text-xs text-muted leading-snug">
                      {card.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Per-category table */}
              <section className="mt-12">
                <h2 className="text-lg font-semibold text-foreground mb-2">
                  {t("table.heading")}
                </h2>
                <p className="text-sm text-muted leading-relaxed">
                  {t("table.caption")}
                </p>
                <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
                  <table className="w-full min-w-[36rem] border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={thClass}>{t("table.category")}</th>
                        <th className={`${thClass} text-right`}>
                          {t("table.listings")}
                        </th>
                        <th className={`${thClass} text-right`}>
                          {t("table.median")}
                        </th>
                        <th className={`${thClass} text-right`}>
                          {t("table.range")}
                        </th>
                        <th className={`${thClass} text-right`}>
                          {t("table.from")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {index.categories.map((stats, i) => {
                        const slug = categoryToSlug(stats.category);
                        return (
                          <tr
                            key={stats.category}
                            className={
                              i > 0 ? "border-t border-border" : undefined
                            }
                          >
                            <td
                              className={`${tdClass} font-medium text-foreground`}
                            >
                              {slug ? (
                                <Link
                                  href={`/category/${slug}`}
                                  prefetch={false}
                                  className="hover:text-primary transition-colors"
                                >
                                  {categoryLabel(stats.category)}
                                </Link>
                              ) : (
                                categoryLabel(stats.category)
                              )}
                            </td>
                            <td className={`${tdClass} text-right text-muted`}>
                              {stats.listings}
                            </td>
                            <td
                              className={`${tdClass} text-right font-medium text-foreground`}
                            >
                              {perGram(stats.median)}
                            </td>
                            <td className={`${tdClass} text-right text-muted`}>
                              {price(stats.p25)}–{price(stats.p75)}
                            </td>
                            <td className={`${tdClass} text-right text-muted`}>
                              {perGram(stats.min)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Best-value list — crawlable item links */}
              <section className="mt-12">
                <h2 className="text-lg font-semibold text-foreground mb-2">
                  {t("bestValue.heading")}
                </h2>
                <p className="text-sm text-muted leading-relaxed">
                  {t("bestValue.intro")}
                </p>
                <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
                  <table className="w-full min-w-[36rem] border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={thClass}>{t("bestValue.rank")}</th>
                        <th className={thClass}>{t("bestValue.item")}</th>
                        <th className={thClass}>{t("bestValue.seller")}</th>
                        <th className={thClass}>{t("bestValue.category")}</th>
                        <th className={`${thClass} text-right`}>
                          {t("bestValue.pricePerGram")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {index.bestValue.map((row, i) => (
                        <tr
                          key={row.ref}
                          className={
                            i > 0 ? "border-t border-border" : undefined
                          }
                        >
                          <td className={`${tdClass} text-muted`}>{i + 1}</td>
                          <td
                            className={`${tdClass} font-medium text-foreground`}
                          >
                            <a
                              href={`/item/${encodeURIComponent(row.ref)}`}
                              className="hover:text-primary transition-colors"
                            >
                              {row.name}
                            </a>
                          </td>
                          <td className={`${tdClass} text-muted`}>
                            {row.seller}
                          </td>
                          <td className={`${tdClass} text-muted`}>
                            {row.category ? categoryLabel(row.category) : null}
                          </td>
                          <td
                            className={`${tdClass} text-right font-medium text-foreground`}
                          >
                            {perGram(row.usdPerGram)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* Methodology — the honesty block */}
          <section className="mt-12">
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t("methodology.heading")}
            </h2>
            <ul className="mt-4 space-y-2">
              {(["source", "inclusion", "refresh", "honesty"] as const).map(
                (key) => (
                  <li
                    key={key}
                    className="text-sm text-muted leading-relaxed pl-4 relative before:absolute before:left-0 before:content-['–']"
                  >
                    {t(`methodology.${key}`)}
                  </li>
                ),
              )}
            </ul>
          </section>
        </div>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
