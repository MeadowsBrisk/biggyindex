import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadItems, loadSellerDetail, loadSellers } from "@/lib/data";
import { decodeEntities } from "@/lib/format";
import {
  ALL_MARKETS,
  localeToMarket,
  type MarketCode,
  marketToHost,
} from "@/lib/market/market";
import type { Item, Seller, SellerDetail } from "@/lib/types";
import { SellerPageClient } from "./SellerPageClient";

interface SellerPageProps {
  params: Promise<{ locale: string; id: string }>;
}

interface SellerPageData {
  sellerId: string;
  market: MarketCode;
  seller: Seller;
  detail: SellerDetail;
  items: Item[];
  itemTotal: number;
  sellerMarkets: MarketCode[];
}

const SELLER_ITEM_LIMIT = 24;

const LOCALE_FOR: Record<MarketCode, string> = {
  GB: "en",
  IE: "en-IE",
  DE: "de",
  FR: "fr",
  PT: "pt",
  IT: "it",
  ES: "es",
  GR: "el",
  CZ: "cs",
  PL: "pl",
};

function parseSellerId(raw: string | undefined): string | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).trim();
  return /^\d+$/.test(decoded) ? decoded : null;
}

function sameSellerId(value: unknown, sellerId: string): boolean {
  return value != null && String(value) === sellerId;
}

function sellerPath(sellerId: string): string {
  return `/seller/${encodeURIComponent(sellerId)}`;
}

function sellerUrl(market: MarketCode, sellerId: string): string {
  return `https://${marketToHost(market)}${sellerPath(sellerId)}`;
}

function alternateLanguages(
  sellerId: string,
  markets: MarketCode[],
): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const market of markets) {
    languages[LOCALE_FOR[market]] = sellerUrl(market, sellerId);
  }
  const defaultMarket = markets.includes("GB") ? "GB" : markets[0];
  if (defaultMarket)
    languages["x-default"] = sellerUrl(defaultMarket, sellerId);
  return languages;
}

function dateValue(item: Item): number {
  const raw = item.lua ?? item.fsa ?? null;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortSellerItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const dateDiff = dateValue(b) - dateValue(a);
    if (dateDiff !== 0) return dateDiff;
    return Number(b.h ?? 0) - Number(a.h ?? 0);
  });
}

function fallbackCommunityFeedback(
  seller: Seller,
): SellerDetail["communityFeedback"] {
  const endorseCount = seller.communityEndorsements ?? 0;
  const reportCount = seller.communityReportCount ?? 0;
  if (!endorseCount && !reportCount) return null;
  return { endorseCount, reportCount, reports: [] };
}

function normalizeSellerDetail(
  sellerId: string,
  seller: Seller,
  detail: SellerDetail | null,
): SellerDetail {
  const fallback: SellerDetail = {
    sellerId,
    sellerName: seller.name,
    sellerUrl: null,
    imageUrl: seller.imageUrl ?? null,
    sellerImageUrl: seller.imageUrl ?? null,
    online: seller.online ?? null,
    sellerOnline: seller.online ?? null,
    sellerJoined: null,
    manifesto: null,
    share: null,
    overview: {
      itemsCount: seller.itemsCount,
      numberOfReviews: seller.numberOfReviews,
      averageDaysToArrive: seller.averageDaysToArrive ?? undefined,
    },
    reviews: [],
    reviewsMeta: null,
    communityFeedback: fallbackCommunityFeedback(seller),
  };

  if (!detail) return fallback;

  return {
    ...fallback,
    ...detail,
    sellerId: String(detail.sellerId ?? sellerId),
    sellerName: detail.sellerName || seller.name,
    sellerUrl: detail.sellerUrl ?? fallback.sellerUrl,
    imageUrl: detail.imageUrl ?? fallback.imageUrl,
    sellerImageUrl:
      detail.sellerImageUrl ?? detail.imageUrl ?? fallback.sellerImageUrl,
    online: detail.online ?? fallback.online,
    sellerOnline: detail.sellerOnline ?? detail.online ?? fallback.sellerOnline,
    overview: {
      ...fallback.overview,
      ...(detail.overview ?? {}),
      itemsCount: seller.itemsCount ?? detail.overview?.itemsCount,
      numberOfReviews:
        seller.numberOfReviews ?? detail.overview?.numberOfReviews,
      averageDaysToArrive:
        seller.averageDaysToArrive ?? detail.overview?.averageDaysToArrive,
    },
    reviews: Array.isArray(detail.reviews) ? detail.reviews : [],
    reviewsMeta: detail.reviewsMeta ?? fallback.reviewsMeta,
    communityFeedback: detail.communityFeedback ?? fallback.communityFeedback,
  };
}

