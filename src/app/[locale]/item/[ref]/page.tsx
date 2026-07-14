/**
 * Full item page - SEO-crawlable, server-rendered.
 * Reached via direct URL or when JS is disabled.
 *
 * Uses `item-detail` cache tag so revalidation of browse pages
 * doesn't trigger regeneration of all detail pages (and vice versa).
 *
 * Loads the merged detail blob (reviews, price history, shipping)
 * for a complete item view with a sticky "Browse the Index" top bar.
 */

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Fragment } from "react";
import { ItemDetailGallery } from "@/components/ItemDetailGallery";
import { ItemDetailTabs } from "@/components/ItemDetailTabs";
import {
  type ItemReview,
  ItemReviewsBlock,
} from "@/components/ItemReviewsBlock";
import { LocalizedText } from "@/components/LocalizedText";
import { OutboundLink } from "@/components/OutboundLink";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { ShowOriginalToggle } from "@/components/ShowOriginalToggle";
import { SuggestLink } from "@/components/SuggestLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { categoryToSlug } from "@/lib/categories";
import {
  type ArchivedDetailBlob,
  loadArchivedDetail,
  loadItems,
  loadMergedDetail,
} from "@/lib/data";
import { decodeEntities, formatPriceRangeChange } from "@/lib/format";
import { getItemGalleryImages } from "@/lib/images";
import { getServerCurrency } from "@/lib/market/currency";
import {
  ALL_MARKETS,
  localeToMarket,
  type MarketCode,
} from "@/lib/market/market";
import { R2Keys, readR2JSON } from "@/lib/r2";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import {
  absoluteUrl,
  compactMetaDescription,
  pageMetadata,
} from "@/lib/seo/metadata";
import { getLittleBiggyItemUrl } from "@/lib/tracking/littlebiggy";
import type { Item, MergedDetailBlob, PriceSnapshot } from "@/lib/types";
import {
  itemVariantContext,
  parseVariant,
  pricePerUnit,
  UNIT_DISPLAY_LABEL,
} from "@/lib/variants";
import { RelatedItemsSections } from "./RelatedItemsSections";

interface ItemPageProps {
  params: Promise<{ locale: string; ref: string }>;
}

type AttributeScalar = string | number | boolean;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

interface RawDetailReview {
  id?: string | number | null;
  created?: number | null;
  rating?: unknown;
  daysToArrive?: number | null;
  segments?: Array<{ type?: string | null; value?: string | null }> | null;
  item?: {
    refNum?: string | number | null;
    name?: string | null;
    id?: string | number | null;
  } | null;
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function ratingColor(rating: number): string {
  if (rating <= 3) return "text-red-500";
  if (rating <= 5) return "text-amber-500";
  if (rating <= 7) return "text-lime-500";
  return "text-emerald-500";
}

function attributeLabel(key: string): string {
  if (key === "mg") return "Potency";
  if (key === "mlSize") return "Size";
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function attributeValue(key: string, value: AttributeScalar): string {
  if (key === "mg") return `${value} mg`;
  if (key === "mlSize") return `${value} ml`;
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value);
}

function attributeRows(
  attrs: MergedDetailBlob["at"],
): Array<{ key: string; label: string; values: string[] }> {
  if (!attrs) return [];

  return Object.entries(attrs)
    .filter(([key]) => key !== "tier")
    .map(([key, rawValue]) => {
      const values = (Array.isArray(rawValue) ? rawValue : [rawValue])
        .filter(
          (value): value is AttributeScalar =>
            value != null && value !== false && value !== "",
        )
        .map((value) => attributeValue(key, value));

      return { key, label: attributeLabel(key), values };
    })
    .filter((row) => row.values.length > 0);
}

function toFiniteNumber(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemReviewsFromDetail(
  rawReviews: unknown[] | undefined,
  item: MergedDetailBlob,
): ItemReview[] {
  const fallbackItemId = toFiniteNumber(item.id ?? item.refNum ?? null) ?? 0;
  const fallbackItem = {
    refNum: String(item.refNum ?? item.id ?? ""),
    name: decodeEntities(item.n),
    id: fallbackItemId,
  };

  return (rawReviews ?? []).flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const raw = value as RawDetailReview;
    if (typeof raw.rating !== "number" || !Number.isFinite(raw.rating)) {
      return [];
    }

    const created =
      typeof raw.created === "number" && Number.isFinite(raw.created)
        ? raw.created
        : 0;
    const explicitId = toFiniteNumber(raw.id ?? null);
    const id = explicitId ?? created * 1000 + index;
    const daysToArrive =
      typeof raw.daysToArrive === "number" && Number.isFinite(raw.daysToArrive)
        ? raw.daysToArrive
        : null;
    const segments = Array.isArray(raw.segments)
      ? raw.segments.flatMap((segment) => {
          if (
            !segment ||
            typeof segment.type !== "string" ||
            typeof segment.value !== "string"
          ) {
            return [];
          }
          return [{ type: segment.type, value: segment.value }];
        })
      : [];
    const rawItemId = toFiniteNumber(raw.item?.id ?? null);
    const reviewItem =
      raw.item?.refNum && raw.item.name
        ? {
            refNum: String(raw.item.refNum),
            name: raw.item.name,
            id: rawItemId ?? fallbackItemId,
          }
        : fallbackItem;

    return [
      {
        id,
        created,
        rating: raw.rating,
        daysToArrive,
        segments,
        item: reviewItem,
      },
    ];
  });
}

