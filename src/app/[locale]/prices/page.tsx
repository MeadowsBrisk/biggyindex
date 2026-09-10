/**
 * /prices — server-rendered price index. Every figure is a live asking
 * price, computed in lib/prices (shared with /api/prices) and converted to
 * the market currency here. Plain markup with crawlable item links.
 */

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { categoryToSlug } from "@/lib/categories";
import { loadItems } from "@/lib/data";
import { getServerCurrency } from "@/lib/market/currency";
import { ALL_MARKETS, localeToMarket } from "@/lib/market/market";
import {
  buildDistillateBands,
  buildPriceIndex,
  buildWeightTable,
  STANDARD_WEIGHTS,
} from "@/lib/prices/price-index";
import { buildVapeTiles } from "@/lib/prices/vapes";
import {
  type FaqEntry,
  faqPageJsonLd,
  serializeJsonLd,
} from "@/lib/seo/jsonld";
import { absoluteUrl, marketBaseUrl, pageMetadata } from "@/lib/seo/metadata";

/** Round down to a stable "N+" figure so the title doesn't churn per crawl. */
function roundedCount(count: number): number {
  if (count >= 100) return Math.floor(count / 50) * 50;
  return Math.floor(count / 10) * 10;
}

/** Message-key fragment for a standard weight ("3.5" → "3_5"). */
function sizeKey(size: number): string {
  return String(size).replace(".", "_");
}

/**
 * Absolute date for the "updated" line, taken from the data's own stamp. A
 * pure function of (iso, locale) with a fixed zone and NO clock read, so it
 * is safe to bake into cached HTML.
 */
