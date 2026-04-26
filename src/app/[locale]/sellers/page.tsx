import { cacheLife, cacheTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RouteDataLoader } from "@/components/RouteDataLoader";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { loadSellers } from "@/lib/data";
import { localeToMarket, marketCurrencySymbol } from "@/lib/market/market";
import { readR2JSON } from "@/lib/r2";
import { SellersPageClient } from "./SellersPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seller.page" });

  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  };
}

interface LeaderboardEntry {
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  url?: string;
  score: number;
  positive: number;
  negative: number;
  total: number;
  lastReviewAt: string;
}

interface LeaderboardPeriod {
  top: LeaderboardEntry[];
  bottom: LeaderboardEntry[];
}

interface LeaderboardData {
  all: LeaderboardPeriod;
  week?: LeaderboardPeriod;
  generatedAt?: string;
}

/** seller-analytics.json entry (subset we use) */
export interface SellerAnalyticsLifetime {
  totalReviews: number;
  positiveCount: number;
  negativeCount: number;
  perfectScoreCount: number;
  avgRating: number;
  avgDaysToArrive?: number;
}

export interface SellerAnalyticsEntry {
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  lastSeenAt?: string;
  lifetime: SellerAnalyticsLifetime;
}

interface SellerAnalyticsData {
  generatedAt?: string;
  totalSellers?: number;
  sellers: SellerAnalyticsEntry[];
}

export default async function SellersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("sellers");
  cacheTag("sellers");

  const { locale } = await params;
  const market = localeToMarket(locale);
  const mkt = market.toLowerCase();
  const cSym = marketCurrencySymbol(market);

  const [sellerList, leaderboard, analytics] = await Promise.all([
    loadSellers(mkt),
    readR2JSON<LeaderboardData>(
      `markets/${mkt}/aggregates/sellers-leaderboard.json`,
    ),
    readR2JSON<SellerAnalyticsData>(
      `markets/${mkt}/aggregates/seller-analytics.json`,
    ),
  ]);

  const allTime = leaderboard?.all ?? { top: [], bottom: [] };
  const weekly = leaderboard?.week ?? { top: [], bottom: [] };

  // Build a map of sellerId → lifetime stats for fast lookup in the table
  const analyticsMap: Record<string, SellerAnalyticsLifetime> = {};
  for (const s of analytics?.sellers ?? []) {
    if (s.sellerId && s.lifetime) analyticsMap[String(s.sellerId)] = s.lifetime;
  }

  return (
    <>
      <RouteDataLoader
        sellers={sellerList}
        currencySymbol={cSym}
        market={market}
      />
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <Suspense>
          <SellersPageClient
            sellers={sellerList}
            analyticsMap={analyticsMap}
            leaderboardAllTime={allTime}
            leaderboardWeekly={weekly}
            generatedAt={leaderboard?.generatedAt}
          />
        </Suspense>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
