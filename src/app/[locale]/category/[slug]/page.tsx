/**
 * Category landing page — SEO-crawlable, fully server-rendered.
 *
 * Reclaims v1's ranked /category/{slug} URLs (netlify.toml held them on a
 * 302 → /browse until this shipped). No client data fetching: the grid is
 * plain <a href="/item/{ref}"> cards in the initial HTML, so crawlers get
 * a linked catalog with item names as anchor text (same rationale as the
 * browse SeedCards).
 *
 * NO prices anywhere — SSR currency conversion is broken sitewide
 * (USD numbers with local symbols), so cards render image + name + seller
 * only, matching the SeedCard convention.
 */

import { ArrowRight, Package } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  CATEGORY_SLUGS,
  categoryToSlug,
  slugToCategory,
} from "@/lib/categories";
import { loadItems, loadVariantWidths } from "@/lib/data";
import { decodeEntities } from "@/lib/format";
import {
  getItemPrimaryHash,
  getItemPrimaryImage,
  isItemPrimaryAnimated,
  variantSrcSetForUrl,
} from "@/lib/images";
import { ALL_MARKETS, localeToMarket } from "@/lib/market/market";
import { absoluteUrl, pageMetadata } from "@/lib/seo/metadata";
import type { Item } from "@/lib/types";

interface CategoryPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

/**
 * Every category landing slug is known at build time (no data fetch), so the
 * route prerenders per (locale × slug) exactly like /browse instead of
 * falling into PPR's postponed-shell mode (which Netlify marks
 * private,no-store and never durably caches). Unknown slugs still render
 * on-demand and hit notFound() below → real 404. locale combinations come
 * from the parent [locale] segment's own generateStaticParams.
 */
export function generateStaticParams() {
  return CATEGORY_SLUGS.map((slug) => ({ slug }));
}

/** SSR grid cap — full catalog browsing lives in /browse. */
const GRID_ITEM_LIMIT = 96;
/** ItemList entries in the CollectionPage JSON-LD. */
const JSONLD_ITEM_LIMIT = 50;
/** Subcategory names surfaced as plain text (NOT links — ?sub= is robots-blocked). */
const SUBCATEGORY_LIMIT = 8;

/**
 * Per-category item counts for metadata titles. Cached with the same
 * profile/tag as the page body (mirrors browse's browseItemCount) so
 * generateMetadata doesn't pay an uncached R2 fetch per request and the
 * "{count}+" title revalidates in lockstep with the grid.
 */
async function categoryCounts(mkt: string): Promise<Record<string, number>> {
  "use cache";
  cacheLife("items");
  cacheTag("items");
  const items = await loadItems(mkt);
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (!item.c) continue;
    counts[item.c] = (counts[item.c] ?? 0) + 1;
  }
  return counts;
}

/** Round down to a stable "N+" figure so the title doesn't churn per crawl. */
function roundedCount(count: number): number {
  if (count >= 100) return Math.floor(count / 50) * 50;
  return Math.floor(count / 10) * 10;
}

function itemHref(item: Item): string {
  return `/item/${encodeURIComponent(String(item.refNum ?? item.id))}`;
}

/** JSON-LD serializer — escape `<` so markup can't break out of the script tag. */
function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = slugToCategory(slug);
  // notFound() here (not just a fallback title): metadata is blocking for
  // html-limited bots (incl. Googlebot), so throwing from generateMetadata
  // guarantees crawlers a real 404 status for unknown slugs.
  if (!category) notFound();

  const market = localeToMarket(locale);
  const t = await getTranslations({ locale, namespace: "category.page" });
  const tCategories = await getTranslations({
    locale,
    namespace: "categories",
  });
  const categoryName = tCategories(category);
  const canonicalSlug = categoryToSlug(category) ?? slug.toLowerCase();
  const counts = await categoryCounts(market.toLowerCase());
  const count = roundedCount(counts[category] ?? 0);

  return pageMetadata({
    market,
    path: `/category/${canonicalSlug}`,
    // Tiny categories fall back to the countless variants ("0+ listings"
    // would read worse than no number at all) — mirrors /browse.
    title:
      count >= 10
        ? t("metadataTitle", { category: categoryName, count })
        : t("metadataTitleNoCount", { category: categoryName }),
    description:
      count >= 10
        ? t("metadataDescription", { category: categoryName, count })
        : t("metadataDescriptionNoCount", { category: categoryName }),
    alternateMarkets: ALL_MARKETS,
  });
}

/**
 * Crawlable server-rendered card — image + name + seller, no prices
 * (adapted from ItemGrid's SeedCard; no swap-in placeholder needed here
 * because this grid never hydrates into live cards).
 */