function itemMetadataDescription(
  item: MergedDetailBlob,
  metaT: Translator,
  tCategories: Translator,
): string {
  const seller = item.sn ? decodeEntities(item.sn) : null;
  const description = decodeEntities(item.d ?? item.dEn ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (description) {
    return compactMetaDescription(
      `${description}${seller ? ` ${metaT("soldBy", { seller })}` : ""}`,
    );
  }

  const name = decodeEntities(item.n);
  const category = item.c
    ? tCategories.has(item.c)
      ? tCategories(item.c)
      : item.c
    : null;
  const facts = [
    category ? metaT("categoryFact", { category }) : null,
    item.rs?.cnt ? metaT("reviewsFact", { count: item.rs.cnt }) : null,
    item.rs?.avg
      ? metaT("ratingFact", { rating: item.rs.avg.toFixed(1) })
      : null,
  ].filter(Boolean);

  const lead = seller
    ? metaT("browseFallback", { name, seller })
    : metaT("browseFallbackNoSeller", { name });

  return compactMetaDescription(`${lead} ${facts.join(". ")}`);
}

/**
 * Markets in which each item ref currently exists, keyed by ref.
 *
 * Mirrors the presence map itemsSitemap() builds so page-level hreflang
 * and sitemap hreflang emit identical clusters — a self-only page cluster
 * contradicting a full sitemap cluster makes Google discard both.
 *
 * Cached once for ALL item pages (one read of each market's item list),
 * so metadata generation never fetches presence per item.
 */
async function itemMarketPresence(): Promise<Record<string, MarketCode[]>> {
  "use cache";
  cacheLife("items");
  cacheTag("items");

  const allResults = await Promise.all(
    ALL_MARKETS.map(async (candidateMarket) => {
      const items = await readR2JSON<Item[]>(
        R2Keys.items(candidateMarket.toLowerCase()),
      );
      return { market: candidateMarket, items: items ?? [] };
    }),
  );

  const presence: Record<string, MarketCode[]> = {};
  for (const { market: candidateMarket, items } of allResults) {
    for (const item of items) {
      const ref = String(item.refNum ?? item.id);
      let itemMarkets = presence[ref];
      if (!itemMarkets) {
        itemMarkets = [];
        presence[ref] = itemMarkets;
      }
      if (!itemMarkets.includes(candidateMarket)) {
        itemMarkets.push(candidateMarket);
      }
    }
  }
  return presence;
}

interface ItemDetailResult {
  live: MergedDetailBlob | null;
  archived: ArchivedDetailBlob | null;
}

/**
 * Cached item-detail load, shared by generateMetadata AND the ItemPage body so
 * the R2 fetches happen once per (ref, market) — the cache key MUST include the
 * market: GB/IE share English copy but are distinct markets/hosts with
 * distinct data. Live blob first; delisted items fall back to the
 * manifest-gated archive snapshot.
 *
 * This wrapper exists so generateMetadata performs ZERO uncached IO — a
 * single raw fetch there marks the whole response dynamic under
 * cacheComponents, and Next emits `private,no-store` (every visitor and
 * crawler hits origin). With all metadata IO cached the page gets the same
 * durable CDN TTL as /browse.
 *
 * INVARIANT: unknown refs return {null, null} — the nulls travel OUT of the
 * cache scope and the CALLER throws notFound(). Never throw it in here.
 */
async function loadItemDetail(
  ref: string,
  mkt: string,
): Promise<ItemDetailResult> {
  "use cache";
  cacheLife("item-detail");
  cacheTag("item-detail");
  cacheTag("items");

  const live = await loadMergedDetail(ref, mkt);
  const archived = live ? null : await loadArchivedDetail(ref, mkt);
  return { live, archived };
}

export async function generateMetadata({
  params,
}: ItemPageProps): Promise<Metadata> {
  const { ref, locale } = await params;
  const market = localeToMarket(locale);
  const mkt = market.toLowerCase();

  // Live blob first; delisted items fall back to the archive snapshot and
  // stay INDEXABLE (normal canonical, no noindex) — they render as full
  // "no longer listed" pages.
  const { live, archived } = await loadItemDetail(ref, mkt);
  const item = live ?? archived;

  // Truly unknown ref (no live blob AND no archive entry): real 404.
  // Metadata is blocking for html-limited bots (incl. Googlebot), so
  // throwing here guarantees crawlers the status.
  if (!item) notFound();

  const name = decodeEntities(item.n);
  const seller = item.sn ? decodeEntities(item.sn) : null;
  const image = getItemGalleryImages(item, "full", { forceStatic: true })[0];
  const presence = await itemMarketPresence();
  // The page can render from the shared detail blob for an item already
  // delisted in this market — the cluster must still self-reference the
  // canonical's own market or Google treats it as invalid.
  //
  // ARCHIVED pages are always self-only: the ref may still be LIVE in other
  // markets (their pages/sitemaps emit clusters that exclude this market),
  // so advertising a cross-market cluster here would be non-reciprocal.
  // This also matches archiveSitemap's deliberate self-only entries.
  const presenceMarkets = presence[ref] ?? [];
  const alternateMarkets = archived
    ? [market]
    : presenceMarkets.includes(market)
      ? presenceMarkets
      : [market, ...presenceMarkets];

  const metaT = await getTranslations({ locale, namespace: "item.meta" });
  const tCategories = await getTranslations({
    locale,
    namespace: "categories",
  });

  let title: string;
  if (archived) {
    const archiveT = await getTranslations({
      locale,
      namespace: "item.archive",
    });
    const suffix = archiveT("titleSuffix");
    title = seller
      ? metaT("titleArchived", { name, seller, suffix })
      : metaT("titleArchivedNoSeller", { name, suffix });
  } else {
    title = seller
      ? metaT("title", { name, seller })
      : metaT("titleNoSeller", { name });
  }

  return pageMetadata({
    market,
    path: `/item/${encodeURIComponent(ref)}`,
    title,
    description: itemMetadataDescription(item, metaT, tCategories),
    alternateMarkets,
    images: image ? [{ url: image, alt: name }] : undefined,
    ogType: "product",
  });
}

/** Top-hotness item refs prerendered at build (see generateStaticParams). */
const PRERENDER_ITEM_COUNT = 24;

/**
 * A NON-EMPTY generateStaticParams is what flips this route from PPR-dynamic
 * (private,no-store + x-nextjs-postponed on every hit) to durably-cached ISR —
 * the exact change that flipped /category/[slug] in round 2. An ABSENT (or
 * empty) one does NOT work here, despite food-aggregator's item route caching
 * without one, because of a structural difference:
 *
 * This route sits under the `[locale]` ROOT param (app/[locale] is directly
 * under the root app/layout.tsx). Next's buildAppStaticPaths
 * (next/dist/build/static-paths/app.js) therefore emits, per locale, a PARTIAL
 * static shell `/{loc}/item/[ref]` whose `throwOnEmptyStaticShell` is set true
 * by assignStaticShellMetadata UNLESS that shell's trie node has a concrete
 * child param. With no child ref, the whole-page 'use cache' body (which awaits
 * params.ref) yields an EMPTY shell for every locale → the route is treated as
 * fully dynamic and Netlify never durably caches it (observed in rounds 1-2).
 * Supplying >=1 concrete ref per locale gives each shell a child →
 * throwOnEmptyStaticShell=false → the route registers as static-with-fallback:
 * enumerated refs prerender; NON-enumerated refs render on demand then durably
 * cache (fallback ISR, old fallback:'blocking'); unknown refs still hit
 * notFound() during that render → real 404.
 *
 * food-aggregator's item route has NO `[locale]` root param (single domain,
 * top-level `[slug]`): its base route gets a PRERENDER fallback with zero root
 * params and caches WITHOUT generateStaticParams — a pattern that does NOT
 * transfer to a route nested under a root param.
 *
 * Returns ONLY { ref }; the parent [locale] segment supplies { locale } and
 * Next merges them (mirrors category/[slug] returning only { slug }).
 *
 * Runs at BUILD on Netlify. loadItems reads PUBLIC R2 over plain fetch
 * (lib/r2 readR2JSON — no credentials, no headers()/cookies()), safe outside
 * request context. ANY failure → a single sentinel ref that renders the
 * not-found path: the array is NEVER empty (EmptyGenerateStaticParamsError)
 * and the build NEVER fails on a transient R2 blip.
 */
export async function generateStaticParams(): Promise<Array<{ ref: string }>> {
  try {
    const items = await loadItems("gb");
    const refs = Array.from(
      new Set(
        [...items]
          .sort((a, b) => (b.h ?? 0) - (a.h ?? 0))
          .slice(0, PRERENDER_ITEM_COUNT)
          .map((item) => String(item.refNum ?? item.id))
          .filter((ref) => ref && ref !== "undefined" && ref !== "null"),
      ),
    );
    return refs.length > 0
      ? refs.map((ref) => ({ ref }))
      : [{ ref: "build-fallback" }];
  } catch {
    return [{ ref: "build-fallback" }];
  }
}

export default async function ItemPage({ params }: ItemPageProps) {
  "use cache";
  cacheLife("item-detail");
  // Both tags: the page body is item-detail data, but the related/more-from
  // sections derive from the items dataset — an "items" revalidation must
  // refresh them too or they'd link delisted items for up to 48h.
  cacheTag("item-detail");
  cacheTag("items");

  const { ref, locale } = await params;
  const t = await getTranslations({ locale, namespace: "item.page" });
  const detailT = await getTranslations({ locale, namespace: "item.detail" });
  const archiveT = await getTranslations({ locale, namespace: "item.archive" });
  const tCategories = await getTranslations({
    locale,
    namespace: "categories",
  });
  const market = localeToMarket(locale);
  const mkt = market.toLowerCase();
  // Stored prices are USD — convert to the market currency before display
  // (mirrors the client's currencyDisplayAtom). Falls back to "$" + USD
  // amounts when rates are unavailable; never a wrong symbol.
  const currency = await getServerCurrency(market);
  const fmtMoney = (usd: number) =>
    `${currency.symbol}${(usd * currency.rate).toFixed(2)}`;

  // Live blob first; delisted items render as full archived pages from the
  // manifest-gated snapshot. Archive fetch failures return null and fall
  // through to notFound() with the truly-unknown refs. Same cached loader
  // as generateMetadata — the data is fetched once per (ref, market).
  const { live, archived } = await loadItemDetail(ref, mkt);
  const item = live ?? archived;

  if (!item) notFound();

  const isArchived = archived != null;
  const archivedDate = isArchived ? fmtDate(archived.arc?.at) : null;

  const translatedName = decodeEntities(item.n);
  const englishName = item.nEn ? decodeEntities(item.nEn) : null;
  const name = translatedName;
  const translatedDesc = item.d ? decodeEntities(item.d) : null;
  const englishDesc = item.dEn ? decodeEntities(item.dEn) : null;
  const images = getItemGalleryImages(item);
  const reviews = itemReviewsFromDetail(item.reviews, item);
  const priceHistory = (item as MergedDetailBlob).ph ?? [];
  const shipOptions = (item as MergedDetailBlob).shOpts ?? [];
  // Archived items have no live listing to link out to — the outbound
  // "View on Little Biggy" CTA is replaced by a seller-page link below.
  const shareLink = isArchived ? null : getLittleBiggyItemUrl(item);
  const sellerHref =
    item.sid != null ? `/seller/${encodeURIComponent(String(item.sid))}` : null;
  const sellerLabel = item.sn ? decodeEntities(item.sn) : null;
  const attrs = attributeRows(item.at);
  const variantContext = itemVariantContext(item);

  // Breadcrumb targets the indexable /category/{slug} landing page —
  // /browse?cat= is robots-blocked so links there pass nothing. Categories
  // without a landing page (null slug) render as plain text.
  const categorySlug = categoryToSlug(item.c);
  const categoryLabel = item.c
    ? tCategories.has(item.c)
      ? tCategories(item.c)
      : item.c
    : null;

  const variantRows =
    item.v
      ?.filter((variant) => variant.usd > 0)
      .map((variant, index) => {
        const parsed = parseVariant(variant, variantContext);
        const ppu = pricePerUnit(variant.usd, parsed);
        const unitLabel = parsed
          ? (UNIT_DISPLAY_LABEL[parsed.unit] ?? parsed.unit)
          : null;

        return {
          key: variant.vid != null ? String(variant.vid) : String(index),
          label: decodeEntities(variant.d || parsed?.originalLabel || "-"),
          price: variant.usd,
          ppu,
          unitLabel,
        };
      }) ?? [];

  const bestPpuKey = (() => {
    if (variantRows.length <= 1) return null;
    let best: { key: string; ppu: number } | null = null;
    for (const row of variantRows) {
      if (row.ppu != null && (!best || row.ppu < best.ppu)) {
        best = { key: row.key, ppu: row.ppu };
      }
    }
    return best?.key ?? null;
  })();

  // ─── Structured data (Product + BreadcrumbList) ────────────────────
  const canonicalUrl = absoluteUrl(market, `/item/${encodeURIComponent(ref)}`);
  const plainDescription = decodeEntities(item.d ?? item.dEn ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    image: images.length > 0 ? images : undefined,
    description: plainDescription || undefined,
    sku: ref,
    url: canonicalUrl,
    category: item.c ?? undefined,
    brand: sellerLabel
      ? { "@type": "Organization", name: sellerLabel }
      : undefined,
    offers:
      item.uMin != null
        ? {
            "@type": "AggregateOffer",
            // Converted market-currency amounts + ISO code — never raw
            // USD numbers behind a local currency code.
            lowPrice: (item.uMin * currency.rate).toFixed(2),
            highPrice: ((item.uMax ?? item.uMin) * currency.rate).toFixed(2),
            priceCurrency: currency.code,
            offerCount: Math.max(variantRows.length, 1),
            availability: isArchived
              ? "https://schema.org/Discontinued"
              : "https://schema.org/InStock",
            url: canonicalUrl,
          }
        : undefined,
    // Same 1-10 convention as the seller page's AggregateRating.
    aggregateRating:
      item.rs?.cnt && item.rs.avg != null
        ? {
            "@type": "AggregateRating",
            ratingValue: item.rs.avg.toFixed(1),
            reviewCount: String(item.rs.cnt),
            bestRating: "10",
            worstRating: "1",
          }
        : undefined,
  };
  // Mirrors the visual breadcrumb: Browse → category landing page → item.
  const breadcrumbTrail = [
    { name: t("browseIndex"), url: absoluteUrl(market, "/browse") },
    ...(categorySlug && categoryLabel
      ? [
          {
            name: categoryLabel,
            url: absoluteUrl(market, `/category/${categorySlug}`),
          },
        ]
      : []),
    { name, url: canonicalUrl },
  ];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbTrail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };

  return (
    <>
      {/* og:type "product" — Next's metadata resolver rejects it
          (pageMetadata suppresses the default og:type for item pages), so
          it's rendered directly; React 19 hoists it into <head>. Lives inside
          the cached page body so nothing dynamic sits outside the cache
          scope (a dynamic shell would make Next postpone the whole route). */}
      <meta property="og:type" content="product" />
      {/* NO manual <link rel="preload"> for the LCP gallery image: React's
          Fizz renderer AUTO-emits an image preload for any SSR'd <img> that
          is loading="eager" + fetchPriority="high" (ItemDetailGallery's
          static first image qualifies), so a manual link just duplicates it
          in <head> — and unlike a manual href it can never drift from the
          src the gallery actually renders. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
      <ItemPageBar
        categoryLabel={categoryLabel}
        categoryHref={categorySlug ? `/category/${categorySlug}` : null}
        subcategoryLabel={item.sc?.[0]}
        browseLabel={t("browseIndex")}
        breadcrumbLabel={t("breadcrumb")}
      />

      <main className="idp">
        {isArchived && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {archiveT("bannerTitle")}
            </p>
            {archivedDate && (
              <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-200/80">
                {archiveT("bannerDelisted", { date: archivedDate })}
              </p>
            )}
          </div>
        )}
        <div className="ido-panel idp-panel">
          <div className="ido-grid">
            <div className="ido-left">
              <div className="ido-image-area">
                <ItemDetailGallery images={images} alt={name} itemKey={ref} />
              </div>
            </div>

            <div className="ido-center">
              <div className="ido-center__header">
                <div className="flex flex-wrap gap-1.5">
                  {item.c && (
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {item.c}
                    </span>
                  )}
                  {item.sc?.map((subcategory) => (
                    <span
                      key={subcategory}
                      className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted"
                    >
                      {subcategory}
                    </span>
                  ))}
                </div>

                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-xl font-bold leading-tight text-foreground">
                    {englishName ? (
                      <LocalizedText
                        translated={translatedName}
                        english={englishName}
                      />
                    ) : (
                      name
                    )}
                  </h1>
                  {englishName && (
                    <ShowOriginalToggle market={market} className="shrink-0" />
                  )}
                </div>

                {item.sn && (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <span>
                      {t("by")}{" "}
                      {item.sid != null ? (
                        <Link
                          href={`/seller/${encodeURIComponent(String(item.sid))}`}
                          prefetch={false}
                          className="font-medium text-foreground transition-colors hover:text-primary"
                        >
                          {item.sn}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">
                          {item.sn}
                        </span>
                      )}
                    </span>
                    {item.sf && (
                      <span className="text-xs text-muted-foreground">
                        {t("shipsFrom", { country: item.sf })}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <ItemDetailTabs
                refNum={ref}
                className="idp-tabs"
                topOffset={140}
              />

              <div className="ido-center__body">
                <section
                  id="prices"
                  data-section-id="prices"
                  className="ido-section"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-semibold text-primary">
                      {item.uMin != null
                        ? fmtMoney(item.uMin)
                        : t("unavailable")}
                      {item.uMax != null &&
                        item.uMax !== item.uMin &&
                        ` - ${fmtMoney(item.uMax)}`}
                    </span>
                    {isArchived && item.uMin != null && (
                      <span className="text-xs font-medium text-muted">
                        {archiveT("lastKnownPrice")}
                      </span>
                    )}
                    {priceHistory.length >= 2 && item.uMin != null && (
                      <PriceChangeBadge
                        history={priceHistory}
                        current={{
                          min: item.uMin,
                          max: item.uMax ?? item.uMin,
                        }}
                      />
                    )}
                  </div>

                  {variantRows.length > 0 && (
                    <div className="ido-card ido-card--variants">
                      <div className="ido-table__caption">
                        <span>{detailT("variants.heading")}</span>
                        <span className="ido-table__count">
                          {variantRows.length}
                        </span>
                      </div>
                      <table className="ido-table">
                        <thead>
                          <tr>
                            <th>{detailT("variants.variant")}</th>
                            <th>
                              {isArchived
                                ? archiveT("lastKnownPrice")
                                : detailT("variants.price")}
                            </th>
                            <th>{detailT("variants.unit")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variantRows.map((variant) => (
                            <tr key={variant.key}>
                              <td>
                                <span className="ido-table__format">
                                  {variant.label}
                                  {variant.key === bestPpuKey && (
                                    <span className="ido-best-value">
                                      {t("bestValue")}
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="ido-table__price">
                                {fmtMoney(variant.price)}
                              </td>
                              <td className="ido-table__ppu">
                                {variant.ppu != null &&
                                variant.unitLabel != null
                                  ? `${fmtMoney(variant.ppu)}/${variant.unitLabel}`
                                  : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {shipOptions.length > 0 && (
                        <div className="ido-ship">
                          <div className="ido-ship__head">
                            <span className="ido-ship__label">
                              {isArchived
                                ? archiveT("lastKnownShipping")
                                : t("shipping")}
                            </span>
                          </div>
                          <div className="ido-ship__chips">
                            {shipOptions.map((option) => (
                              <span
                                key={`${option.label}-${option.cost}`}
                                className={`ido-ship__chip${option.cost === 0 ? " ido-ship__chip--free" : ""}`}
                              >
                                <span className="ido-ship__chip-label">
                                  {option.label}
                                </span>
                                <span className="ido-ship__chip-cost">
                                  {option.cost === 0
                                    ? t("free")
                                    : fmtMoney(option.cost)}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="ido-meta-strip">
                    {item.rs?.avg != null && (
                      <div className="ido-meta-cell">
                        <div className="ido-meta-cell__body">
                          <span className="ido-meta-cell__label">
                            {detailT("meta.rating")}
                          </span>
                          <span className="ido-meta-cell__value">
                            <span className={ratingColor(item.rs.avg)}>
                              {item.rs.avg.toFixed(1)}
                            </span>
                            <span className="ido-meta-cell__unit">/10</span>
                            {item.rs.cnt != null && (
                              <span className="ido-meta-cell__sub">
                                {" "}
                                ({item.rs.cnt})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                    {item.rs?.days != null && (
                      <div className="ido-meta-cell">
                        <div className="ido-meta-cell__body">
                          <span className="ido-meta-cell__label">
                            {detailT("meta.avgDelivery")}
                          </span>
                          <span className="ido-meta-cell__value">
                            {item.rs.days.toFixed(1)}
                            <span className="ido-meta-cell__unit">d</span>
                          </span>
                        </div>
                      </div>
                    )}
                    {item.fsa && (
                      <div className="ido-meta-cell">
                        <div className="ido-meta-cell__body">
                          <span className="ido-meta-cell__label">
                            {detailT("meta.listed")}
                          </span>
                          <span className="ido-meta-cell__value">
                            {fmtDate(item.fsa)}
                          </span>
                        </div>
                      </div>
                    )}
                    {item.lua && (
                      <div className="ido-meta-cell">
                        <div className="ido-meta-cell__body">
                          <span className="ido-meta-cell__label">
                            {detailT("meta.updated")}
                          </span>
                          <span className="ido-meta-cell__value">
                            {fmtDate(item.lua)}
                          </span>
                          {item.lur && (
                            <span className="ido-meta-cell__sub">
                              {item.lur}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section
                  id="description"
                  data-section-id="description"
                  className="ido-section"
                >
                  <div className="ido-card">
                    <div className="ido-card__head">
                      <h2 className="ido-card__title">
                        {detailT("description.heading")}
                      </h2>
                      {englishDesc && <ShowOriginalToggle market={market} />}
                    </div>
                    <div className="ido-card__body">
                      {translatedDesc ? (
                        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                          <LocalizedText
                            translated={translatedDesc}
                            english={englishDesc}
                            preserveNewlines
                          />
                        </p>
                      ) : (
                        <p className="text-sm text-muted italic">
                          {detailT("description.noneProvided")}
                        </p>
                      )}
                    </div>
                  </div>

                  {attrs.length > 0 && (
                    <div className="ido-card">
                      <div className="ido-card__head">
                        <h2 className="ido-card__title">
                          {detailT("attributes.heading")}
                        </h2>
                      </div>
                      <div className="ido-card__body">
                        <dl className="ido-attr-grid">
                          {attrs.map(({ key, label, values }) => (
                            <Fragment key={key}>
                              <dt className="ido-attr-grid__label">{label}</dt>
                              <dd className="ido-attr-grid__values">
                                {values.map((value) => (
                                  <span key={value} className="ido-attr-val">
                                    {value}
                                  </span>
                                ))}
                              </dd>
                            </Fragment>
                          ))}
                        </dl>
                      </div>
                    </div>
                  )}

                  {priceHistory.length > 1 && (
                    <div className="ido-card">
                      <div className="ido-card__head">
                        <h2 className="ido-card__title">{t("priceHistory")}</h2>
                        <span className="ido-card__count">
                          {priceHistory.length}
                        </span>
                      </div>
                      <div className="ido-card__body">
                        <PriceHistoryChart
                          ph={priceHistory}
                          sym={currency.symbol}
                          rate={currency.rate}
                          label={t("priceHistoryChart")}
                        />
                        <ul className="ido-price-history__list">
                          {[...priceHistory]
                            .reverse()
                            .map((snapshot, index, snapshots) => {
                              const previous = snapshots[index + 1];
                              return (
                                <li
                                  key={snapshot.d}
                                  className="ido-price-history__entry"
                                >
                                  <time
                                    className="ido-price-history__date"
                                    dateTime={snapshot.d}
                                  >
                                    {shortDate(snapshot.d)}
                                  </time>
                                  <span className="ido-price-history__price">
                                    {fmtMoney(snapshot.min)}
                                    {snapshot.max !== snapshot.min && (
                                      <span className="ido-price-history__range">
                                        {" "}
                                        - {fmtMoney(snapshot.max)}
                                      </span>
                                    )}
                                  </span>
                                  {previous ? (
                                    <PriceDir prev={previous} curr={snapshot} />
                                  ) : null}
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    </div>
                  )}
                </section>

                {reviews.length > 0 && (
                  <section
                    id="reviews"
                    data-section-id="reviews"
                    className="ido-section 2xl:hidden"
                  >
                    <div className="ido-card">
                      <div className="ido-card__body">
                        <ItemReviewsBlock
                          reviews={reviews}
                          rs={item.rs}
                          loading={false}
                          shareLink={shareLink}
                          compact
                        />
                      </div>
                    </div>
                  </section>
                )}

                <div className="flex flex-wrap gap-3 pt-1 md:hidden">
                  <SuggestLink
                    refNum={ref}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:border-foreground/30 hover:text-foreground cursor-pointer"
                  />
                  {shareLink && (
                    <OutboundLink
                      href={shareLink}
                      id={String(item.refNum ?? item.id)}
                      n={name}
                      sid={item.sid != null ? String(item.sid) : undefined}
                      sn={item.sn ?? undefined}
                      c={item.c ?? undefined}
                      mkt={market}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90"
                    >
                      {t("viewOnLittleBiggy")}
                    </OutboundLink>
                  )}
                  {isArchived && sellerHref && sellerLabel && (
                    <Link
                      href={sellerHref}
                      prefetch={false}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90"
                    >
                      {t("moreFromSeller", { seller: sellerLabel })}
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {reviews.length > 0 && (
              <aside className="ido-right idp-right">
                <ItemReviewsBlock
                  reviews={reviews}
                  rs={item.rs}
                  loading={false}
                  shareLink={shareLink}
                />
              </aside>
            )}
          </div>

          <div className="ido-suggest-bottom">
            <SuggestLink refNum={ref} iconOnly />
          </div>

          {shareLink && (
            <OutboundLink
              href={shareLink}
              id={String(item.refNum ?? item.id)}
              n={name}
              sid={item.sid != null ? String(item.sid) : undefined}
              sn={item.sn ?? undefined}
              c={item.c ?? undefined}
              mkt={market}
              className="ido-lb-btn"
            >
              <span className="ido-lb-btn__label">
                {t("viewOnLittleBiggy")}
              </span>
              <span className="ido-lb-btn__arrow" aria-hidden="true">
                -&gt;
              </span>
            </OutboundLink>
          )}
          {isArchived && sellerHref && sellerLabel && (
            <Link href={sellerHref} prefetch={false} className="ido-lb-btn">
              <span className="ido-lb-btn__label">
                {t("moreFromSeller", { seller: sellerLabel })}
              </span>
              <span className="ido-lb-btn__arrow" aria-hidden="true">
                -&gt;
              </span>
            </Link>
          )}
        </div>

        <RelatedItemsSections
          locale={locale}
          market={mkt}
          currentRef={String(item.refNum ?? item.id)}
          sid={item.sid}
          sellerName={item.sn}
          category={item.c}
          subcategories={item.sc}
        />
      </main>
    </>
  );
}

function ItemPageBar({
  categoryLabel,
  categoryHref,
  subcategoryLabel,
  browseLabel,
  breadcrumbLabel,
}: {
  /** Localized category display name (categories.* namespace). */
  categoryLabel?: string | null;
  /** Indexable /category/{slug} target; null → plain-text crumb. */
  categoryHref?: string | null;
  /** Subcategory crumb — always plain text (?sub= URLs are robots-blocked). */
  subcategoryLabel?: string | null;
  browseLabel: string;
  breadcrumbLabel: string;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-border bg-(--background)/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-375 items-center gap-3 px-4">
        <Link
          href="/browse"
          prefetch={false}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-primary/30"
        >
          <span className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5">
            &lt;-
          </span>
          {browseLabel}
        </Link>
        {categoryLabel && (
          <nav
            aria-label={breadcrumbLabel}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted"
          >
            <span className="text-muted-foreground/50">/</span>
            {categoryHref ? (
              <Link
                href={categoryHref}
                prefetch={false}
                className="shrink-0 transition-colors hover:text-foreground"
              >
                {categoryLabel}
              </Link>
            ) : (
              <span className="shrink-0">{categoryLabel}</span>
            )}
            {subcategoryLabel && (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span className="shrink-0">{subcategoryLabel}</span>
              </>
            )}
          </nav>
        )}
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function PriceDir({
  prev,
  curr,
}: {
  prev: PriceSnapshot;
  curr: PriceSnapshot;
}) {
  const change = formatPriceRangeChange(prev, curr);
  if (!change) return null;
  const down = change.startsWith("↓");
  return (
    <span
      className={`ido-price-history__change ${down ? "ido-price-history__change--down" : "ido-price-history__change--up"}`}
    >
      {change}
    </span>
  );
}

function PriceChangeBadge({
  history,
  current,
}: {
  history: PriceSnapshot[];
  current: { min: number; max: number };
}) {
  const prev = history[history.length - 2];
  const curr = history[history.length - 1];
  if (curr.min !== current.min || curr.max !== current.max) return null;
  const change = formatPriceRangeChange(prev, curr);
  if (!change) return null;
  const down = change.startsWith("↓");
  return (
    <span
      className={`ido-price-badge ${down ? "ido-price-badge--down" : "ido-price-badge--up"}`}
    >
      {change}
    </span>
  );
}
