import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { DataLoader } from "@/components/DataLoader";
import { FilterPanel } from "@/components/FilterPanel";
import { FooterSentinel } from "@/components/FooterSentinel";
import { ItemGrid } from "@/components/ItemGrid";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Toolbar } from "@/components/Toolbar";
import { loadItems, loadSellers } from "@/lib/data";
import { localeToMarket, marketCurrencySymbol } from "@/lib/market/market";
import { buildSeedItems } from "@/lib/seed";

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

  return (
    <>
      <Suspense>
        <DataLoader
          items={itemList}
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
            <ItemGrid seedItems={seedItems} seedSym="£" />
          </div>
        </div>
      </main>

      <FooterSentinel />
      <SiteFooter hideBrowseCta locale={locale} />
    </>
  );
}
