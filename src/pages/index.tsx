import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetStaticProps } from 'next';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  setItemsAtom,
  manifestAtom,
  categoryAtom,
  isLoadingAtom,
  sortedItemsAtom,
  setAllItemsAtom,
  allItemsAtom,
  endorsementsInitialReadyAtom,
  sortKeyAtom,
  includedSellersAtom,
  excludedSellersAtom,
  selectedSubcategoriesAtom,
  sortDirAtom,
  favouritesOnlyAtom,
  freeShippingOnlyAtom,
  expandedRefNumAtom,
} from '@/store/atoms';
import { fetchVotesActionAtom, prefetchAllVotesActionAtom } from '@/store/votesAtoms';
import Sidebar from '@/components/Sidebar';
import ItemList from '@/components/ItemList';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
const ItemDetailOverlay = dynamic(() => import('@/components/ItemDetailOverlay'), { ssr: false });
const SellerOverlay = dynamic(() => import('@/components/SellerOverlay'), { ssr: false });
const SellerAnalyticsModal = dynamic(() => import('@/components/SellerAnalyticsModal'), { ssr: false });
const LatestReviewsModal = dynamic(() => import('@/components/LatestReviewsModal'), { ssr: false });
import SortControls from '@/components/filters/SortControls';
import { useNarrowLayout } from '@/hooks/useNarrowLayout';
import AnimatedLogoHeader from '@/components/AnimatedLogoHeader';
import InfoButton from '@/components/InfoButton';
import Basket from '@/components/Basket';
import ToastHost from '@/components/ToastHost';
import { useDisplayCurrency, useLocale } from '@/providers/IntlProvider';
import LocaleSelector from '@/components/LocaleSelector';
import { useTranslations } from 'next-intl';
import { catKeyForManifest, subKeyForManifest, translateSubLabel, safeTranslate } from '@/lib/taxonomyLabels';
import { getMarketFromPath } from '@/lib/market';

let lastVotesSigCache = '';
let allVotesSigCache = '';
let prefetchedAllNonEndorseCache = false;

export const getStaticProps: GetStaticProps = async () => { return { props: {}, revalidate: 3600 }; };

type HomeProps = { suppressDefaultHead?: boolean };

