import { useEffect } from "react";
import React from 'react';
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { setItemsAtom, manifestAtom, categoryAtom, isLoadingAtom, sortedItemsAtom } from "@/store/atoms";
import { setAllItemsAtom, allItemsAtom } from "@/store/atoms";
import { endorsementsInitialReadyAtom, sortKeyAtom } from "@/store/atoms";
import { includedSellersAtom, excludedSellersAtom, selectedSubcategoriesAtom, sortDirAtom, favouritesOnlyAtom, freeShippingOnlyAtom } from "@/store/atoms";
import { fetchVotesActionAtom, prefetchAllVotesActionAtom } from "@/store/votesAtoms";
import Sidebar from "@/components/Sidebar";
import ItemList from "@/components/ItemList";
import { useRouter } from 'next/router';
import { expandedRefNumAtom } from '@/store/atoms';
import dynamic from 'next/dynamic';
const ItemDetailOverlay = dynamic(() => import('@/components/ItemDetailOverlay'), { ssr: false });
const SellerOverlay = dynamic(() => import('@/components/SellerOverlay'), { ssr: false });
const SellerAnalyticsModal = dynamic(() => import('@/components/SellerAnalyticsModal'), { ssr: false });
const LatestReviewsModal = dynamic(() => import('@/components/LatestReviewsModal'), { ssr: false });
import SortControls from "@/components/filters/SortControls";
import { useNarrowLayout } from "@/hooks/useNarrowLayout";
import AnimatedLogoHeader from '@/components/AnimatedLogoHeader';
import InfoButton from '@/components/InfoButton';
import Basket from '@/components/Basket';
import ToastHost from '@/components/ToastHost';
import { displayCurrencyAtom } from '@/store/atoms';

let lastVotesSigCache = '';
let allVotesSigCache = '';
let prefetchedAllNonEndorseCache = false;

export async function getStaticProps() { return { props: {}, revalidate: 3600 }; }

