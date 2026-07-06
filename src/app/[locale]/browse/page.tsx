import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ActiveFilterBar } from "@/components/ActiveFilterBar";
import { DataLoader } from "@/components/DataLoader";
import { FilterPanel } from "@/components/FilterPanel";
import { FooterSentinel } from "@/components/FooterSentinel";
import { ItemGrid } from "@/components/ItemGrid";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Toolbar } from "@/components/Toolbar";
import { browseDataVersion, loadItems, loadSellers } from "@/lib/data";
import { localeToMarket, marketCurrencySymbol } from "@/lib/market/market";
import { buildSeedItems } from "@/lib/seed";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const market = localeToMarket(locale);
  const t = await getTranslations({ locale, namespace: "browse.page" });

  return pageMetadata({
    market,
    path: "/browse",
    title: t("metadataTitle"),
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

  return (
    <>
      <Suspense>
        <DataLoader
          dataUrl={dataUrl}
          sellers={sellerList}
          currencySymbol={cSym}
        />
      </Suspense>

      <SiteHeader />
      <Toolbar />

      {/* Horizontal gutters only — vertical padding is dropped so the sidebar's
          right border runs flush into the toolbar. */}
      <main className="mx-auto px-4">
        <div className="flex gap-0">
          <FilterPanel />

          <div className="flex-1 min-w-0 py-4 md:pl-4">
            <ActiveFilterBar />
            <ItemGrid seedItems={seedItems} seedSym="£" />
          </div>
        </div>
      </main>

      <FooterSentinel />
      <SiteFooter hideBrowseCta locale={locale} />
    </>
  );
}
