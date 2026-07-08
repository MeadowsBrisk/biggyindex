import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ActiveFilterBar } from "@/components/ActiveFilterBar";
import { DataLoader } from "@/components/DataLoader";
import { FilterPanel } from "@/components/FilterPanel";
import { FooterSentinel } from "@/components/FooterSentinel";
import { ItemGrid } from "@/components/ItemGrid";
import { MobileResultCount } from "@/components/MobileResultCount";
import { SeedParamsSync } from "@/components/SeedParamsSync";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Toolbar } from "@/components/Toolbar";
import { browseDataVersion, loadItems, loadSellers } from "@/lib/data";
import { decodeEntities } from "@/lib/format";
import { localeToMarket, marketCurrencySymbol } from "@/lib/market/market";
import { buildSeedItems } from "@/lib/seed";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import { absoluteUrl, pageMetadata } from "@/lib/seo/metadata";

/**
 * Item count for the metadata title. Cached with the same profile/tag as the
 * page body so generateMetadata doesn't pay an uncached R2 fetch per request
 * and the "{count}+" title revalidates in lockstep with the grid.
 */
async function browseItemCount(mkt: string): Promise<number> {
  "use cache";
  cacheLife("items");
  cacheTag("items");
  const items = await loadItems(mkt);
  return items.length;
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
  const t = await getTranslations({ locale, namespace: "browse.page" });
  const count = roundedCount(await browseItemCount(market.toLowerCase()));

  return pageMetadata({
    market,
    path: "/browse",
    // Tiny/empty markets fall back to the countless title ("Browse 0+..."
    // would read worse than no number at all).
    title:
      count >= 10 ? t("metadataTitle", { count }) : t("metadataTitleNoCount"),
    description: t("metadataDescription"),
  });
}

export default async function BrowsePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("items");
  cacheTag("items");

  const { locale } = await params;
  const market = localeToMarket(locale);
  const mkt = market.toLowerCase();
  const cSym = marketCurrencySymbol(market);
  const t = await getTranslations({ locale, namespace: "browse.page" });

  const [itemList, sellerList] = await Promise.all([
    loadItems(mkt),
    loadSellers(mkt),
  ]);

  const seedItems = buildSeedItems(itemList);

  // Items are NOT inlined into the RSC payload (was ~900KB of flight data).
  // The client fetches them from /api/browse; the version-pinned URL is
  // browser-cached immutably, so repeat visits and router.refresh() cost
  // zero bytes until the dataset actually changes.
  const dataUrl = `/api/browse?mkt=${mkt}&v=${browseDataVersion(itemList)}`;

  // ItemList structured data: top 50 by hotness — mirrors the grid's
  // default "hottest" sort. Names + absolute URLs only (lean payload).
  const topByHotness = [...itemList]
    .sort((a, b) => Number(b.h ?? 0) - Number(a.h ?? 0))
    .slice(0, 50);
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: topByHotness.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(
        market,
        `/item/${encodeURIComponent(String(item.refNum ?? item.id))}`,
      ),
      name: decodeEntities(item.n),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListJsonLd) }}
      />
      {/* The pre-paint seed-grid guard script lives in the locale layout
          (SeedParamsScript) — hard loads only. SeedParamsSync keeps the
          html.bi-seed-hide / bi-cols-2 flags correct across client-side
          navigations (Suspense: useSearchParams needs a boundary here). */}
      <Suspense>
        <SeedParamsSync />
        <DataLoader
          dataUrl={dataUrl}
          sellers={sellerList}
          currencySymbol={cSym}
        />
      </Suspense>

      <SiteHeader />
      <Toolbar initialCount={itemList.length} />

      {/* Horizontal gutters only — vertical padding is dropped so the sidebar's
          right border runs flush into the toolbar. */}
      <main className="mx-auto px-4">
        {/* SEO h1 — sr-only because the browse layout is deliberately
            toolbar-first (SiteHeader → Toolbar → grid); any visible heading
            would push the toolbar down and change the Phase-1 "pixel
            identical" layout. Screen readers and crawlers still get a
            keyworded page heading. */}
        <h1 className="sr-only">{t("heading")}</h1>
        <div className="flex gap-0">
          <FilterPanel />

          {/* `pl-4` at all widths (not just md): on mobile the left gutter
              gives the fixed edge-swipe tap zone (FilterPanel) visible room so
              it reads as tappable, matching Roast Radar. On desktop it's the
              gap from the filter sidebar. */}
          <div className="flex-1 min-w-0 py-4 pl-4">
            <ActiveFilterBar />
            <MobileResultCount initialCount={itemList.length} />
            <ItemGrid seedItems={seedItems} />
          </div>
        </div>
      </main>

      <FooterSentinel />
      <SiteFooter hideBrowseCta locale={locale} />
    </>
  );
}
