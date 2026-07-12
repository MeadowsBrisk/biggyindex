import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { CommunityReviews } from "@/components/home/CommunityReviews";
import { EmbassySection } from "@/components/home/EmbassySection";
import { FaqSection } from "@/components/home/FaqSection";
import { HeroSection } from "@/components/home/HeroSection";
import { QuickStartGuide } from "@/components/home/QuickStartGuide";
import { SellerTrustBoard } from "@/components/home/SellerTrustBoard";
import { WhatsNewSection } from "@/components/home/WhatsNewSection";
import { SiteFooter } from "@/components/SiteFooter";
import { loadHomeFeed } from "@/lib/data";
import { getItemGalleryImages, getSellerImageUrl } from "@/lib/images";
import { ALL_MARKETS, localeToMarket } from "@/lib/market/market";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import { marketBaseUrl, pageMetadata } from "@/lib/seo/metadata";
import type { HomeFeedItemCard } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const market = localeToMarket(locale);
  const t = await getTranslations({ locale, namespace: "site" });

  return pageMetadata({
    market,
    path: "/",
    title: `BiggyIndex | ${t("tagline")}`,
    description: t("description"),
  });
}

/** Map a pre-shaped item card to the WhatsNewSection's NewItem shape */
function toNewItem(item: HomeFeedItemCard, dateField: "fsa" | "lua") {
  const gallery = getItemGalleryImages(item, "thumb", { forceStatic: true });
  const date = dateField === "lua" ? (item.lua ?? item.fsa) : item.fsa;
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
    date: date ?? "",
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
        <SiteFooter locale={locale} />
      </>
    );
  }

  // Category counts with empty emoji (HeroSection adds them)
  const categoryCounts = feed.hero.categoryCounts.map((c) => ({
    ...c,
    emoji: "",
  }));
  const feedBuiltAt = Date.parse(feed.builtAt);
  const timeReference = Number.isFinite(feedBuiltAt) ? feedBuiltAt : 0;

  // WebSite + Organization structured data. sameAs links the other
  // market editions of the same organization.
  const baseUrl = marketBaseUrl(market);
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "BiggyIndex",
    url: `${baseUrl}/`,
  };
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BiggyIndex",
    url: `${baseUrl}/`,
    logo: `${baseUrl}/icon-512.png`,
    description:
      "Independent index of Little Biggy listings — price history, review stats and seller trust data.",
    // The /about page describes this entity (methodology + provenance).
    subjectOf: {
      "@type": "AboutPage",
      url: `${baseUrl}/about`,
    },
    sameAs: ALL_MARKETS.filter((m) => m !== market).map(
      (m) => `${marketBaseUrl(m)}/`,
    ),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(organizationJsonLd),
        }}
      />
      {/* NOTE: deliberately NO <Suspense> around the home sections. Under
          cacheComponents, React outlines every Suspense boundary in the
          prerendered document: the shell shipped with six empty <template>
          placeholders followed by the footer, the section HTML streamed in
          afterwards as hidden chunks, and the footer visibly painted at the
          top of the page before being pushed down ~500ms later. All data
          here is already awaited inside this cached render and none of the
          sections use dynamic APIs, so inlining them costs nothing at
          request time and makes first paint layout-stable. */}
      <HeroSection
        totalItems={feed.hero.totalItems}
        totalSellers={feed.hero.totalSellers}
        categoryCounts={categoryCounts}
      />

      <WhatsNewSection
        newest={feed.whatsNew.newest.map((i) => toNewItem(i, "fsa"))}
        recentlyUpdated={feed.whatsNew.updated.map((i) => toNewItem(i, "lua"))}
        now={timeReference}
      />

      <SellerTrustBoard
        topSellers={feed.sellers.top}
        bottomSellers={feed.sellers.bottom}
        recentlyJoined={feed.sellers.recentlyJoined}
        now={timeReference}
      />

      <CommunityReviews
        reviews={feed.reviews.list}
        reviewStats={feed.reviews.stats}
        now={timeReference}
      />

      <QuickStartGuide />

      <EmbassySection />

      <FaqSection />

      <SiteFooter locale={locale} />
    </>
  );
}