export default function Home() {
  const router = useRouter();
  const setItems = useSetAtom(setItemsAtom);
  const [expandedRef, setExpandedRef] = useAtom(expandedRefNumAtom);
  const [isRouting, setIsRouting] = React.useState(false);
  const refHydrated = React.useRef(false);

  React.useEffect(() => {
    router.prefetch('/home').catch(() => {});

    const handleStart = (url) => {
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
  }, [router]);

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
      router.replace({ pathname: router.pathname, query: { ...router.query, ref: expandedRef } }, undefined, { shallow: true, scroll: false });
    } else if (!expandedRef && currentRef) {
      const { ref, ...rest } = router.query;
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
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [sorted] = useAtom(sortedItemsAtom);
  const [manifest, setManifest] = useAtom(manifestAtom);
  const [category] = useAtom(categoryAtom);
  const fetchVotes = useSetAtom(fetchVotesActionAtom);
  const prefetchAllVotes = useSetAtom(prefetchAllVotesActionAtom);
  const endorsementsReady = useAtomValue(endorsementsInitialReadyAtom);
  const sortKey = useAtomValue(sortKeyAtom);
  const sortDir = useAtomValue(sortDirAtom);
  const selectedSubs = useAtomValue(selectedSubcategoriesAtom);
  const includedSellers = useAtomValue(includedSellersAtom);
  const excludedSellers = useAtomValue(excludedSellersAtom);
  const favouritesOnly = useAtomValue(favouritesOnlyAtom);
  const freeShipOnly = useAtomValue(freeShippingOnlyAtom);
  const { narrow } = useNarrowLayout();
  const setAllItems = useSetAtom(setAllItemsAtom);
  const allItems = useAtomValue(allItemsAtom);
  const [displayCurrency, setDisplayCurrency] = useAtom(displayCurrencyAtom);

  const manifestLoading = !manifest || !manifest.categories || Object.keys(manifest.categories).length === 0;

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
    if (manifest && manifest.categories && Object.keys(manifest.categories).length > 0) return;
    let cancelled = false;
    (async () => {
      let mf = null;
      try { const r = await fetch('/api/index/manifest'); if (r.ok) mf = await r.json(); } catch {}
      if (!mf) {
        try { const r2 = await fetch('/data/manifest.json'); if (r2.ok) mf = await r2.json(); } catch {}
      }
      if (!cancelled && mf) setManifest(mf);
    })();
    return () => { cancelled = true; };
  }, [manifest, setManifest]);

  useEffect(() => {
    const loadItems = async () => {
      if (!manifest || !manifest.categories || Object.keys(manifest.categories).length === 0) return;
      setIsLoading(true);
      let items = [];
      if (category === 'All') {
        try {
          const r = await fetch('/api/index/items');
            if (r.ok) {
              const data = await r.json();
              items = Array.isArray(data.items) ? data.items : [];
            }
        } catch {}
        if (items.length === 0) {
          try { const all = await fetch('/indexed_items.json').then(r => r.json()); items = Array.isArray(all) ? all : []; } catch {}
        }
      } else {
        try {
          const r = await fetch(`/api/index/category/${encodeURIComponent(category)}`);
          if (r.ok) {
            const data = await r.json();
            items = Array.isArray(data.items) ? data.items : [];
          }
        } catch {}
        if (items.length === 0) {
          const file = manifest.categories[category]?.file;
          if (file) {
            try { const arr = await fetch(file).then(r => r.json()); items = Array.isArray(arr) ? arr : []; } catch {}
          }
        }
      }
      setItems(items);
      // If we are on All OR allItems not yet populated, seed full dataset.
      if ((category === 'All' && items.length) || (allItems.length === 0 && items.length && category === 'All')) {
        setAllItems(items);
      }
      setIsLoading(false);
    };
    loadItems();
  }, [manifest, category, setItems, setIsLoading, setAllItems, allItems.length]);

  // Background full-dataset fetch (once) to stabilize category counts when user starts in a specific category other than All.
  useEffect(() => {
    if (!manifest || !manifest.categories || Object.keys(manifest.categories).length === 0) return;
    if (allItems.length > 0) return; // already loaded
    // If user is not on 'All', fetch full items silently in background
    if (category !== 'All') {
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch('/api/index/items');
          if (r.ok) {
            const data = await r.json();
            const items = Array.isArray(data.items) ? data.items : [];
            if (!cancelled && items.length) setAllItems(items);
          } else {
            const r2 = await fetch('/indexed_items.json');
            if (r2.ok) {
              const arr = await r2.json();
              if (!cancelled && Array.isArray(arr) && arr.length) setAllItems(arr);
            }
          }
        } catch {}
      })();
      return () => { cancelled = true; };
    }
  }, [manifest, category, allItems.length, setAllItems]);

  useEffect(() => {
    if (isLoading) return;
    if (!sorted || sorted.length === 0) return;
    if (sortKey === 'endorsements') return;
    const ids = sorted.slice(0, 120).map(it => it.id).filter(Boolean);
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
    prefetchAllVotes(sorted.map(it => it.id));
  }, [isLoading, sortKey, sorted, prefetchAllVotes]);

  useEffect(() => {
    if (isLoading) return;
    if (sortKey === 'endorsements') return;
    if (!sorted || sorted.length === 0) return;
    if (sorted.length <= 120) return;
    if (prefetchedAllNonEndorseCache) return;
    const t = setTimeout(() => {
      prefetchAllVotes(sorted.map(it => it.id));
      prefetchedAllNonEndorseCache = true;
    }, 400);
    return () => clearTimeout(t);
  }, [isLoading, sortKey, sorted, prefetchAllVotes]);

  const activeCategory = category && category !== 'All' ? category : null;
  const subs = Array.isArray(selectedSubs) ? selectedSubs : [];
  const hasSubs = subs.length > 0;
  const multipleSubs = subs.length > 1;
  let desktopCrumbContent = null;
  if (activeCategory) {
    if (hasSubs) {
      desktopCrumbContent = multipleSubs
        ? <span className="italic">{activeCategory} → {subs.join(', ')}</span>
        : <span className="italic">{activeCategory} → {subs[0]}</span>;
    } else {
      desktopCrumbContent = <span className="italic">{activeCategory}</span>;
    }
  }
  const desktopBreadcrumb = desktopCrumbContent ? <span> in {desktopCrumbContent}</span> : null;
  const freeShipNoteDesktop = freeShipOnly ? <span className="ml-1 text-sm text-gray-600 dark:text-gray-300">with free shipping (excluding unknown)</span> : null;
  const includeExcludeInline = (() => {
    const parts = [];
    if (includedSellers?.length) parts.push(`Including: ${includedSellers.join(', ')}`);
    if (!favouritesOnly && excludedSellers?.length) parts.push(`Excluding: ${excludedSellers.join(', ')}`);
    if (parts.length === 0) return null;
    return <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({parts.join('; ')})</span>;
  })();
  const includeExcludeBlock = (() => {
    const parts = [];
    if (includedSellers?.length) parts.push(`Including: ${includedSellers.join(', ')}`);
    if (!favouritesOnly && excludedSellers?.length) parts.push(`Excluding: ${excludedSellers.join(', ')}`);
    if (parts.length === 0) return null;
    return <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">({parts.join('; ')})</div>;
  })();
  const sortLabels = { hotness: 'Hotness', endorsements: 'Endorsements', lastUpdated: 'Recently Updated', reviewsCount: 'Reviews Count', reviewsRating: 'Reviews Rating', name: 'Name', price: 'Price', arrival: 'Avg Arrival', firstSeen: 'First Seen' };
  const mobileSortSummary = (narrow ? `${sortLabels[sortKey] || sortKey} ${sortDir === 'asc' ? '↑' : '↓'}` : '');
  const baseLabel = loadingUi
    ? 'Loading items...'
    : favouritesOnly
      ? `Showing ${sorted.length} favourited item${sorted.length === 1 ? '' : 's'}`
      : `Showing ${sorted.length} items`;

  return (
    <div className="mx-auto max-w-auto p-4">
      <AnimatedLogoHeader
        rightSlot={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDisplayCurrency((c) => (c === 'GBP' ? 'USD' : 'GBP'))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm font-semibold shadow-sm bg-white/85 dark:bg-gray-900/85 backdrop-blur border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-white dark:hover:bg-gray-900"
              title={displayCurrency === 'GBP' ? 'Show USD' : 'Show GBP'}
            >
              <span>{displayCurrency === 'GBP' ? '£ GBP' : '$ USD'}</span>
            </button>
            <Basket />
          </div>
        )}
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
                  <span className="ml-1 text-sm text-gray-600 dark:text-gray-300">with free shipping (excluding unknown)</span>
                )}
              </div>
              {includeExcludeBlock}
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sort: {mobileSortSummary}</div>
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
      <InfoButton />
      <ItemDetailOverlay />
      <SellerOverlay />
      <SellerAnalyticsModal />
      <LatestReviewsModal />
    </div>
  );
}
