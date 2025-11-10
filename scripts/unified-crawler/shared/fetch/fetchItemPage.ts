import type { AxiosInstance } from 'axios';

export interface FetchItemPageOptions {
  client: AxiosInstance;
  refNum: string | number;
  shipsTo?: string; // market code (optional)
  timeout?: number;
  maxBytes?: number;
  earlyAbort?: boolean;
  earlyAbortMinBytes?: number;
}

// Host fallback list
const HOSTS = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];

export async function fetchItemPage({ client, refNum, shipsTo, timeout = 20000, maxBytes = 250_000, earlyAbort = false, earlyAbortMinBytes = 8192 }: FetchItemPageOptions): Promise<{ html: string; url: string; bytes: number; ms: number; truncated?: boolean }> {
  let lastErr: any = null;
  for (const host of HOSTS) {
    // Add shipsTo query param if provided
    const base = `${host}/viewSubject/i/${encodeURIComponent(String(refNum))}`;
    const url = shipsTo ? `${base}?shipsTo=${encodeURIComponent(String(shipsTo))}` : base;
    const t0 = Date.now();
    try {
      const res = await client.get(url, { responseType: 'stream', timeout });
      const stream: NodeJS.ReadableStream = res.data;
      let bytes = 0;
      const chunks: Buffer[] = [];
      let aborted = false;
      let truncated = false;
      await new Promise<void>((resolve, reject) => {
        const guard = setTimeout(() => { aborted = true; try { (res.request as any)?.destroy?.(); } catch {}; reject(new Error('timeout')); }, Math.max(timeout + 3000, 5000));
        stream.on('data', (chunk: Buffer) => {
          if (aborted) return;
          bytes += chunk.length;
          if (bytes <= maxBytes) chunks.push(chunk); else truncated = true;
          if (bytes > maxBytes) { aborted = true; try { (res.request as any)?.destroy?.(); } catch {}; }
          if (!aborted && earlyAbort && bytes >= earlyAbortMinBytes) {
            // Heuristic: look for item detail marker to stop early
            const preview = Buffer.concat(chunks).toString('utf8');
            if (/subject-header|ships-to|rating-count|review-count|item-description/i.test(preview)) {
              aborted = true; try { (res.request as any)?.destroy?.(); } catch {};
            }
          }
        });
        stream.on('end', () => { clearTimeout(guard); resolve(); });
        stream.on('error', (e) => { clearTimeout(guard); reject(e); });
      });
      const html = Buffer.concat(chunks).toString('utf8');
      const ms = Date.now() - t0;
      return { html, url, bytes, ms, truncated };
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      if (!(status >= 500 || !status)) break; // don't host-fallback for 4xx
    }
  }
  throw lastErr || new Error('Failed to fetch item page');
}