async function getSellerPageData(
  locale: string,
  sellerId: string,
): Promise<SellerPageData | null> {
  "use cache";
  cacheLife("sellers");
  cacheTag("sellers");

  const market = localeToMarket(locale);
  const currentMarket = market.toLowerCase();

  const allSellersPromise = Promise.all(
    ALL_MARKETS.map(async (candidateMarket) => ({
      market: candidateMarket,
      sellers: await loadSellers(candidateMarket.toLowerCase()),
    })),
  );

  const [allSellerResults, detail, marketItems] = await Promise.all([
    allSellersPromise,
    loadSellerDetail(sellerId),
    loadItems(currentMarket),
  ]);

  const currentSellers =
    allSellerResults.find((result) => result.market === market)?.sellers ?? [];
  const seller = currentSellers.find((entry) =>
    sameSellerId(entry.id, sellerId),
  );
  if (!seller) return null;

  const sellerMarkets = allSellerResults.flatMap((result) =>
    result.sellers.some((entry) => sameSellerId(entry.id, sellerId))
      ? [result.market]
      : [],
  );

  const sellerItems = sortSellerItems(
    marketItems.filter((item) => sameSellerId(item.sid, sellerId)),
  );

  return {
    sellerId,
    market,
    seller,
    detail: normalizeSellerDetail(sellerId, seller, detail),
    items: sellerItems.slice(0, SELLER_ITEM_LIMIT),
    itemTotal: sellerItems.length,
    sellerMarkets,
  };
}

function sellerDescription(data: SellerPageData): string {
  const name = decodeEntities(data.detail.sellerName || data.seller.name);
  const manifesto = data.detail.manifesto
    ? decodeEntities(data.detail.manifesto).replace(/\s+/g, " ").trim()
    : null;
  const excerpt = manifesto
    ? manifesto.slice(0, 150) + (manifesto.length > 150 ? "..." : "")
    : null;
  const stats = [
    data.itemTotal > 0 ? `${data.itemTotal} active listings` : null,
    data.seller.numberOfReviews != null
      ? `${data.seller.numberOfReviews} reviews`
      : null,
  ].filter(Boolean);

  return [name, excerpt, ...stats].filter(Boolean).join(" - ");
}

export async function generateMetadata({
  params,
}: SellerPageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const sellerId = parseSellerId(id);
  const t = await getTranslations({ locale, namespace: "seller.detail" });
  if (!sellerId) {
    return { title: t("notFoundTitle") };
  }

  const data = await getSellerPageData(locale, sellerId);
  if (!data) {
    return { title: t("notFoundTitle") };
  }

  const title = t("metadataTitle", {
    seller: decodeEntities(data.detail.sellerName || data.seller.name),
  });
  const description = sellerDescription(data);
  const image =
    data.detail.sellerImageUrl ??
    data.detail.imageUrl ??
    data.seller.imageUrl ??
    null;

  return {
    title,
    description,
    alternates: {
      canonical: sellerUrl(data.market, sellerId),
      languages: alternateLanguages(sellerId, data.sellerMarkets),
    },
    openGraph: {
      type: "profile",
      title,
      description,
      url: sellerUrl(data.market, sellerId),
      siteName: "BiggyIndex",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

async function SellerContent({ params }: SellerPageProps) {
  const { locale, id } = await params;
  const sellerId = parseSellerId(id);
  if (!sellerId) notFound();

  const data = await getSellerPageData(locale, sellerId);
  if (!data) notFound();

  const t = await getTranslations({ locale, namespace: "seller.detail" });
  const name = decodeEntities(data.detail.sellerName || data.seller.name);
  const canonical = sellerUrl(data.market, sellerId);
  const description = sellerDescription(data);
  const image =
    data.detail.sellerImageUrl ??
    data.detail.imageUrl ??
    data.seller.imageUrl ??
    undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Organization",
      name,
      description,
      url: data.detail.share ?? data.detail.sellerUrl ?? canonical,
      image,
      aggregateRating:
        data.seller.averageRating != null && data.seller.numberOfReviews > 0
          ? {
              "@type": "AggregateRating",
              ratingValue: data.seller.averageRating.toFixed(1),
              reviewCount: String(data.seller.numberOfReviews),
              bestRating: "10",
              worstRating: "1",
            }
          : undefined,
    },
  };

  return (
    <>
      <SellerPageBar
        sellerName={name}
        sellersLabel={t("backToSellers")}
        breadcrumbLabel={t("breadcrumb")}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SellerPageClient
        detail={data.detail}
        seller={data.seller}
        items={data.items}
        itemTotal={data.itemTotal}
        market={data.market}
        sellerId={sellerId}
      />
    </>
  );
}

function SellerPageBar({
  sellerName,
  sellersLabel,
  breadcrumbLabel,
}: {
  sellerName: string;
  sellersLabel: string;
  breadcrumbLabel: string;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-border bg-(--background)/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-375 items-center gap-3 px-4">
        <Link
          href="/sellers"
          prefetch={false}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-primary/30"
        >
          <span className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5">
            &lt;-
          </span>
          {sellersLabel}
        </Link>
        <nav
          aria-label={breadcrumbLabel}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted"
        >
          <span className="text-muted-foreground/50">/</span>
          <Link
            href="/sellers"
            prefetch={false}
            className="shrink-0 transition-colors hover:text-foreground"
          >
            {sellersLabel}
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="truncate text-foreground">{sellerName}</span>
        </nav>
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

export default async function SellerPage(props: SellerPageProps) {
  return (
    <Suspense>
      <SellerContent params={props.params} />
    </Suspense>
  );
}
