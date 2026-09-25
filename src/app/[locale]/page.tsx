import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { CommunityReviews } from "@/components/home/CommunityReviews";
import { EmbassySection } from "@/components/home/EmbassySection";
import { FaqSection } from "@/components/home/FaqSection";
import { HeroStatusStrip } from "@/components/home/HeroStatusStrip";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeTabs } from "@/components/home/HomeTabs";
import { QuickStartGuide } from "@/components/home/QuickStartGuide";
import { SellerTrustBoard } from "@/components/home/SellerTrustBoard";
import { Ticker } from "@/components/home/Ticker";
import { IrelandOrderingSection } from "@/components/IrelandOrderingSection";
import { PageTransition } from "@/components/PageTransition";
import { SiteFooter } from "@/components/SiteFooter";
import { loadHomeFeed, loadItems, loadSellers } from "@/lib/data";
import { homeEvents, homeTabs, toHomeCard } from "@/lib/home/feed";
import { buildLeafData } from "@/lib/home/leaf-data";
import { HOME_FAQ_TABS, homeFaqKeys } from "@/lib/home-faq";
import { getServerCurrency } from "@/lib/market/currency";
import { loadIrelandOrderingFacts } from "@/lib/market/ireland";
import { localeToMarket } from "@/lib/market/market";
import { isOffWall } from "@/lib/off-wall";
import { countActiveSellers } from "@/lib/sellers";
import { faqPageJsonLd, serializeJsonLd } from "@/lib/seo/jsonld";
import { marketBaseUrl, pageMetadata } from "@/lib/seo/metadata";
import type { HomeFeedLeaderboardEntry } from "@/lib/types";
import { GITHUB_REPO_URL } from "@/lib/verify-links";

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
    title: `${t("tagline")} | BiggyIndex`,
    description: t("description"),
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("items");
  cacheTag("items");
  // The hero's seller count reads sellers.json, so this render has to be
  // invalidated when seller data moves, not only on an item crawl.
  cacheTag("sellers");

  const { locale } = await params;
  const market = localeToMarket(locale);
  const [feed, sellerList, currency, items] = await Promise.all([
    loadHomeFeed(market.toLowerCase()),
    // Same source and same rule as /sellers, so the two pages cannot quote
    // different active-seller counts for one market.
    loadSellers(market.toLowerCase()),
    // Stored prices are USD. Converting here — not after hydration — is what
    // puts local amounts in the HTML this page is cached and crawled as.
    // Rates cache with the page; an approximate rate beats a USD number
    // wearing a local symbol if the lookup is down.
    getServerCurrency(market, { approximateFallback: true }),
    loadItems(market.toLowerCase()),
  ]);

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

  // Ireland gets a market-specific ordering panel built from its own
  // catalogue. Gated here so no other edition pays for the extra read; the
  // nested cache scope carries the 'items' tag up into this render.
  const irelandFacts =
    market === "IE" ? await loadIrelandOrderingFacts() : null;

  const offWallSellers = new Set(
    sellerList.filter(isOffWall).map((seller) => String(seller.id)),
  );
  const onWall = (entries: HomeFeedLeaderboardEntry[]) =>
    entries.filter(
      (entry) => !isOffWall(entry) && !offWallSellers.has(entry.sellerId),
    );
  const tabs = homeTabs(feed, offWallSellers);
  const tabLists = {
    new: tabs.new.map(toHomeCard),
    drops: tabs.drops.map(toHomeCard),
    restock: tabs.restock.map(toHomeCard),
  };
  const events = homeEvents(feed, offWallSellers);
  const feedBuiltAt = Date.parse(feed.builtAt);
  const timeReference = Number.isFinite(feedBuiltAt) ? feedBuiltAt : 0;
  const weekAgo = timeReference - 7 * 24 * 60 * 60 * 1000;
  const heroStats = {
    listings: feed.hero.totalItems,
    sellers: countActiveSellers(sellerList),
    newThisWeek: tabs.new.filter((item) => {
      const at = Date.parse(item.at ?? item.fsa ?? "");
      return Number.isFinite(at) && at >= weekAgo;
    }).length,
    priceDrops: tabs.drops.length,
  };
  const leaf = buildLeafData({
    seed: feed.builtAt,
    categoryCounts: feed.hero.categoryCounts,
    tabs,
    items,
    offWallSellers,
    weekAgo,
  });

  // WebSite + Organization structured data.
  const baseUrl = marketBaseUrl(market);
  // sameAs takes absolute profile URLs, so the optional Telegram channel is
  // only carried when the env var holds one — a bare handle is skipped
  // rather than emitted as a broken link.
  const telegramUrl = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL;
  const externalProfiles = [
    GITHUB_REPO_URL,
    ...(telegramUrl && /^https?:\/\//.test(telegramUrl) ? [telegramUrl] : []),
  ];
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
    // Names people actually search for, including the common misspellings.
    alternateName: [
      "Biggy Index",
      "Little Biggy Index",
      "littlebiggy index",
      "biggie index",
    ],
    // Profiles this project genuinely operates elsewhere, and nothing else.
    // The other market editions are the same site under a different host —
    // that relationship is what hreflang is for, not sameAs.
    sameAs: externalProfiles,
  };

  // FAQPage built from the same message keys <FaqSection> renders. The
  // visible accordion is a client component behind a tab, so without this
  // the answers exist in the DOM but carry no markup.
  const tFaq = await getTranslations({ locale, namespace: "home.faq" });
  const faqJsonLd = faqPageJsonLd(
    HOME_FAQ_TABS.flatMap((tab) =>
      homeFaqKeys(tab, market).map((key) => ({
        q: tFaq(`${tab}.items.${key}.q`),
        a: tFaq(`${tab}.items.${key}.a`),
      })),
    ),
  );

  return (
    <PageTransition>
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }}
      />
      {/* Deliberately NO <Suspense> around the home sections. Under
          cacheComponents React outlines every Suspense boundary in the
          prerendered document, so the shell ships empty <template>
          placeholders with the footer directly beneath them — the footer
          paints near the top and is pushed down when the sections stream in.
          All data here is already awaited inside this cached render and no
          section uses dynamic APIs, so inlining costs nothing at request time
          and makes first paint layout-stable. */}
      {/* Outage strip stays IN FLOW above the hero: in flow it simply pushes
          the hero down during an outage, and the up-state renders a
          zero-height wrapper that costs nothing. */}
      <HeroStatusStrip />

      <HomeHero
        locale={locale}
        market={market}
        stats={heroStats}
        categoryCounts={feed.hero.categoryCounts}
        leaf={leaf}
        scan={feed.scan ?? null}
        currency={currency}
      />

      <Ticker events={events} currency={currency} />

      {irelandFacts && (
        <IrelandOrderingSection
          facts={irelandFacts}
          currency={currency}
          locale={locale}
        />
      )}

      <HomeTabs lists={tabLists} currency={currency} />

      <SellerTrustBoard
        topSellers={onWall(feed.sellers.top)}
        bottomSellers={onWall(feed.sellers.bottom)}
        recentlyJoined={onWall(feed.sellers.recentlyJoined)}
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
    </PageTransition>
  );
}
