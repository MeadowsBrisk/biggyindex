import type { AxiosInstance } from 'axios';

export interface FetchSellerShareLinkOptions { client: AxiosInstance; html?: string; sellerId?: string | number; retry?: boolean; redact?: boolean; }

// Extract share link from seller HTML; fallback: request /core/api/createShareLink/p/{sellerId}
export async function fetchSellerShareLink({ client, html, sellerId, retry = true, redact = true }: FetchSellerShareLinkOptions) {
  let link: string | null = null;
  if (typeof html === 'string' && html.includes('share.link')) {
    const m = html.match(/https?:\/\/share\.link\/[A-Za-z0-9]+/);
    if (m) link = m[0];
  }
  if (!link && sellerId != null) {
    try {
      const url = `https://littlebiggy.net/core/api/createShareLink/p/${encodeURIComponent(String(sellerId))}`;
      const res = await client.get(url, { responseType: 'json' });
      const data = res?.data || {};
      const msg = (data as any).message || data;
      if (msg && typeof msg.link === 'string') link = msg.link;
    } catch (e: any) {
      if (retry) {
        try {
          const url2 = `https://www.littlebiggy.net/core/api/createShareLink/p/${encodeURIComponent(String(sellerId))}`;
          const res2 = await client.get(url2, { responseType: 'json' });
          const data2 = res2?.data || {};
          const msg2 = (data2 as any).message || data2;
          if (msg2 && typeof msg2.link === 'string') link = msg2.link;
        } catch {}
      }
    }
  }
  if (link && redact) {
    // Optionally redact key portion when logging
    const redacted = link.replace(/(share\.link\/)\w+/, '$1***');
    return { link, redacted };
  }
  return { link };
}