function CategoryItemCard({
  item,
  priority,
  variantWidths,
}: {
  item: Item;
  priority: boolean;
  variantWidths: (hash: string) => number[] | undefined;
}) {
  const name = decodeEntities(item.n);
  const imageUrl = getItemPrimaryImage(item, "thumb", { forceStatic: true });
  // Responsive srcset — skip animated sources (no w-variants). The `sizes`
  // hint below was authored for this and is now live.
  const primaryHash = isItemPrimaryAnimated(item)
    ? undefined
    : getItemPrimaryHash(item);
  const imageSrcSet = variantSrcSetForUrl(
    imageUrl,
    primaryHash ? variantWidths(primaryHash) : undefined,
  );

  return (
    <a href={itemHref(item)} className="item-card">
      <div className="item-card-inner">
        <div className="item-card-image aspect-square">
          {imageUrl ? (
            // biome-ignore lint/performance/noImgElement: R2 images are already optimized before reaching this component.
            <img
              src={imageUrl}
              srcSet={imageSrcSet}
              alt={item.c ? `${name} — ${item.c}` : name}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              sizes="(min-width: 1440px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="card-image card-image--primary"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Package size={48} />
            </div>
          )}
        </div>
        <div className="p-2">
          <p className="text-xs text-muted truncate">{item.sn}</p>
          <p className="text-sm font-medium leading-snug line-clamp-2 mt-0.5">
            {name}
          </p>
        </div>
      </div>
    </a>
  );
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  "use cache";
  cacheLife("items");
  cacheTag("items");

  const { locale, slug } = await params;
  const category = slugToCategory(slug);
  if (!category) notFound();
  const canonicalSlug = categoryToSlug(category) ?? slug.toLowerCase();

  const market = localeToMarket(locale);
  const mkt = market.toLowerCase();
  const t = await getTranslations({ locale, namespace: "category.page" });
  const tCategories = await getTranslations({
    locale,
    namespace: "categories",
  });
  const tNav = await getTranslations({ locale, namespace: "nav" });
  const categoryName = tCategories(category);

  const [items, variantWidthsMap] = await Promise.all([
    loadItems(mkt),
    loadVariantWidths(),
  ]);
  const variantWidths = (hash: string): number[] | undefined =>
    variantWidthsMap[hash];
  const categoryItems = items
    .filter((item) => item.c === category)
    .sort((a, b) => (b.h ?? 0) - (a.h ?? 0));
  const count = categoryItems.length;
  const gridItems = categoryItems.slice(0, GRID_ITEM_LIMIT);

  // Live subcategory names (frequency-ranked) rendered as PLAIN TEXT —
  // /browse?cat=&sub= is robots-blocked, so links would be crawl dead-ends.
  const subCounts = new Map<string, number>();
  for (const item of categoryItems) {
    for (const sub of item.sc ?? []) {
      subCounts.set(sub, (subCounts.get(sub) ?? 0) + 1);
    }
  }
  const topSubcategories = [...subCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, SUBCATEGORY_LIMIT)
    .map(([name]) => name);

  const pageUrl = absoluteUrl(market, `/category/${canonicalSlug}`);

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
        name: tNav("browse"),
        item: absoluteUrl(market, "/browse"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: categoryName,
        item: pageUrl,
      },
    ],
  };

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("heading", { category: categoryName }),
    description: t("metadataDescriptionNoCount", { category: categoryName }),
    url: pageUrl,
    numberOfItems: count,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: count,
      itemListElement: categoryItems
        .slice(0, JSONLD_ITEM_LIMIT)
        .map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: decodeEntities(item.n),
          url: absoluteUrl(market, itemHref(item)),
        })),
    },
  };

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionJsonLd) }}
      />

      <main className="mx-auto min-h-screen max-w-7xl px-4 py-6">
        {/* Breadcrumb — Browse → Category */}
        <nav
          aria-label={t("breadcrumbLabel")}
          className="mb-4 flex items-center gap-1.5 text-xs text-muted"
        >
          <Link
            href="/browse"
            prefetch={false}
            className="transition-colors hover:text-foreground"
          >
            {tNav("browse")}
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground">{categoryName}</span>
        </nav>

        <header className="mb-8 max-w-3xl">
          <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
            {t("heading", { category: categoryName })}
          </h1>
          <p className="mt-3 text-sm font-medium text-primary">
            {t("countLine", { count, category: categoryName })}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            {t(`intro.${canonicalSlug}`)}
          </p>
          {topSubcategories.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              <span className="font-semibold text-foreground">
                {t("subcategoriesLabel")}:{" "}
              </span>
              {topSubcategories.join(" · ")}
            </p>
          )}
        </header>

        {gridItems.length > 0 && (
          <div className="item-list-grid">
            {gridItems.map((item, index) => (
              <CategoryItemCard
                key={item.id}
                item={item}
                priority={index < 2}
                variantWidths={variantWidths}
              />
            ))}
          </div>
        )}

        {/* CTA into the filterable app view. /browse?cat= is robots-blocked,
            which is fine for a UX link — canonical relevance stays here. */}
        <div className="mt-10 flex justify-center">
          <Link
            href={`/browse?cat=${encodeURIComponent(category)}`}
            prefetch={false}
            className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 hover:shadow-lg hover:shadow-primary/25"
          >
            {t("browseAllCta", { category: categoryName })}
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </main>

      <SiteFooter hideBrowseCta locale={locale} />
    </>
  );
}
