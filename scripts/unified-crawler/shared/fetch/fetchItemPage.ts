import type { AxiosInstance } from 'axios';

export interface FetchItemPageOptions {
  client: AxiosInstance;
  refNum: string | number;
  shipsTo?: string; // market code (optional)
  timeout?: number;
  maxBytes?: number;
  earlyAbort?: boolean;
  earlyAbortMinBytes?: number;
  // Force disabling streaming fast-path (for second pass fallbacks)
  noStream?: boolean;
}

// Host fallback list
const HOSTS = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];

// Legacy item URL patterns (old crawler) + newer unified path. We will try them in order.
function buildCandidateUrls(host: string, refNum: string | number, shipsTo?: string): string[] {
  const id = encodeURIComponent(String(refNum));
  // Only legacy, confirmed working URL patterns retained.
  const variants: string[] = [
    `${host}/item/${id}/view/p`,   // legacy canonical path
    `${host}/item/${id}`,          // legacy short path
  ];
  const out: string[] = [];
  for (const base of variants) {
    if (shipsTo && !/shipsTo=/i.test(base)) {
      out.push(base + (base.includes('?') ? '&' : '?') + 'shipsTo=' + encodeURIComponent(String(shipsTo)));
    }
    out.push(base);
  }
  return out;
}

export async function fetchItemPage({ client, refNum, shipsTo, timeout = 20000, maxBytes = 250_000, earlyAbort = false, earlyAbortMinBytes = 8192, noStream = false }: FetchItemPageOptions): Promise<{ html: string; url: string; bytes: number; ms: number; truncated?: boolean; abortedEarly?: boolean }> {
  let lastErr: any = null;
  // Build ordered candidate URL list (hosts * variants)
  const candidates: string[] = [];
  for (const host of HOSTS) {
    for (const u of buildCandidateUrls(host, refNum, shipsTo)) candidates.push(u);
  }

  for (const url of candidates) {
    const t0 = Date.now();
    try {
      // First attempt: streaming fetch (unless disabled) for fast early-abort capture
      if (!noStream) {
        let html = '';
        let status: number | null = null;
        let truncated = false;
        let abortedEarly = false;
        const res = await client.get(url, { responseType: 'stream', timeout });
        status = res.status;
        const stream: NodeJS.ReadableStream = res.data;
        let bytes = 0; const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          const guard = setTimeout(() => { try { (stream as any)?.destroy?.(); } catch {}; reject(new Error('timeout')); }, Math.max(timeout + 3000, 5000));
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes <= maxBytes) chunks.push(chunk); else truncated = true;
            if (bytes > maxBytes) { try { (stream as any)?.destroy?.(); } catch {}; }
            if (earlyAbort && bytes >= earlyAbortMinBytes) {
              const preview = Buffer.concat(chunks).toString('utf8');
              // Legacy heuristics: need foldable shipping marker, share form token, and expected refNum
              const foldableMatches = preview.match(/foldable\s+Bp3/gi);
              const hasMultipleShipping = foldableMatches && foldableMatches.length >= 2; // Wait for at least 2 shipping options
              const hasShareToken = /name="contextRefNum"/i.test(preview);
              const hasExpectedRef = refNum ? new RegExp(String(refNum).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(preview) : true;
              // Only abort early if we have multiple shipping options OR we're confident we have the full shipping section
              const hasCompleteShipping = hasMultipleShipping || /ships\s+from.*?united\s+kingdom.*?foldable\s+Bp3.*?foldable\s+Bp3/i.test(preview.replace(/\n/g, ' '));
              if (hasCompleteShipping && hasShareToken && hasExpectedRef) {
                abortedEarly = true;
                truncated = true; // mark truncated even though early-aborted (matches legacy)
                try { (stream as any)?.destroy?.(); } catch {};
              }
            }
          });
          stream.on('end', () => { clearTimeout(guard); resolve(); });
          stream.on('close', () => { clearTimeout(guard); resolve(); });
          stream.on('error', (e: any) => {
            clearTimeout(guard);
            // Treat errors triggered by our own early abort as success
            if (abortedEarly) resolve(); else reject(e);
          });
        });
        html = Buffer.concat(chunks).toString('utf8');
        const ms = Date.now() - t0;
        // If early-aborted but HTML missing description marker, fallback to full fetch immediately
        if (abortedEarly && !/item-description/i.test(html)) {
          // Retry same URL without streaming/early abort
          return await fetchItemPage({ client, refNum, shipsTo, timeout, maxBytes, earlyAbort: false, earlyAbortMinBytes, noStream: true });
        }
        return { html, url, bytes, ms, truncated, abortedEarly };
      }
      // Fallback full fetch (text)
      const res = await client.get(url, { responseType: 'text', timeout });
      const html = typeof res.data === 'string' ? res.data : (res.data && res.data.toString ? res.data.toString() : '');
      const bytes = html.length;
      const ms = Date.now() - t0;
      return { html, url, bytes, ms, truncated: false, abortedEarly: false };
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      // Stop trying alternative URL patterns for explicit not-found or forbidden
      if (status === 404 || status === 403) break;
      // Continue to next candidate otherwise
    }
  }
  throw lastErr || new Error('Failed to fetch item page');
}
