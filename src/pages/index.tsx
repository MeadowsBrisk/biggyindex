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
  excludedSubcategoriesAtom,
  sortDirAtom,
  favouritesOnlyAtom,
  freeShippingOnlyAtom,
  expandedRefNumAtom,
} from '@/store/atoms';
import { fetchVotesActionAtom, prefetchAllVotesActionAtom } from '@/store/votesAtoms';
import Sidebar from '@/components/layout/Sidebar';
import ItemList from '@/components/item/ItemList';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
const ItemDetailOverlay = dynamic(() => import('@/components/item/ItemDetailOverlay'), { ssr: false });
const SellerOverlay = dynamic(() => import('@/components/seller/SellerOverlay'), { ssr: false });
const SellerAnalyticsModal = dynamic(() => import('@/components/seller/SellerAnalyticsModal'), { ssr: false });
const LatestReviewsModal = dynamic(() => import('@/components/reviews/LatestReviewsModal'), { ssr: false });
const FirstVisitBanner = dynamic(() => import('@/components/banners/FirstVisitBanner'), { ssr: false });
import OptionsModal from '@/components/common/OptionsModal';
import SortControls from '@/components/filters/SortControls';
import { useNarrowLayout } from '@/hooks/useNarrowLayout';
import AnimatedLogoHeader from '@/components/layout/AnimatedLogoHeader';
import InfoButton from '@/components/common/InfoButton';
import Basket from '@/components/actions/Basket';
import ToastHost from '@/components/common/ToastHost';
import { useDisplayCurrency, useLocale } from '@/providers/IntlProvider';
import { hostForLocale } from '@/lib/market/routing';
import LocaleSelector from '@/components/layout/LocaleSelector';
import { useTranslations } from 'next-intl';
import { catKeyForManifest, subKeyForManifest, translateSubLabel, safeTranslate } from '@/lib/taxonomy/taxonomyLabels';
import { getMarketFromPath, localeToOgFormat, getOgLocaleAlternates, localeToMarket } from '@/lib/market/market';

let lastVotesSigCache = '';
let allVotesSigCache = '';
let prefetchedAllNonEndorseCache = false;

export const getStaticProps: GetStaticProps = async (context) => {
  // ISR: Pre-fetch all items and manifest at build time / revalidation
  // This eliminates client-side API calls, reducing function invocations by ~95%
  // Derive market from locale (set by Next.js i18n domain routing)
  const market = localeToMarket(context.locale);
  
  try {
    const { getAllItems, getManifest, getSnapshotMeta } = await import('@/lib/data/indexData');
    
    // Only fetch items and manifest for initial page load
    // Reviews/media are lazy-loaded by modals when opened (reduces __NEXT_DATA__ by ~200-400KB)
    const [rawItems, manifest, meta] = await Promise.all([
      getAllItems(market as any),
      getManifest(market as any),
      getSnapshotMeta(market as any),
    ]);
    
    // Keep items minified - normalization happens client-side in setItemsAtom/setAllItemsAtom
    // This reduces page data size by ~40-50%
    const items = rawItems;
    
    // CRITICAL: If we got empty data, use very short revalidate to retry quickly
    // This prevents caching bad ISR responses for a long time
    const hasData = items.length > 0 && Object.keys(manifest?.categories || {}).length > 0;
    
    // NOTE: Reviews and media are now lazy-loaded by the LatestReviewsModal component
    // when it opens, rather than being included in __NEXT_DATA__. This saves ~200-400KB.
    
    return {
      props: {
        initialItems: items,
        initialManifest: manifest,
        snapshotMeta: meta,
      },
      // If data is empty, retry in 10 seconds instead of 16 minutes
      revalidate: hasData ? 1000 : 10,
    };
  } catch (e) {
    console.error('[ISR] Failed to fetch data:', e);
    // Fallback to empty data with short revalidate to retry quickly
    return {
      props: {
        initialItems: [],
        initialManifest: { categories: {}, totalItems: 0 },
        snapshotMeta: null,
      },
      revalidate: 10, // Retry in 10 seconds
    };
  }
};

