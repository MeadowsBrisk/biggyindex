/**
 * /prices — cannabis price index, fully server-rendered.
 *
 * Every number on this page is an asking price from a live Little Biggy
 * listing, converted to the market currency server-side. Per-gram figures
 * are scoped to categories genuinely sold by cannabis weight (flower,
 * shake, hash, concentrates): edibles list the FOOD's mass, so a chocolate
 * spread at pennies "per gram" would head every table it is allowed into.
 * Vapes sell per device and distillate per ml, so each gets its own
 * section in its own unit. This is deliberately NOT framed as a
 * street-price survey — the methodology section states what the figures
 * are.
 *
 * No client JS beyond the shared header/footer: stats, tables and the
 * best-value boards are plain server markup with crawlable item links.
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
import type { Item, ItemVariant } from "@/lib/types";

/** Categories sold by cannabis weight — the only ones where £/g is comparable. */
const WEIGHT_CATEGORIES = new Set(["Flower", "Shake", "Hash", "Concentrates"]);
/** Categories that get a best-value board of their own. */
const BOARD_CATEGORIES = ["Flower", "Hash", "Shake"] as const;
/** Rows per best-value board (one per seller). */
const BOARD_ROWS = 5;
/** Categories need this many gram-priced listings to earn a table row. */
const MIN_CATEGORY_LISTINGS = 5;
/** Sellers use 999 as a "sold out" placeholder, not a price. */
const SENTINEL_USD = 999;
/** Per-gram sanity ceiling — the legitimate live maximum is ~$200/g hash. */
const MAX_USD_PER_GRAM = 300;
/** Shake-grade matter sold inside a Flower listing — keep it off the Flower board. */
const SHAKE_TEXT_RE = /\b(?:shake|trim|dust|smalls|stems)\b/i;
/** Battery/hardware rows inside vape listings — never device prices. */
const VAPE_ACCESSORY_RE =
  /\bbatter(?:y|ies)\b|\bcharger\b|\bkit\b|\bjuice\b|\bvaporizer\b/i;
/** Device sizes (ml ≡ g for carts) the vape tiles recognise. */
const VAPE_SIZES = new Set([0.5, 1, 1.25, 2]);

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
  /** Item's cheapest USD-per-gram across its gram-denominated variants. */
  usdPerGram: number;
}

interface BestValueBoard {
  category: (typeof BOARD_CATEGORIES)[number];
  rows: BestValueRow[];
}

interface VapeTile {
  /** Device size in ml-equivalent (sellers list 1g and 1ml interchangeably). */
  size: number;
  /** Median of per-listing median single-device prices, USD. */
  median: number;
  items: number;
  sellers: number;
}

interface DistillateBand {
  key: "bandSmall" | "bandMid" | "bandLarge";
  /** Median USD per ml within the band. */
  median: number;
  count: number;
}

interface PriceIndex {
  /** Weight-category items with at least one valid gram-denominated variant. */
  listingCount: number;
  overallMedian: number;
  cheapest: number;
  categories: CategoryStats[];
  boards: BestValueBoard[];
}

function validPerGram(usd: number, g: number): boolean {
  return (
    Number.isFinite(usd) &&
    Number.isFinite(g) &&
    usd > 0 &&
    g > 0 &&
    usd !== SENTINEL_USD &&
    usd / g <= MAX_USD_PER_GRAM
  );
}

