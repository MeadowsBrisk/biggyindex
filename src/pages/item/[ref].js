import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Home from '../index';
import { useSetAtom } from 'jotai';
import { expandedRefNumAtom } from '@/store/atoms';
import { loadItemForSEO } from '@/lib/seo';

export async function getStaticProps({ params }) {
  const ref = typeof params?.ref === 'string' ? params.ref : null;
  if (!ref) return { notFound: true };
  const item = await loadItemForSEO(ref);
  if (!item) return { notFound: true };
  // Keep payload minimal; only used for <Head>
  return { props: { seo: { ref, name: item.name || '', description: item.description || '', imageUrl: item.imageUrl || null, sellerName: item.sellerName || null } }, revalidate: 900 };
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' };
}

export default function ItemRefPage({ seo }) {
  const router = useRouter();
  const setExpanded = useSetAtom(expandedRefNumAtom);
  const ref = typeof router.query.ref === 'string' ? router.query.ref : null;

  useEffect(() => {
    if (!router.isReady) return;
    setExpanded(ref || null);
  }, [router.isReady, ref, setExpanded]);

  const title = seo?.name ? `${seo.name} | Biggy Index` : 'Item | Biggy Index';
  // Sanitize and trim description, optionally prefix with seller name
  const rawDesc = typeof seo?.description === 'string' ? seo.description : '';
  const cleanDesc = rawDesc
    .replace(/<[^>]+>/g, ' ') // strip any tags, just in case
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
  const baseDesc = cleanDesc ? cleanDesc : (seo?.name ? `${seo.name} item details, pricing and reviews.` : 'Item details, pricing and reviews.');
  const sellerPrefix = seo?.sellerName ? `${seo.sellerName} · ` : '';
  const desc = (sellerPrefix + baseDesc).slice(0, 160);
  const canonical = `https://lbindex.vip/item/${encodeURIComponent(seo?.ref || ref || '')}`;

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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ItemPage',
          mainEntity: {
            '@type': 'Thing',
            name: seo?.name || '',
            description: desc || '',
            image: seo?.imageUrl || undefined,
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
                  name: 'Items',
                  item: 'https://lbindex.vip/home',
                },
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: seo?.name || 'Item',
                  item: canonical,
                },
              ],
            }),
          }}
        />
      </Head>
  <Home suppressDefaultHead />
    </>
  );
}
