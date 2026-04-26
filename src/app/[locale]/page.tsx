import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { CommunityReviews } from "@/components/home/CommunityReviews";
import { FaqSection } from "@/components/home/FaqSection";
import { HeroSection } from "@/components/home/HeroSection";
import { QuickStartGuide } from "@/components/home/QuickStartGuide";
import { SellerTrustBoard } from "@/components/home/SellerTrustBoard";
import { WhatsNewSection } from "@/components/home/WhatsNewSection";
import { SiteFooter } from "@/components/SiteFooter";
import { loadHomeFeed } from "@/lib/data";
import { getItemGalleryImages, getSellerImageUrl } from "@/lib/images";
import { localeToMarket } from "@/lib/market/market";

/** Map a pre-shaped item card to the WhatsNewSection's NewItem shape */
function toNewItem(item: any, dateField: "fsa" | "lua") {
  const gallery = getItemGalleryImages(item, "thumb", { forceStatic: true });
  return {
    id: item.id,
    refNum: item.refNum,
    name: item.n,
    image: gallery[0] ?? null,
    images: gallery.length > 0 ? gallery : null,
    priceMin: item.uMin ?? null,
    priceMax: item.uMax ?? null,
    seller: item.sn ?? null,
    sellerId: item.sid ?? null,
    sellerImageUrl: getSellerImageUrl(item.si) ?? null,
    category: item.c ?? null,
    date: item[dateField] ?? "",
    reviewStats: item.rs ?? null,
    shipsFrom: item.sf ?? null,
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("items");
  cacheTag("items");

  const { locale } = await params;
  const market = localeToMarket(locale);
  const feed = await loadHomeFeed(market.toLowerCase());

  if (!feed) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
          Home feed unavailable — data may still be building.
        </div>
        <SiteFooter />
      </>
    );
  }

  // Category counts with empty emoji (HeroSection adds them)
  const categoryCounts = feed.hero.categoryCounts.map((c) => ({
    ...c,
    emoji: "",
  }));

  return (
    <>
      <Suspense>
        <HeroSection
          totalItems={feed.hero.totalItems}
          totalSellers={feed.hero.totalSellers}
          categoryCounts={categoryCounts}
        />
      </Suspense>

      <Suspense>
        <WhatsNewSection
          newest={feed.whatsNew.newest.map((i) => toNewItem(i, "fsa"))}
          recentlyUpdated={feed.whatsNew.updated.map((i) =>
            toNewItem(i, "lua"),
          )}
        />
      </Suspense>

      <Suspense>
        <SellerTrustBoard
          topSellers={feed.sellers.top}
          bottomSellers={feed.sellers.bottom}
          recentlyJoined={feed.sellers.recentlyJoined}
        />
      </Suspense>

      <Suspense>
        <CommunityReviews
          reviews={feed.reviews.list}
          reviewStats={feed.reviews.stats}
        />
      </Suspense>

      <Suspense>
        <QuickStartGuide />
      </Suspense>

      <Suspense>
        <FaqSection />
      </Suspense>

      <SiteFooter />
    </>
  );
}
