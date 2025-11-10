import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetStaticProps, GetStaticPaths, NextPage } from 'next';
import { useRouter } from 'next/router';
import Home from '../index';
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom } from '@/store/atoms';
import { loadSellerForSEO } from '@/lib/seo';
import { useTranslations, useLocale } from 'next-intl';
import { buildSellerUrl } from '@/lib/routing';
import { hostForLocale } from '@/lib/routing';

interface SellerSEO {
  id: number;
  sellerName?: string | null;
  itemsCount?: number | null;
  sellerImageUrl?: string | null;
  shareLink?: string | null;
}

interface SellerIdPageProps {
  seo: SellerSEO | null;
}

function parseSellerId(idParam: string | string[] | undefined): number | null {
  if (!idParam) return null;
  const raw = Array.isArray(idParam) ? idParam[0] : idParam;
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export const getStaticProps: GetStaticProps<SellerIdPageProps> = async ({ params }) => {
  const sellerId = parseSellerId(params?.id as string | string[] | undefined);
  if (!sellerId) return { notFound: true };
  const seller = await loadSellerForSEO(sellerId);
  if (!seller) return { notFound: true };
  const seo: SellerSEO = {
    id: seller.id,
    sellerName: seller.sellerName || null,
    itemsCount: typeof seller.itemsCount === 'number' ? seller.itemsCount : null,
    sellerImageUrl: seller.sellerImageUrl || null,
    shareLink: seller.shareLink || null,
  };
  return { props: { seo }, revalidate: 900 };
};

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

const SellerIdPage: NextPage<SellerIdPageProps> = ({ seo }) => {
  const router = useRouter();
  const setSellerId = useSetAtom(expandedSellerIdAtom);
  const tNav = useTranslations('Nav');
  const locale = useLocale();

  const sellerId = parseSellerId(router.query.id);

  useEffect(() => {
    if (!router.isReady) return;
    setSellerId(sellerId);
  }, [router.isReady, sellerId, setSellerId]);

  const title = seo?.sellerName ? `${seo.sellerName} – ${tNav('sellers')} | Biggy Index` : `${tNav('sellers')} | Biggy Index`;
  const description = [
    seo?.sellerName || null,
    typeof seo?.itemsCount === 'number' ? `${seo.itemsCount} ${tNav('items')}` : null,
  ].filter(Boolean).join(' • ');
  const canonical = buildSellerUrl(String(seo?.id ?? sellerId ?? ''), locale);

  return (
    <>
      <Head>
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        <link rel="canonical" href={canonical} />
        <meta property="og:url" content={canonical} />
        <meta property="og:title" content={title} />
        {description && <meta property="og:description" content={description} />}
        <meta name="twitter:title" content={title} />
        {description && <meta name="twitter:description" content={description} />}
        {seo?.sellerImageUrl && <meta property="og:image" content={seo.sellerImageUrl} />}
        <script
          // JSON-LD: ProfilePage
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ProfilePage',
              about: {
                '@type': 'Organization',
                name: seo?.sellerName || '',
                url: seo?.shareLink || undefined,
                image: seo?.sellerImageUrl || undefined,
              },
            }),
          }}
        />
        <script
          // JSON-LD: BreadcrumbList
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: tNav('home'), item: hostForLocale(locale) + '/' },
                { '@type': 'ListItem', position: 2, name: tNav('sellers'), item: hostForLocale(locale) + '/home' },
                { '@type': 'ListItem', position: 3, name: seo?.sellerName || tNav('sellers'), item: canonical },
              ],
            }),
          }}
        />
      </Head>
      <Home suppressDefaultHead />
    </>
  );
};

export default SellerIdPage;
