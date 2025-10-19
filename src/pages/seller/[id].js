import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Home from '../index';
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom } from '@/store/atoms';
import { loadSellerForSEO } from '@/lib/seo';

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

  const title = seo?.sellerName ? `${seo.sellerName} – Seller Profile | Biggy Index` : 'Seller Profile | Biggy Index';
  const description = [
    seo?.sellerName || null,
    typeof seo?.itemsCount === 'number' ? `${seo.itemsCount} items` : null,
  ].filter(Boolean).join(' • ');
  const canonical = `https://lbindex.vip/seller/${encodeURIComponent(String(seo?.id ?? sellerId ?? ''))}`;

  return (
    <>
      <Head>
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        <link rel="canonical" href={canonical} />
        {seo?.sellerImageUrl && <meta property="og:image" content={seo.sellerImageUrl} />}        
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          about: {
            '@type': 'Organization',
            name: seo?.sellerName || '',
            url: seo?.shareLink || undefined,
            image: seo?.sellerImageUrl || undefined,
          },
        }) }} />
        {/* Optional BreadcrumbList for better internal linking signals */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: 'Home',
                  item: 'https://lbindex.vip/',
                },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: 'Sellers',
                  item: 'https://lbindex.vip/home',
                },
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: seo?.sellerName || 'Seller',
                  item: canonical,
                },
              ],
            }),
          }}
        />
      </Head>
      <Home />
    </>
  );
}