type HomeProps = { 
  suppressDefaultHead?: boolean;
  initialItems?: any[];
  initialManifest?: any;
  snapshotMeta?: any;
};

export default function Home({ suppressDefaultHead = false, initialItems = [], initialManifest, snapshotMeta }: HomeProps): React.ReactElement {
  const router = useRouter();
  const tList = useTranslations('List');
  const tSidebar = useTranslations('Sidebar');
  const tCats = useTranslations('Categories');
  const tMeta = useTranslations('Meta');
  // Determine market: prefer host-based (subdomains) then path-based for localhost/dev
  const market = React.useMemo(() => {
    const path = typeof router?.asPath === 'string' ? router.asPath : (typeof router?.pathname === 'string' ? router.pathname : '/');
    return getMarketFromPath(path) as any;
  }, [router?.pathname, router?.asPath]);
  const setItems = useSetAtom(setItemsAtom);
  const [expandedRef, setExpandedRef] = useAtom<any>(expandedRefNumAtom as any);
  const [category, setCategory] = useAtom<string>(categoryAtom as any);
  const [selectedSubs, setSelectedSubs] = useAtom<string[]>(selectedSubcategoriesAtom as any);
  const [excludedSubs, setExcludedSubs] = useAtom<string[]>(excludedSubcategoriesAtom as any);
  const [isRouting, setIsRouting] = React.useState(false);
  const refHydrated = React.useRef(false);
  const categoryHydrated = React.useRef(false);
  const isrHydrated = React.useRef(false);
  // Track if we're waiting for URL category to be applied (prevents flash of unfiltered content)
  // Initialize from URL on client to prevent flash before router.isReady
  const [pendingUrlCategory, setPendingUrlCategory] = React.useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('cat');
      return cat && cat.toLowerCase() !== 'all' ? cat : null;
    } catch {
      return null;
    }
  });

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

  // Hydrate category and subcategories from URL on mount
  useEffect(() => {
    if (!router.isReady || categoryHydrated.current) return;
    categoryHydrated.current = true;
    
    const urlCat = typeof router.query.cat === 'string' ? router.query.cat : null;
    const urlSub = typeof router.query.sub === 'string' ? router.query.sub : null;
    const urlExcl = typeof router.query.excl === 'string' ? router.query.excl : null;
    
    if (urlCat) {
      // Convert lowercase URL to proper case (e.g., 'flower' -> 'Flower')
      const properCaseCat = urlCat.charAt(0).toUpperCase() + urlCat.slice(1).toLowerCase();
      if (properCaseCat !== category) {
        // Set pending state to show loader until filtering completes
        setPendingUrlCategory(properCaseCat);
        setCategory(properCaseCat);
      }
    }
    if (urlSub) {
      // Convert each subcategory to proper case
      const subs = urlSub.split(',').map(s => s.trim()).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
      if (subs.length > 0) {
        setSelectedSubs(subs);
      }
    }
    if (urlExcl) {
      // Convert excluded subcategories to proper case
      const excl = urlExcl.split(',').map(s => s.trim()).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
      if (excl.length > 0) {
        setExcludedSubs(excl);
      }
    }
  }, [router.isReady, router.query.cat, router.query.sub, router.query.excl, category, setCategory, setSelectedSubs, setExcludedSubs]);

  // Sync category and subcategories to URL
  useEffect(() => {
    if (!router.isReady || !categoryHydrated.current) return;
    
    const currentCat = typeof router.query.cat === 'string' ? router.query.cat : null;
    const currentSub = typeof router.query.sub === 'string' ? router.query.sub : null;
    const currentExcl = typeof router.query.excl === 'string' ? router.query.excl : null;
    const targetSub = selectedSubs.length > 0 ? selectedSubs.map(s => s.toLowerCase()).join(',') : null;
    const targetExcl = excludedSubs.length > 0 ? excludedSubs.map(s => s.toLowerCase()).join(',') : null;
    const targetCat = category !== 'All' ? category.toLowerCase() : null;
    
    const needsCatUpdate = (targetCat !== currentCat);
    const needsSubUpdate = targetSub !== currentSub;
    const needsExclUpdate = targetExcl !== currentExcl;
    
    if (needsCatUpdate || needsSubUpdate || needsExclUpdate) {
      const newQuery: any = { ...router.query };
      
      if (targetCat) {
        newQuery.cat = targetCat;
      } else {
        delete newQuery.cat;
      }
      
      if (targetSub) {
        newQuery.sub = targetSub;
      } else {
        delete newQuery.sub;
      }
      
      if (targetExcl) {
        newQuery.excl = targetExcl;
      } else {
        delete newQuery.excl;
      }
      
      router.replace({ pathname: router.pathname, query: newQuery }, undefined, { shallow: true, scroll: false });
    }
  }, [category, selectedSubs, excludedSubs, router]);

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
  const fetchVotes = useSetAtom(fetchVotesActionAtom as any);
  const prefetchAllVotes = useSetAtom(prefetchAllVotesActionAtom as any);
  const endorsementsReady = useAtomValue<boolean>(endorsementsInitialReadyAtom as any);
  const sortKey = useAtomValue<string>(sortKeyAtom as any);
  const sortDir = useAtomValue<'asc' | 'desc'>(sortDirAtom as any);
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

  const loadingUi = isLoading || manifestLoading || pendingUrlCategory !== null || (sortKey === 'endorsements' && !endorsementsReady && !maxWaitElapsed && lastVotesSigCache === '');

  // ISR Hydration: Use server-rendered data on initial load, fall back to API only if needed
  useEffect(() => {
    if (isrHydrated.current) return;
    if (!initialManifest && !initialItems) return;
    
    isrHydrated.current = true;
    
    // Hydrate manifest from ISR props
    if (initialManifest && Object.keys((initialManifest as any).categories || {}).length > 0) {
      setManifest(initialManifest);
    }
    
    // Check if URL has a category filter - parse directly from window.location for reliability
    // router.query may not be ready yet during initial hydration
    let hasUrlCategory = false;
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlCat = params.get('cat');
        hasUrlCategory = !!(urlCat && urlCat.toLowerCase() !== 'all');
      } catch {}
    }
    
    // Hydrate items from ISR props
    if (initialItems && initialItems.length > 0) {
      // Always cache all items for filtering
      setAllItems(initialItems);
      
      // Only set displayed items if no URL category filter (otherwise loadItems will filter)
      if (!hasUrlCategory && category === 'All') {
        setItems(initialItems);
        setIsLoading(false);
      }
    }
    
    // NOTE: Reviews/media are now lazy-loaded by LatestReviewsModal when opened
  }, [initialManifest, initialItems, setManifest, setItems, setAllItems, setIsLoading, category]);

  useEffect(() => {
    // Fetch manifest from API only if ISR data missing
    // Skip if already have manifest OR if ISR hasn't attempted to hydrate yet
    const hasValidManifest = manifest && Object.keys((manifest as any).categories || {}).length > 0;
    if (hasValidManifest) return;
    if (!isrHydrated.current) return;
    
    let cancelled = false;
    (async () => {
      let mf: any = null;
      try {
        const r = await fetch(`/api/index/manifest?mkt=${market}`);
        if (r.ok) mf = await r.json();
      } catch {}
      if (!cancelled && mf) setManifest(mf);
    })();
    return () => { cancelled = true; };
  }, [manifest, setManifest, market]);

  useEffect(() => {
    const loadItems = async () => {
      if (!manifest) return;
      
      // If we have allItems cached, filter locally instead of API call
      if (allItems.length > 0) {
        if (category === 'All') {
          setItems(allItems);
        } else {
          // Client-side category filtering - uses minified key 'c'
          const filtered = allItems.filter((item: any) => {
            const itemCat = (item.c || '').toLowerCase();
            const targetCat = category.toLowerCase();
            return itemCat === targetCat;
          });
          // Only set filtered if we got results, otherwise keep current items
          if (filtered.length > 0) {
            setItems(filtered);
          }
        }
        setIsLoading(false);
        // Clear pending URL category state once filtering is complete
        if (pendingUrlCategory && category.toLowerCase() === pendingUrlCategory.toLowerCase()) {
          setPendingUrlCategory(null);
        }
        return;
      }
      
      // Fallback: fetch from API only when allItems not available
      setIsLoading(true);
      let items: any[] = [];
      
      try {
        const r = await fetch(`/api/index/items?mkt=${market}`);
        if (r.ok) {
          const data = await r.json();
          items = Array.isArray(data.items) ? data.items : [];
        }
      } catch {}
      
      // Only set items if we got a valid response - never clear existing items with empty data
      if (items.length > 0) {
        setItems(items);
        setAllItems(items);
      }
      setIsLoading(false);
      // Clear pending URL category state
      if (pendingUrlCategory) {
        setPendingUrlCategory(null);
      }
    };
    loadItems();
  }, [manifest, category, setItems, setIsLoading, setAllItems, allItems, market, pendingUrlCategory]);

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
  const excludedSubsList = Array.isArray(excludedSubs) ? excludedSubs : [];
  const hasSubs = subs.length > 0;
  const hasExcluded = excludedSubsList.length > 0;
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
    const excludedLabels = hasExcluded
      ? excludedSubsList.map((s: string) => {
          const sk = subKeyForManifest(s);
          return translateSubLabel(tCats, parentKey, sk) || s;
        })
      : [] as string[];
    if (hasSubs || hasExcluded) {
      const parts: React.ReactNode[] = [];
      if (hasSubs) {
        parts.push(multipleSubs ? subLabels.join(', ') : subLabels[0]);
      }
      if (hasExcluded) {
        parts.push(<span className="text-red-500/80">−{excludedLabels.join(', −')}</span>);
      }
      desktopCrumbContent = <span className="italic">{catLabel} → {parts.map((p, i) => <React.Fragment key={i}>{i > 0 && ', '}{p}</React.Fragment>)}</span>;
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

  // Item count for SEO title - use manifest.totalItems from ISR
  const itemCount = (initialManifest as any)?.totalItems || (manifest as any)?.totalItems || 0;

  return (
    <>
      {!suppressDefaultHead && (
        <Head>
          <title>{tMeta('indexTitle', { count: itemCount })}</title>
          <meta name="description" content={tMeta('indexDescription')} />
          <link rel="canonical" href={hostForLocale(locale)} />
          <meta property="og:title" content={tMeta('indexTitle', { count: itemCount })} />
          <meta property="og:description" content={tMeta('indexDescription')} />
          <meta property="og:url" content={hostForLocale(locale)} />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Biggy Index" />
          <meta property="og:locale" content={localeToOgFormat(locale || 'en-GB')} />
          {getOgLocaleAlternates(locale || 'en-GB').map(ogLoc => (
            <meta key={ogLoc} property="og:locale:alternate" content={ogLoc} />
          ))}
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:title" content={tMeta('indexTitle', { count: itemCount })} />
          <meta name="twitter:description" content={tMeta('indexDescription')} />
          {['en','de','fr','it','pt'].map(l => (
            <link key={l} rel="alternate" href={hostForLocale(l)} hrefLang={l} />
          ))}
          <link rel="alternate" href={hostForLocale('en')} hrefLang="x-default" />
        </Head>
      )}
      <main className="mx-auto max-w-auto p-4">
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
      <OptionsModal />
      <FirstVisitBanner />
      </main>
    </>
  );
}