/** Per-gram asking prices for one item; sentinel and nonsense values dropped. */
function perGramPrices(item: Item, excludeShakeText = false): number[] {
  const prices: number[] = [];
  for (const variant of item.v ?? []) {
    const { usd, g } = variant;
    if (typeof usd !== "number" || typeof g !== "number") continue;
    if (!validPerGram(usd, g)) continue;
    if (excludeShakeText && SHAKE_TEXT_RE.test(variant.d ?? "")) continue;
    prices.push(usd / g);
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

function median(values: number[]): number {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

function buildPriceIndex(items: Item[]): PriceIndex | null {
  const byCategory = new Map<string, { prices: number[]; listings: number }>();
  const allPrices: number[] = [];
  const candidates = new Map<string, BestValueRow[]>();
  let listingCount = 0;

  for (const item of items) {
    if (!item.c || !WEIGHT_CATEGORIES.has(item.c)) continue;
    const prices = perGramPrices(item);
    if (prices.length === 0) continue;
    listingCount++;
    allPrices.push(...prices);

    let entry = byCategory.get(item.c);
    if (!entry) {
      entry = { prices: [], listings: 0 };
      byCategory.set(item.c, entry);
    }
    entry.prices.push(...prices);
    entry.listings++;

    if ((BOARD_CATEGORIES as readonly string[]).includes(item.c)) {
      // Flower board only ranks bud: a "28 g shake" tier or a "dust and
      // stems" listing filed under Flower belongs on the shake board.
      const boardPrices =
        item.c === "Flower"
          ? SHAKE_TEXT_RE.test(item.n)
            ? []
            : perGramPrices(item, true)
          : prices;
      if (boardPrices.length > 0) {
        const rows = candidates.get(item.c) ?? [];
        rows.push({
          ref: String(item.refNum ?? item.id),
          name: decodeEntities(item.n),
          seller: item.sn ?? null,
          usdPerGram: Math.min(...boardPrices),
        });
        candidates.set(item.c, rows);
      }
    }
  }

  if (allPrices.length === 0) return null;
  allPrices.sort((a, b) => a - b);

  const boards: BestValueBoard[] = BOARD_CATEGORIES.map((category) => {
    const rows = (candidates.get(category) ?? []).sort(
      (a, b) => a.usdPerGram - b.usdPerGram,
    );
    // One row per seller, so a single seller's menu can't fill the board.
    const seen = new Set<string>();
    const deduped: BestValueRow[] = [];
    for (const row of rows) {
      const key = row.seller ?? row.ref;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
      if (deduped.length === BOARD_ROWS) break;
    }
    return { category, rows: deduped };
  }).filter((board) => board.rows.length > 0);

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
    listingCount,
    overallMedian: quantile(allPrices, 0.5),
    cheapest: allPrices[0],
    categories,
    boards,
  };
}

/**
 * Single-device size in ml-equivalent, or null. Sellers list 1g and 1ml
 * carts interchangeably, so stamped grams and ml resolve to one scale.
 * Pack rows (ol "N×Mml" with N>1) are excluded — the tiles quote what one
 * cart costs, not a divided bundle price.
 */
function vapeDeviceSize(v: ItemVariant): number | null {
  if (VAPE_ACCESSORY_RE.test(v.d ?? "")) return null;
  const packMatch = v.ol?.match(/^(\d+)×[\d.]+ml$/);
  if (packMatch && parseInt(packMatch[1], 10) > 1) return null;
  if (typeof v.g === "number" && VAPE_SIZES.has(v.g)) return v.g;
  if (v.u === "ml" && typeof v.q === "number" && VAPE_SIZES.has(v.q)) {
    return v.q;
  }
  return null;
}

function buildVapeTiles(items: Item[]): VapeTile[] {
  // size → per-item single-device prices, plus seller ids per size.
  const bySize = new Map<
    number,
    { perItem: Map<string, number[]>; sellers: Set<string> }
  >();
  for (const item of items) {
    if (item.c !== "Vapes") continue;
    for (const v of item.v ?? []) {
      if (typeof v.usd !== "number" || v.usd <= 0 || v.usd === SENTINEL_USD)
        continue;
      const size = vapeDeviceSize(v);
      if (size == null) continue;
      let entry = bySize.get(size);
      if (!entry) {
        entry = { perItem: new Map(), sellers: new Set() };
        bySize.set(size, entry);
      }
      const key = String(item.refNum ?? item.id);
      const prices = entry.perItem.get(key) ?? [];
      prices.push(v.usd);
      entry.perItem.set(key, prices);
      if (item.sid != null) entry.sellers.add(String(item.sid));
    }
  }

  // Median of per-listing medians, so one long menu is one vote.
  return [1, 0.5]
    .map((size) => {
      const entry = bySize.get(size);
      if (!entry || entry.perItem.size < 3) return null;
      const itemMedians = [...entry.perItem.values()].map(median);
      return {
        size,
        median: median(itemMedians),
        items: entry.perItem.size,
        sellers: entry.sellers.size,
      };
    })
    .filter((tile): tile is VapeTile => tile !== null);
}

function buildDistillateBands(items: Item[]): DistillateBand[] {
  const bands: Record<
    DistillateBand["key"],
    { perMl: number[]; refs: Set<string> }
  > = {
    bandSmall: { perMl: [], refs: new Set() },
    bandMid: { perMl: [], refs: new Set() },
    bandLarge: { perMl: [], refs: new Set() },
  };
  const allRefs = new Set<string>();
  for (const item of items) {
    if (item.c !== "Distillate") continue;
    for (const v of item.v ?? []) {
      if (v.u !== "ml" || typeof v.q !== "number" || v.q <= 0) continue;
      if (typeof v.usd !== "number" || v.usd <= 0 || v.usd === SENTINEL_USD)
        continue;
      const key = v.q <= 5 ? "bandSmall" : v.q <= 50 ? "bandMid" : "bandLarge";
      bands[key].perMl.push(v.usd / v.q);
      const ref = String(item.refNum ?? item.id);
      bands[key].refs.add(ref);
      allRefs.add(ref);
    }
  }
  if (allRefs.size < MIN_CATEGORY_LISTINGS) return [];
  return (Object.keys(bands) as DistillateBand["key"][])
    .map((key) =>
      bands[key].perMl.length > 0
        ? { key, median: median(bands[key].perMl), count: bands[key].refs.size }
        : null,
    )
    .filter((band): band is DistillateBand => band !== null);
}

/** Round down to a stable "N+" figure so the title doesn't churn per crawl. */
function roundedCount(count: number): number {
  if (count >= 100) return Math.floor(count / 50) * 50;
  return Math.floor(count / 10) * 10;
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
    if (!item.c || !WEIGHT_CATEGORIES.has(item.c)) continue;
    if (perGramPrices(item).length > 0) count++;
  }
  return count;
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
  const vapeTiles = buildVapeTiles(items);
  const distillateBands = buildDistillateBands(items);

  // Unknown category keys fall back to the raw value instead of surfacing a
  // MISSING error string (same guard as the browse seed cards).
  const categoryLabel = (category: string): string => {
    try {
      return tCategories(category);
    } catch {
      return category;
    }
  };

  const boardLabel = (category: (typeof BOARD_CATEGORIES)[number]): string =>
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
            {t("scopeNote")}
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
                <section className="mt-12">
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
                <section className="mt-12">
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
