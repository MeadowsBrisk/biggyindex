import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Home, { getStaticProps } from '../index';
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom } from '@/store/atoms';

export { getStaticProps };

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' };
}

export default function SellerIdPage() {
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

  return <Home />;
}
