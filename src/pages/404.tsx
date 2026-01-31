import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import BrowseIndexButton from '@/components/actions/BrowseIndexButton';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const router = useRouter();
  const tOv = useTranslations('Overlay');
  const t = useTranslations('NotFound');
  const [type, setType] = useState<'item' | 'seller' | 'page'>('page');

  useEffect(() => {
    // Check for /item/ or /seller/ segments (works with locale prefixes like /fr/item/...)
    if (router.asPath.includes('/item/')) setType('item');
    else if (router.asPath.includes('/seller/')) setType('seller');
    else setType('page');
  }, [router.asPath]);

  const config = {
    item: {
      title: t('itemTitle'),
      desc: t('itemDesc'),
      icon: (
        <svg className="w-16 h-16 text-orange-500/80 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    },
    seller: {
      title: t('sellerTitle'),
      desc: t('sellerDesc'),
      icon: (
        <svg className="w-16 h-16 text-blue-500/80 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    },
    page: {
      title: t('pageTitle'),
      desc: t('pageDesc'),
      icon: (
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  };

  const { title, desc, icon } = config[type];

  return (
    <>
      <Head>
        <title>{`${title} | Biggy Index`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 dark:bg-slate-950 px-4 transition-colors">
        <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-gray-100 dark:border-gray-800 p-8 md:p-12 text-center">
          <div className="flex justify-center">{icon}</div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            {title}
          </h1>
          <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 mx-auto mb-4 rounded-full" />
          <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
            {desc}
          </p>
          <div className="flex justify-center">
            <BrowseIndexButton label={tOv('browseIndex') || 'Browse Index'} />
          </div>
        </div>
      </main>
    </>
  );
}

// Ensure we pick up global styles
export async function getStaticProps({ locale }: { locale: string }) {
  let messages = {};
  try {
    messages = (await import(`../messages/${locale || 'en-GB'}/index.json`)).default;
  } catch (err) {
    try {
      messages = (await import(`../messages/en-GB/index.json`)).default;
    } catch { }
  }
  return {
    props: {
      messages
    }
  };
}
