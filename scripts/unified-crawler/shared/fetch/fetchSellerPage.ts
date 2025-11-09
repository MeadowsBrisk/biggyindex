import type { AxiosInstance } from 'axios';
import axios from 'axios';

export interface FetchSellerPageOptions {
  client: AxiosInstance;
  sellerId: string | number;
  timeout: number;
  maxBytes: number;
  earlyAbort?: boolean;
  earlyAbortMinBytes?: number;
}

const HOSTS = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];

export async function fetchSellerPage({ client, sellerId, timeout, maxBytes, earlyAbort = false, earlyAbortMinBytes = 8192 }: FetchSellerPageOptions): Promise<{ html: string; url: string; bytes: number; ms: number }> {
  let lastErr: any = null;
  for (const host of HOSTS) {
    const url = `${host}/viewSubject/p/${encodeURIComponent(String(sellerId))}`;
    const t0 = Date.now();
    try {
      // Prefer streaming to enforce maxBytes and early abort
      const res = await client.get(url, { responseType: 'stream', timeout });
      const stream: NodeJS.ReadableStream = res.data;
      let bytes = 0;
      let buf: Buffer[] = [];
      let aborted = false;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { aborted = true; try { (res.request as any)?.destroy?.(); } catch {} reject(new Error('timeout')); }, Math.max(1000, timeout + 2000));
        stream.on('data', (chunk: Buffer) => {
          if (aborted) return;
          bytes += chunk.length;
          if (bytes <= maxBytes) buf.push(chunk);
          if (bytes > maxBytes) { aborted = true; try { (res.request as any)?.destroy?.(); } catch {}; }
          if (!aborted && earlyAbort && bytes >= earlyAbortMinBytes) {
            // Heuristic early-abort: look for small marker to confirm it's likely the seller page
            const preview = Buffer.concat(buf).toString('utf8');
            if (/seller-profile|reginald|Bp1|Bp3/i.test(preview)) {
              aborted = true; try { (res.request as any)?.destroy?.(); } catch {};
            }
          }
        });
        stream.on('end', () => { clearTimeout(timer); resolve(); });
        stream.on('error', (e) => { clearTimeout(timer); reject(e); });
      });
      const html = Buffer.concat(buf).toString('utf8');
      const ms = Date.now() - t0;
      return { html, url, bytes, ms };
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      if (!(status >= 500 || !status)) {
        break; // don't try second host for 4xx
      }
    }
  }
  throw lastErr || new Error('Failed to fetch seller page');
}