export default function Home({ suppressDefaultHead = false }: HomeProps): React.ReactElement {
  const router = useRouter();
  const tList = useTranslations('List');
  const tSidebar = useTranslations('Sidebar');
  const tCats = useTranslations('Categories');
  // Determine market: prefer host-based (subdomains) then path-based for localhost/dev
  const market = React.useMemo(() => {
    const path = typeof router?.asPath === 'string' ? router.asPath : (typeof router?.pathname === 'string' ? router.pathname : '/');
    return getMarketFromPath(path) as any;
  }, [router?.pathname, router?.asPath]);
  const setItems = useSetAtom(setItemsAtom);
  const [expandedRef, setExpandedRef] = useAtom<any>(expandedRefNumAtom as any);
  const [isRouting, setIsRouting] = React.useState(false);
  const refHydrated = React.useRef(false);

  React.useEffect(() => {
    const homePath = (() => {
      switch (market) {
        case 'DE': return '/de/home';
        case 'FR': return '/fr/home';
        case 'PT': return '/pt/home';
        case 'IT': return '/it/home';
        default: return '/home';
      }
    })();
    router.prefetch(homePath).catch(() => {});

    const handleStart = (url: string) => {
      if (url === '/home') setIsRouting(true);
    };
    const handleDone = () => setIsRouting(false);

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleDone);
    router.events.on('routeChangeError', handleDone);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleDone);
      router.events.off('routeChangeError', handleDone);
    };
  }, [router, market]);

  // Reflect overlay state in URL (shallow routing) and open from URL param
  // Keep overlay atom in sync with ?ref param on first load
  useEffect(() => {
    if (!router.isReady) return;
    const currentRef = typeof router.query.ref === 'string' ? router.query.ref : null;

    if (!refHydrated.current && router.isReady) {
      refHydrated.current = true;
      if (currentRef && !expandedRef) {
        setExpandedRef(currentRef);
        return;
      }
    }

    if (expandedRef && expandedRef !== currentRef) {
      router.replace({ pathname: router.pathname, query: { ...(router.query as any), ref: expandedRef as any } } as any, undefined, { shallow: true, scroll: false });
    } else if (!expandedRef && currentRef) {
      const { ref, ...rest } = router.query as any;
      const targetPath = router.pathname.includes('[ref]') ? '/' : router.pathname;
      router.replace({ pathname: targetPath, query: rest }, undefined, { shallow: true, scroll: false });
    }
  }, [expandedRef, router, setExpandedRef]);

  // Global scroll-to-top event (e.g., when clicking "Show items" from seller overlay)
  useEffect(() => {
    const onScrollTop = () => {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    };
    window.addEventListener('lb:scroll-top', onScrollTop);
    return () => window.removeEventListener('lb:scroll-top', onScrollTop);
  }, []);
  const [isLoading, setIsLoading] = useAtom<boolean>(isLoadingAtom as any);
  const [sorted] = useAtom<any[]>(sortedItemsAtom as any);
  const [manifest, setManifest] = useAtom<any>(manifestAtom as any);
  const [category] = useAtom<string>(categoryAtom as any);
  const fetchVotes = useSetAtom(fetchVotesActionAtom as any);
  const prefetchAllVotes = useSetAtom(prefetchAllVotesActionAtom as any);
  const endorsementsReady = useAtomValue<boolean>(endorsementsInitialReadyAtom as any);
  const sortKey = useAtomValue<string>(sortKeyAtom as any);
  const sortDir = useAtomValue<'asc' | 'desc'>(sortDirAtom as any);
  const selectedSubs = useAtomValue<string[]>(selectedSubcategoriesAtom as any);
  const includedSellers = useAtomValue<string[]>(includedSellersAtom as any);
  const excludedSellers = useAtomValue<string[]>(excludedSellersAtom as any);
  const favouritesOnly = useAtomValue<boolean>(favouritesOnlyAtom as any);
  const freeShipOnly = useAtomValue<boolean>(freeShippingOnlyAtom as any);
  const { narrow } = useNarrowLayout();
  const setAllItems = useSetAtom(setAllItemsAtom as any);
  const allItems = useAtomValue<any[]>(allItemsAtom as any);
  const { currency, setCurrency } = useDisplayCurrency();
  const { locale } = useLocale();
  const localeCurrency = React.useMemo(() => {
    const l = (locale || 'en-GB').toLowerCase();
    if (l.startsWith('de') || l.startsWith('fr') || l.startsWith('pt') || l.startsWith('it')) return 'EUR';
    return 'GBP';
  }, [locale]);

  // Treat manifest as loading until categories arrive to ensure CategoryFilter can render
  const manifestLoading = !manifest || Object.keys(((manifest as any).categories || {})).length === 0;

  const [maxWaitElapsed, setMaxWaitElapsed] = React.useState(false);
  React.useEffect(() => {
    if (sortKey === 'endorsements' && !endorsementsReady) {
      setMaxWaitElapsed(false);
      const t = setTimeout(() => setMaxWaitElapsed(true), 2500);
      return () => clearTimeout(t);
    }
  }, [sortKey, endorsementsReady]);

  const loadingUi = isLoading || manifestLoading || (sortKey === 'endorsements' && !endorsementsReady && !maxWaitElapsed && lastVotesSigCache === '');

  useEffect(() => {
    // Fetch manifest once per market or when categories are missing (initial boot)
  if (manifest && Object.keys(((manifest as any).categories || {})).length > 0) return;
    let cancelled = false;
    (async () => {
      let mf: any = null;
      try {
        const r = await fetch(`/api/index/manifest?mkt=${market}`);
        if (r.ok) mf = await r.json();
        // If 304 Not Modified, keep existing manifest (mf stays null) and avoid clobbering
      } catch {}
      if (!cancelled && mf) setManifest(mf);
    })();
    return () => { cancelled = true; };
  }, [manifest, setManifest, market]);

  useEffect(() => {
    const loadItems = async () => {
      if (!manifest) return;
      setIsLoading(true);
      let items: any[] = [];
  if (category === 'All' || !(manifest as any).categories) {
        try {
          const r = await fetch(`/api/index/items?mkt=${market}`);
            if (r.ok) {
              const data = await r.json();
              items = Array.isArray(data.items) ? data.items : [];
            }
        } catch {}
        // No filesystem fallback in blobs-only mode
      } else {
        try {
          const r = await fetch(`/api/index/category/${encodeURIComponent(category)}?mkt=${market}`);
          if (r.ok) {
            const data = await r.json();
            items = Array.isArray(data.items) ? data.items : [];
          }
        } catch {}
      }
      // Set raw items immediately for snappy UI
      setItems(items);
      // Background: enrich items with seller review stats (average rating, reviews count, avg arrival)
      // We fetch once per load and overlay into items, then reset items to include reviewStats
      ;(async () => {
        try {
          const res = await fetch(`/api/index/seller-analytics?mkt=${market}`);
          if (!res.ok) return;
          const analytics = await res.json();
          const sellersArr = Array.isArray(analytics?.sellers) ? analytics.sellers : [];
          const byId: Map<string, any> = new Map(sellersArr.map((s: any) => [String(s?.sellerId), s]));
          const enrich = (list: any[]) => list.map((raw: any) => {
            try {
              const sid = raw?.sid != null ? String(raw.sid) : (raw?.sellerId != null ? String(raw.sellerId) : null);
              if (!sid) return raw;
              const rec = byId.get(sid);
              if (!rec || !rec.lifetime) return raw;
              const rs = {
                averageRating: typeof rec.lifetime.avgRating === 'number' ? rec.lifetime.avgRating : null,
                numberOfReviews: typeof rec.lifetime.totalReviews === 'number' ? rec.lifetime.totalReviews : null,
                averageDaysToArrive: typeof rec.lifetime.avgDaysToArrive === 'number' ? rec.lifetime.avgDaysToArrive : null,
              };
              // Preserve existing props and attach reviewStats
              return { ...raw, reviewStats: rs };
            } catch { return raw; }
          });
          const enriched = enrich(items);
          if (enriched && enriched.length) {
            setItems(enriched);
            // If we seeded allItems from this fetch, overlay there too
            if ((category === 'All' && enriched.length) || (allItems.length === 0 && enriched.length && category === 'All')) {
              setAllItems(enriched);
            }
          }
        } catch {}
      })();
      // If we are on All OR allItems not yet populated, seed full dataset.
      if ((category === 'All' && items.length) || (allItems.length === 0 && items.length && category === 'All')) {
        setAllItems(items);
      }
      setIsLoading(false);
    };
    loadItems();
  }, [manifest, category, setItems, setIsLoading, setAllItems, allItems.length, market]);

  // Background full-dataset fetch (once) to stabilize category counts when user starts in a specific category other than All.
  useEffect(() => {
    if (!manifest) return;
    if (allItems.length > 0) return; // already loaded
    // If user is not on 'All', fetch full items silently in background
    if (category !== 'All') {
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch(`/api/index/items?mkt=${market}`);
          if (r.ok) {
            const data = await r.json();
            const items = Array.isArray(data.items) ? data.items : [];
            if (!cancelled && items.length) setAllItems(items);
          } else {
            // No filesystem fallback in blobs-only mode
          }
        } catch {}
      })();
      return () => { cancelled = true; };
    }
  }, [manifest, category, allItems.length, setAllItems, market]);

  useEffect(() => {
    if (isLoading) return;
    if (!sorted || sorted.length === 0) return;
    if (sortKey === 'endorsements') return;
    const ids = sorted.slice(0, 120).map((it: any) => it.id).filter(Boolean);
    if (ids.length === 0) return;
    const sig = ids.join(',');
    if (lastVotesSigCache === sig) return;
    lastVotesSigCache = sig;
    const t = setTimeout(() => fetchVotes(ids), 40);
    return () => clearTimeout(t);
  }, [isLoading, sorted, category, fetchVotes, sortKey]);

  useEffect(() => {
    if (isLoading) return;
    if (sortKey !== 'endorsements') return;
    if (!sorted || sorted.length === 0) return;
    const sigObj = { kind: 'all', count: sorted.length, first: sorted[0]?.id, last: sorted[sorted.length - 1]?.id };
    const sig = JSON.stringify(sigObj);
    if (allVotesSigCache === sig) return;
    allVotesSigCache = sig;
    prefetchAllVotes(sorted.map((it: any) => it.id));
  }, [isLoading, sortKey, sorted, prefetchAllVotes]);

  useEffect(() => {
    if (isLoading) return;
    if (sortKey === 'endorsements') return;
    if (!sorted || sorted.length === 0) return;
    if (sorted.length <= 120) return;
    if (prefetchedAllNonEndorseCache) return;
    const t = setTimeout(() => {
      prefetchAllVotes(sorted.map((it: any) => it.id));
      prefetchedAllNonEndorseCache = true;
    }, 400);
    return () => clearTimeout(t);
  }, [isLoading, sortKey, sorted, prefetchAllVotes]);

  const activeCategory = category && category !== 'All' ? category : null;
  const subs = Array.isArray(selectedSubs) ? selectedSubs : [];
  const hasSubs = subs.length > 0;
  const multipleSubs = subs.length > 1;
  let desktopCrumbContent: React.ReactNode = null;
  if (activeCategory) {
    const parentKey = catKeyForManifest(activeCategory);
    const catLabel = safeTranslate(tCats, parentKey) || activeCategory;
    const subLabels = hasSubs
      ? subs.map((s: string) => {
          const sk = subKeyForManifest(s);
          return translateSubLabel(tCats, parentKey, sk) || s;
        })
      : [] as string[];
    if (hasSubs) {
      desktopCrumbContent = multipleSubs
        ? <span className="italic">{catLabel} → {subLabels.join(', ')}</span>
        : <span className="italic">{catLabel} → {subLabels[0]}</span>;
    } else {
      desktopCrumbContent = <span className="italic">{catLabel}</span>;
    }
  }
  const desktopBreadcrumb = desktopCrumbContent ? (
    // Use a simple preposition from i18n and append the rich node to avoid misuse of t.rich with ICU vars
    <span> {tList('inCategory', { category: '' })}{desktopCrumbContent}</span>
  ) : null;
  const freeShipNoteDesktop = freeShipOnly ? <span className="ml-1 text-sm text-gray-600 dark:text-gray-300">{tList('freeShippingNote')}</span> : null;
  const includeExcludeInline = (() => {
    const parts: string[] = [];
    if (includedSellers?.length) parts.push(`Including: ${includedSellers.join(', ')}`);
    if (!favouritesOnly && excludedSellers?.length) parts.push(`Excluding: ${excludedSellers.join(', ')}`);
    if (parts.length === 0) return null as React.ReactNode;
    return <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({parts.join('; ')})</span>;
  })();
  const includeExcludeBlock = (() => {
    const parts: string[] = [];
    if (includedSellers?.length) parts.push(`Including: ${includedSellers.join(', ')}`);
    if (!favouritesOnly && excludedSellers?.length) parts.push(`Excluding: ${excludedSellers.join(', ')}`);
    if (parts.length === 0) return null as React.ReactNode;
    return <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">({parts.join('; ')})</div>;
  })();
  const sortLabels: Record<string, string> = { hotness: 'Hotness', endorsements: 'Endorsements', lastUpdated: 'Recently Updated', reviewsCount: 'Reviews Count', reviewsRating: 'Reviews Rating', name: 'Name', price: 'Price', arrival: 'Avg Arrival', firstSeen: 'First Seen' };
  const mobileSortSummary = (narrow ? `${sortLabels[sortKey] || sortKey} ${sortDir === 'asc' ? '↑' : '↓'}` : '');
  const baseLabel = loadingUi
    ? tList('loading')
    : favouritesOnly
      ? tList('showingFavouritesItems', { count: sorted.length })
      : tList('showingItems', { count: sorted.length });

  return (
    <>
      {!suppressDefaultHead && (
        <Head>
          <title>Biggy Index — items, sellers, and reviews</title>
          <meta name="description" content="Explore items across categories, compare sellers, and read reviews. Updated regularly with fresh data and community signals." />
          <link rel="canonical" href="https://biggyindex.com/" />
        </Head>
      )}
      <div className="mx-auto max-w-auto p-4">
      <AnimatedLogoHeader
        rightSlot={(
          <div className="flex items-center gap-2">
            <LocaleSelector />
            <Basket />
          </div>
        ) as any}
      />
      <ToastHost />
      {isRouting && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-white/70 backdrop-blur-sm dark:bg-slate-900/70">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      )}
      <div className="flex gap-6">
        <Sidebar />
        <div className="flex-1">
          {!narrow && (
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-sm text-gray-600 dark:text-gray-300">{baseLabel}{desktopBreadcrumb}{freeShipNoteDesktop}{includeExcludeInline}</div>
              <div className="flex items-center gap-2">
                <SortControls />
              </div>
            </div>
          )}
          {narrow && (
            <div className="mb-4">
              <div className="text-sm text-gray-600 dark:text-gray-300 flex flex-wrap items-baseline gap-x-1">
                <span>{baseLabel}:</span>
                {desktopCrumbContent && desktopCrumbContent}
                {freeShipOnly && (
                  <span className="ml-1 text-sm text-gray-600 dark:text-gray-300">{tList('freeShippingNote')}</span>
                )}
              </div>
              {includeExcludeBlock}
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tSidebar('sort')}: {mobileSortSummary}</div>
            </div>
          )}
          <div className="relative min-h-40">
            {loadingUi && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
              </div>
            )}
            {!loadingUi && <ItemList />}
          </div>
        </div>
      </div>
      {/*  Renable soon */}
  <InfoButton content={null as any} />
      <ItemDetailOverlay />
      <SellerOverlay />
      <SellerAnalyticsModal />
      <LatestReviewsModal />
      </div>
    </>
  );
}
