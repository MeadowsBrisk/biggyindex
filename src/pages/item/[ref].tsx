import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetStaticProps, GetStaticPaths, NextPage } from 'next';
import { useRouter } from 'next/router';
import Home from '../index';
import { useSetAtom } from 'jotai';
import { expandedRefNumAtom } from '@/store/atoms';
import { loadItemForSEO } from '@/lib/seo';
import { useTranslations, useLocale } from 'next-intl';
import { buildItemUrl, hostForLocale } from '@/lib/routing';

interface ItemSEO {
  ref: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  sellerName?: string | null;
}

interface ItemRefPageProps {
  seo: ItemSEO | null;
}

export const getStaticProps: GetStaticProps<ItemRefPageProps> = async ({ params }) => {
  const ref = typeof params?.ref === 'string' ? params.ref : null;
  if (!ref) return { notFound: true };
  const item = await loadItemForSEO(ref);
  if (!item) return { notFound: true };
  const seo: ItemSEO = {
    ref,
    name: item.name || '',
    description: item.description || null,
    imageUrl: item.imageUrl || null,
    sellerName: item.sellerName || null,
  };
  return { props: { seo }, revalidate: 900 };
};

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

const ItemRefPage: NextPage<ItemRefPageProps> = ({ seo }) => {
  const router = useRouter();
  const setExpanded = useSetAtom(expandedRefNumAtom);
  const tReviews = useTranslations('Reviews');
  const tNav = useTranslations('Nav');
  const locale = useLocale();
  const ref = typeof router.query.ref === 'string' ? router.query.ref : null;

  useEffect(() => {
    if (!router.isReady) return;
    setExpanded(ref || null);
  }, [router.isReady, ref, setExpanded]);

  const titleBase = seo?.name ? seo.name : tNav('items');
  const bySuffix = seo?.sellerName ? ` ${tReviews('soldBy')} ${seo.sellerName}` : '';
  const title = `${titleBase}${bySuffix} | Biggy Index`;

  const rawDesc = typeof seo?.description === 'string' ? seo.description : '';
  const cleanDesc = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const baseDesc = cleanDesc ? cleanDesc : (seo?.name ? `${seo.name}` : tNav('items'));
  const sellerPrefix = seo?.sellerName ? `${seo.sellerName} · ` : '';
  const desc = (sellerPrefix + baseDesc).slice(0, 160);

  const canonical = buildItemUrl(String(seo?.ref || ref || ''), locale);

  return (
    <>
      <Head>
        <title>{title}</title>
        {desc && <meta name="description" content={desc} />}
        {desc && <meta property="og:description" content={desc} />}
        <meta property="og:title" content={title} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        {desc && <meta name="twitter:description" content={desc} />}
        <link rel="canonical" href={canonical} />
        {seo?.imageUrl && <meta property="og:image" content={seo.imageUrl} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemPage',
              mainEntity: {
                '@type': 'Thing',
                name: seo?.name || '',
                description: desc || '',
                image: seo?.imageUrl || undefined,
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: tNav('home'), item: hostForLocale(locale) + '/' },
                { '@type': 'ListItem', position: 2, name: tNav('items'), item: hostForLocale(locale) + '/home' },
                { '@type': 'ListItem', position: 3, name: seo?.name || tNav('items'), item: canonical },
              ],
            }),
          }}
        />
      </Head>
      <Home suppressDefaultHead />
    </>
  );
};

export default ItemRefPage;
