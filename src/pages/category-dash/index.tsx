import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function CategoryDashIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/category-dash/overrides');
  }, [router]);

  return null;
}