function formatUpdated(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Listing count and data freshness for metadata. Cached with the same profile
 * and tag as the page body (mirrors the category page's categoryCounts) so
 * generateMetadata never pays an uncached R2 fetch per request.
 */
async function priceFacts(
  mkt: string,
): Promise<{ count: number; updatedAt: string | null }> {
  "use cache";
  cacheLife("items");
  cacheTag("items");
  const index = buildPriceIndex(await loadItems(mkt));
  return {
    count: index?.listingCount ?? 0,
    updatedAt: index?.updatedAt ?? null,
  };
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
  const facts = await priceFacts(market.toLowerCase());
  const count = roundedCount(facts.count);

  // GB keeps the dedicated "UK" wording; other markets interpolate the
  // localized market name. Countless fallback mirrors /browse.
  const isGB = market === "GB";
  const marketName = tMarkets(market);

  // The year comes from the freshest listing stamp, never the clock: the
  // title is baked into cached HTML, so a wall-clock year would freeze at
  // whatever filled the cache. Passed as a string so ICU does not group it
  // into "2,026".
  const year = facts.updatedAt
    ? String(new Date(facts.updatedAt).getUTCFullYear())
    : null;

  return pageMetadata({
    market,
    path: "/prices",
    title: year
      ? isGB
        ? t("meta.titleGBYear", { year })
        : t("meta.titleYear", { market: marketName, year })
      : isGB
        ? t("meta.titleGB")
        : t("meta.title", { market: marketName }),
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
  const weightRows = buildWeightTable(items);
  const vapeTiles = buildVapeTiles(items);
  const distillateBands = buildDistillateBands(items);
  const updatedAt = index?.updatedAt ?? null;

  // Unknown category keys fall back to the raw value instead of surfacing a
  // MISSING error string (same guard as the browse seed cards).
  const categoryLabel = (category: string): string => {
    try {
      return tCategories(category);
    } catch {
      return category;
    }
  };

  const boardLabel = (category: string): string =>
    category === "Flower"
      ? t("bestValue.flowerBoard")
      : category === "Hash"
        ? t("bestValue.hashBoard")
        : t("bestValue.shakeBoard");

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
  const vape1ml = vapeTiles.find((tile) => tile.size === 1);

  const pageUrl = absoluteUrl(market, "/prices");
  const dataUrl = absoluteUrl(
    market,
    `/api/prices?mkt=${market.toLowerCase()}`,
  );
  const currencyUnit = `${currency.code}/g`;

  // FAQ answers quote the SAME computed figures the tables render, and an
  // entry is dropped when its figure is unavailable — nothing here can claim
  // a price the page does not show. The FAQPage markup is built from this
  // list, so the two cannot drift apart.
  const flowerOunce = weightRows
    .find((row) => row.category === "Flower")
    ?.cells.find((cell) => cell?.size === 28);
  const faqCart = vape1ml ?? vapeTiles[0];
  const faqEntries: (FaqEntry & { key: string })[] = index
    ? [
        {
          key: "ounce",
          q: t("faq.ounce.q"),
          a: flowerOunce
            ? t("faq.ounce.a", { price: price(flowerOunce.median) })
            : t("faq.ounce.aPerGram", { price: price(index.overallMedian) }),
        },
        ...(hash
          ? [
              {
                key: "hashGram",
                q: t("faq.hashGram.q"),
                a: t("faq.hashGram.a", { price: price(hash.median) }),
              },
            ]
          : []),
        ...(faqCart
          ? [
              {
                key: "vapeCart",
                q: t("faq.vapeCart.q"),
                a: t("faq.vapeCart.a", {
                  price: price(faqCart.median),
                  size: `${faqCart.size}ml`,
                }),
              },
            ]
          : []),
        { key: "real", q: t("faq.real.q"), a: t("faq.real.a") },
      ]
    : [];

  // Dataset structured data. The dates come from the listing stamps
  // (dateModified = freshest `lua`, temporalCoverage back to the oldest
  // `fsa`): the page renders inside "use cache" with no clock reads, so a
  // wall-clock stamp would freeze into the cache. No `license` — the asking
  // prices are third-party listing data, not ours to license.
  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: heading,
    description,
    url: pageUrl,
    isAccessibleForFree: true,
    keywords: ["cannabis prices", "price per gram", "Little Biggy"],
    spatialCoverage: marketName,
    ...(updatedAt ? { dateModified: updatedAt } : {}),
    ...(updatedAt && index?.firstSeenAt
      ? {
          temporalCoverage: `${index.firstSeenAt.slice(0, 10)}/${updatedAt.slice(0, 10)}`,
        }
      : {}),
    creator: {
      "@type": "Organization",
      name: "BiggyIndex",
      url: `${marketBaseUrl(market)}/`,
    },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: dataUrl,
      },
    ],
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
            ...(vape1ml
              ? [
                  {
                    "@type": "PropertyValue",
                    name: t("vapes.medianLabel"),
                    value: Number((vape1ml.median * currency.rate).toFixed(2)),
                    unitText: `${currency.code}/cart`,
                  },
                ]
              : []),
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
      {faqEntries.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(faqPageJsonLd(faqEntries)),
          }}
        />
      )}

      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
          <h1 className="text-3xl font-bold text-foreground">{heading}</h1>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            {t("intro", {
              count: index?.listingCount ?? 0,
              currency: currency.code,
            })}
          </p>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            {t("weightsIntro")}
          </p>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            {t("scopeNote")}
          </p>
          {updatedAt && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("updated", { date: formatUpdated(updatedAt, locale) })}
            </p>
          )}

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

              {/* Per-category table. The rows carry the category anchors
                  other pages deep-link to (#flower, #hash, #shake,
                  #concentrates). */}
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
                            id={stats.category.toLowerCase()}
                            className={`scroll-mt-24${i > 0 ? " border-t border-border" : ""}`}
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

              {/* Per-size medians — what an eighth, a quarter, a half ounce
                  and an ounce actually cost. Sizes match the stamped grams
                  exactly; thin cells are withheld rather than quoted. */}
              {weightRows.length > 0 && (
                <section id="weights" className="mt-12 scroll-mt-24">
                  <h2 className="text-lg font-semibold text-foreground mb-2">
                    {t("weights.heading")}
                  </h2>
                  <p className="text-sm text-muted leading-relaxed">
                    {t("weights.caption")}
                  </p>
                  <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full min-w-[36rem] border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className={thClass}>{t("table.category")}</th>
                          {STANDARD_WEIGHTS.map((size) => (
                            <th key={size} className={`${thClass} text-right`}>
                              {t(`weights.size${sizeKey(size)}`)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {weightRows.map((row, i) => (
                          <tr
                            key={row.category}
                            className={
                              i > 0 ? "border-t border-border" : undefined
                            }
                          >
                            <td
                              className={`${tdClass} font-medium text-foreground`}
                            >
                              {categoryLabel(row.category)}
                            </td>
                            {row.cells.map((cell, ci) => (
                              <td
                                key={STANDARD_WEIGHTS[ci]}
                                className={`${tdClass} text-right`}
                              >
                                {cell ? (
                                  <>
                                    <span className="font-medium text-foreground">
                                      {price(cell.median)}
                                    </span>
                                    <span className="block text-xs text-muted-foreground leading-snug">
                                      {t("weights.cellMeta", {
                                        count: cell.listings,
                                      })}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">
                                    &ndash;
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Best-value boards — crawlable item links, one per seller */}
              <section className="mt-12">
                <h2 className="text-lg font-semibold text-foreground mb-2">
                  {t("bestValue.heading")}
                </h2>
                <p className="text-sm text-muted leading-relaxed">
                  {t("bestValue.intro")}
                </p>
                <div className="mt-4 space-y-4">
                  {index.boards.map((board) => (
                    <div key={board.category}>
                      <h3 className="text-sm font-semibold text-foreground mb-2">
                        {boardLabel(board.category)}
                      </h3>
                      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                        <table className="w-full min-w-[28rem] border-collapse">
                          <thead>
                            <tr className="border-b border-border">
                              <th className={thClass}>{t("bestValue.rank")}</th>
                              <th className={thClass}>{t("bestValue.item")}</th>
                              <th className={thClass}>
                                {t("bestValue.seller")}
                              </th>
                              <th className={`${thClass} text-right`}>
                                {t("bestValue.pricePerGram")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {board.rows.map((row, i) => (
                              <tr
                                key={row.ref}
                                className={
                                  i > 0 ? "border-t border-border" : undefined
                                }
                              >
                                <td className={`${tdClass} text-muted`}>
                                  {i + 1}
                                </td>
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
                    </div>
                  ))}
                </div>
              </section>

              {/* Vape carts — per device, never per gram */}
              {vapeTiles.length > 0 && (
                <section id="vapes" className="mt-12 scroll-mt-24">
                  <h2 className="text-lg font-semibold text-foreground mb-2">
                    {t("vapes.heading")}
                  </h2>
                  <p className="text-sm text-muted leading-relaxed">
                    {t("vapes.intro")}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 max-w-md">
                    {vapeTiles.map((tile) => (
                      <div
                        key={tile.size}
                        className="rounded-2xl border border-border bg-surface p-4"
                      >
                        <p className="text-lg font-bold text-foreground">
                          {price(tile.median)}
                        </p>
                        <p className="mt-1 text-xs text-muted leading-snug">
                          {t("vapes.tileLabel", { size: `${tile.size}ml` })}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground leading-snug">
                          {t("vapes.tileMeta", {
                            items: tile.items,
                            sellers: tile.sellers,
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Distillate — per ml inside a size band */}
              {distillateBands.length > 0 && (
                <section id="distillate" className="mt-12 scroll-mt-24">
                  <h2 className="text-lg font-semibold text-foreground mb-2">
                    {t("distillate.heading")}
                  </h2>
                  <p className="text-sm text-muted leading-relaxed">
                    {t("distillate.intro")}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3 max-w-lg">
                    {distillateBands.map((band) => (
                      <div
                        key={band.key}
                        className="rounded-2xl border border-border bg-surface p-4"
                      >
                        <p className="text-lg font-bold text-foreground">
                          {t("distillate.perMl", {
                            price: price(band.median),
                          })}
                        </p>
                        <p className="mt-1 text-xs text-muted leading-snug">
                          {t(`distillate.${band.key}`)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground leading-snug">
                          {t("distillate.tileMeta", { count: band.count })}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* FAQ — the questions people actually type, answered with the
              figures above. Same list rhythm as the methodology block. */}
          {faqEntries.length > 0 && (
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {t("faq.heading")}
              </h2>
              <ul className="mt-4 space-y-4">
                {faqEntries.map((entry) => (
                  <li key={entry.key}>
                    <h3 className="text-sm font-semibold text-foreground mb-1">
                      {entry.q}
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      {entry.a}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Methodology — the honesty block */}
          <section className="mt-12">
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t("methodology.heading")}
            </h2>
            <ul className="mt-4 space-y-2">
              {(
                ["source", "scope", "inclusion", "refresh", "honesty"] as const
              ).map((key) => (
                <li
                  key={key}
                  className="text-sm text-muted leading-relaxed pl-4 relative before:absolute before:left-0 before:content-['–']"
                >
                  {t(`methodology.${key}`)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
