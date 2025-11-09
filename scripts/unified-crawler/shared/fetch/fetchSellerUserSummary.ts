import type { AxiosInstance } from 'axios';

export interface FetchSellerUserSummaryOptions { client: AxiosInstance; sellerId: string | number; }

export async function fetchSellerUserSummary({ client, sellerId }: FetchSellerUserSummaryOptions) {
  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  let lastErr: any = null;
  for (const host of hosts) {
    const url = `${host}/core/api/getUserSummary/p/${encodeURIComponent(String(sellerId))}`;
    try {
      const res = await client.get(url, { responseType: 'json' });
      const data = res?.data || {};
      const msg = (data as any).message || data;
      // Legacy shape: { summary: {...}, statistics: {...} }
      const summary = (msg as any).summary || (msg as any).userSummary || null;
      const statistics = (msg as any).statistics || (msg as any).stats || null;
      return { summary, statistics, raw: data, url };
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      if (!(status >= 500 || !status)) break;
    }
  }
  throw lastErr || new Error('Failed to fetch seller user summary');
}
