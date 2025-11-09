import type { AxiosInstance } from 'axios';

export interface FetchSellerReviewsOptions {
  client: AxiosInstance;
  sellerId: string | number;
  pageSize?: number;
  maxStore?: number;
  retries?: number;
}

async function fetchUserReviewsPage({ client, sellerId, offset = 0, pageSize = 100 }: { client: AxiosInstance; sellerId: string | number; offset?: number; pageSize?: number; }) {
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  let lastErr: any = null;
  for (const host of hosts) {
    const url = `${host}/core/api/reviews/user/${encodeURIComponent(String(sellerId))}/received?first=${offset}&n=${pageSize}&requireMedia=false`;
    const t0 = Date.now();
    try {
      const res = await client.get(url, { responseType: 'json' });
      const ms = Date.now() - t0;
      const data = res.data || {};
      const message: any = data.message || {};
      return {
        reviews: Array.isArray(message.reviews) ? message.reviews : [],
        first: message.first || offset,
        n: message.n || pageSize,
        raw: data,
        url,
        ms,
      };
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      if (!(status >= 500 || !status)) break; // do not try alternate host on non-retryable errors
    }
  }
  throw lastErr || new Error('Failed to fetch user received reviews');
}

export async function fetchSellerReviewsPaged({ client, sellerId, pageSize = 100, maxStore = 300, retries = 3 }: FetchSellerReviewsOptions) {
  const reviews: any[] = [];
  let offset = 0;
  let totalFetched = 0;
  const pagesMeta: any[] = [];
  while (reviews.length < maxStore) {
    let lastErr: any = null;
    let page: any = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const t0 = Date.now();
        page = await fetchUserReviewsPage({ client, sellerId, offset, pageSize });
        break;
      } catch (e: any) {
        lastErr = e;
        if (attempt < retries) await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
    if (!page) throw lastErr || new Error('seller reviews fetch failed');
    const got = page.reviews.length;
    totalFetched += got;
    const hasItem = page.reviews.some((r: any) => r && r.item && (r.item.refNum || r.item.id || r.item.name));
    pagesMeta.push({ url: page.url, count: got, hasItem });
    if (!got) break;
    for (const r of page.reviews) {
      reviews.push(r);
      if (reviews.length >= maxStore) break;
    }
    if (got < pageSize) break; // exhausted
    offset += got;
  }
  return { reviews, sourceFetched: totalFetched, meta: { fetched: reviews.length, sourceFetched: totalFetched, pageSizeRequested: pageSize, mode: 'paged', pages: pagesMeta } };
}
