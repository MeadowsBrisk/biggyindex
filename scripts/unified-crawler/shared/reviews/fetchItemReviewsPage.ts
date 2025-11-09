import type { AxiosInstance } from 'axios';

export interface FetchItemReviewsOptions { client: AxiosInstance; refNum: string | number; offset?: number; pageSize?: number; logSnippet?: boolean; }

export async function fetchReviewsPage({ client, refNum, offset = 0, pageSize = 100, logSnippet = false }: FetchItemReviewsOptions) {
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  let lastErr: any = null;
  for (const host of hosts) {
    const url = `${host}/core/api/reviews/item/${encodeURIComponent(String(refNum))}?first=${offset}&n=${pageSize}&requireMedia=false`;
    const t0 = Date.now();
    try {
      const res = await client.get(url, { responseType: 'json' });
      const ms = Date.now() - t0;
      const data = res.data || {};
      const message: any = data.message || {};
      const out = {
        item: message.item || null,
        reviews: Array.isArray(message.reviews) ? message.reviews : [],
        first: message.first || offset,
        n: message.n || pageSize,
        raw: data,
        url,
        ms,
      };
      return out;
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      if (!(status >= 500 || !status)) {
        break; // do not try alternate host for 4xx
      }
    }
  }
  throw lastErr || new Error('Failed to fetch reviews after host fallback');
}
