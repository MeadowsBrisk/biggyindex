import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Home, { getStaticProps } from '../index';
import { useSetAtom } from 'jotai';
import { expandedRefNumAtom } from '@/store/atoms';

export { getStaticProps };

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' };
}

export default function ItemRefPage() {
  const router = useRouter();
  const setExpanded = useSetAtom(expandedRefNumAtom);
  const ref = typeof router.query.ref === 'string' ? router.query.ref : null;

  useEffect(() => {
    if (!router.isReady) return;
    setExpanded(ref || null);
  }, [router.isReady, ref, setExpanded]);

  return <Home />;
}
