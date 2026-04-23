import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { localeToMarket, marketCurrencySymbol } from "@/lib/market/market";
import { DataLoader } from "@/components/DataLoader";
import { FilterPanel } from "@/components/FilterPanel";
import { Toolbar } from "@/components/Toolbar";
import { ItemGrid } from "@/components/ItemGrid";
import { buildSeedItems } from "@/lib/seed";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FooterSentinel } from "@/components/FooterSentinel";
import { loadItems, loadSellers } from "@/lib/data";

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
        <DataLoader items={itemList} sellers={sellerList} currencySymbol={cSym} />
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
      <SiteFooter hideBrowseCta />
    </>
  );
}
