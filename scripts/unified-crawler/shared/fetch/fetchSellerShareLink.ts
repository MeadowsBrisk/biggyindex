import type { AxiosInstance } from 'axios';
import { parseShareForm } from '../parse/parseShareForm';

export interface FetchSellerShareLinkOptions {
  client: AxiosInstance;
  jar?: any;
  html?: string;
  sellerId?: string | number;
  retry?: boolean;
  redact?: boolean;
  timeout?: number;
}

interface ShareResult {
  link: string | null;
  redacted?: string;
  source?: string;
  error?: string;
}

// Submit the seller share form (same endpoint as items) and fall back to createShareLink API if needed.
export async function fetchSellerShareLink({ client, jar, html, sellerId, retry = true, redact = true, timeout = 20000 }: FetchSellerShareLinkOptions): Promise<ShareResult> {
  let workingHtml = html || '';
  let link: string | null = null;
  let source: string | undefined;
  let lastErr: any = null;

  if (workingHtml && workingHtml.includes('share.link')) {
    const m = workingHtml.match(/https?:\/\/share\.link\/[A-Za-z0-9]+/);
    if (m) {
      link = m[0];
      source = 'html';
    }
  }

  const formTokens = link ? null : parseShareForm(workingHtml);
  if (!link && formTokens) {
    let actionUrl: string | null = null;
    try {
      const formMatch = workingHtml.match(/<form[^>]*class=["'][^"']*shareForm[^"']*["'][^>]*action=["']([^"']+)["'][^>]*>/i);
      if (formMatch) actionUrl = formMatch[1];
    } catch {}

    const boundary = '----sellerShare' + Math.random().toString(16).slice(2);
    const parts: string[] = [];
    const add = (name: string, value?: string) => {
      if (value != null) parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    };
    add('contextRefNum', formTokens.contextRefNum);
    add('contextId', formTokens.contextId);
    add('_sourcePage', formTokens._sourcePage);
    add('__fp', formTokens.__fp);
    add('contextType', formTokens.contextType || (formTokens.contextId ? 'SUBJECT' : 'ITEM'));
    parts.push(`--${boundary}--\r\n`);
    const body = parts.join('');

    const headers: Record<string, string> = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
    if (jar) {
      try {
        const cookieList: any[] = await new Promise((resolve) => {
          jar.getCookies('https://littlebiggy.net/item/share', (err: any, cookies: any[]) => resolve(err ? [] : cookies));
        });
        if (cookieList && cookieList.length) {
          headers.Cookie = cookieList.map((c: any) => `${c.key}=${c.value}`).join('; ');
        }
      } catch {}
    }

    const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
    for (const host of hosts) {
      const url = actionUrl ? (actionUrl.startsWith('http') ? actionUrl : host + actionUrl) : `${host}/item/share`;
      try {
        const res = await client.post(url, body, {
          headers,
          maxRedirects: 0,
          validateStatus: () => true,
          responseType: 'text',
          timeout,
        });
        const locationHeader = res.headers?.location || res.headers?.Location;
        const data = res.data;
        if (data && typeof data === 'object') link = (data as any).link || link;
        if (!link && locationHeader && /\/link\//.test(locationHeader)) {
          link = locationHeader.startsWith('http') ? locationHeader : host + locationHeader;
        }
        if (!link && typeof data === 'string') {
          const m = data.match(/https?:\/\/[^\s"']+\/link\/[A-Za-z0-9]+/);
          if (m) link = m[0];
        }
        if (link) {
          source = source || 'http';
          break;
        }
        lastErr = new Error('no_link_in_response');
      } catch (err: any) {
        lastErr = err;
      }
    }

    if (!link && retry) {
      try {
        const fallbackUrl = actionUrl && !actionUrl.startsWith('http') ? `https://littlebiggy.net${actionUrl}` : 'https://littlebiggy.net/item/share';
        const res = await client.post(fallbackUrl, body, {
          headers,
          maxRedirects: 0,
          validateStatus: () => true,
          responseType: 'text',
          timeout,
        });
        const locationHeader = res.headers?.location || res.headers?.Location;
        const data = res.data;
        if (data && typeof data === 'object') link = (data as any).link || link;
        if (!link && locationHeader && /\/link\//.test(locationHeader)) {
          link = locationHeader.startsWith('http') ? locationHeader : `https://littlebiggy.net${locationHeader}`;
        }
        if (!link && typeof data === 'string') {
          const m = data.match(/https?:\/\/[^\s"']+\/link\/[A-Za-z0-9]+/);
          if (m) link = m[0];
        }
        if (link) source = source || 'http-retry';
      } catch (err) {
        lastErr = err;
      }
    }
  }

  if (!link && sellerId != null) {
    const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
    for (const host of hosts) {
      try {
        const res = await client.get(`${host}/core/api/createShareLink/p/${encodeURIComponent(String(sellerId))}`, { responseType: 'json', timeout });
        const data = res?.data || {};
        const msg = (data as any).message || data;
        if (msg && typeof msg.link === 'string') {
          link = msg.link;
          source = 'api';
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }
  }

  if (link && redact) {
    const redacted = link.replace(/(share\.link\/)\w+/, '$1***');
    return { link, redacted, source };
  }

  return { link, source, error: link ? undefined : (lastErr && (lastErr.message || lastErr.code)) || 'share_link_unavailable' };
}
