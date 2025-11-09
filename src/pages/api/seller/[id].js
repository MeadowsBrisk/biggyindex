import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Home from '../index';
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom } from '@/store/atoms';
import { loadSellerForSEO } from '@/lib/seo';
import { useTranslations, useLocale } from 'next-intl';
import { buildSellerUrl, hostForLocale } from '@/lib/routing';

export async function getStaticProps({ params }) {
  const idParam = params?.id;
  const parsed = typeof idParam === 'string' ? Number.parseInt(idParam, 10) : Array.isArray(idParam) ? Number.parseInt(idParam[0] || '', 10) : NaN;
  const sellerId = Number.isFinite(parsed) ? parsed : null;
  if (!sellerId) return { notFound: true };
  const seller = await loadSellerForSEO(sellerId);
  if (!seller) return { notFound: true };
  return { props: { seo: seller }, revalidate: 900 };
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' };
}

export default function SellerIdPage({ seo }) {
  const router = useRouter();
  const setSellerId = useSetAtom(expandedSellerIdAtom);
  const tNav = useTranslations('Nav');
  const locale = useLocale();

  const idParam = router.query.id;
  const parsed = typeof idParam === 'string'
    ? Number.parseInt(idParam, 10)
    : Array.isArray(idParam)
      ? Number.parseInt(idParam[0] || '', 10)
      : NaN;
  const sellerId = Number.isFinite(parsed) ? parsed : null;

  useEffect(() => {
    if (!router.isReady) return;
    // Open the Seller overlay by setting the numeric sellerId (or null if invalid)
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
        {/* BreadcrumbList with localized labels */}
        <script
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
}
