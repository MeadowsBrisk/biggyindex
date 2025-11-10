import type { AxiosInstance } from 'axios';
import { parseShareForm } from '../parse/parseShareForm';
import { fetchItemPage } from './fetchItemPage';

// Fetches a share link for a given item by submitting the share form.
// Returns { link, source, error? }
// source: http | http-retry | none
export async function fetchItemShareLink({ client, jar, refNum, html, timeout = 20000, retry = true }: { client: AxiosInstance; jar?: any; refNum: string | number; html?: string; timeout?: number; retry?: boolean }): Promise<{ link: string | null; source: string; error?: string }> {
  if (!client || !refNum) return { link: null, source: 'none', error: 'missing_client_or_ref' };

  let workingHtml = html;
  if (!workingHtml) {
    try {
      const page = await fetchItemPage({ client, refNum, timeout: Math.min(15000, timeout) });
      workingHtml = page.html;
    } catch {}
  }
  if (!workingHtml) return { link: null, source: 'none', error: 'no_html' };

  const form = parseShareForm(workingHtml);
  if (!form) return { link: null, source: 'none', error: 'share_form_not_found' };

  const boundary = '----itemShare' + Math.random().toString(16).slice(2);
  const parts: string[] = [];
  const add = (n: string, v?: string) => {
    if (v != null) parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`);
  };
  if (form.contextRefNum) add('contextRefNum', form.contextRefNum);
  if (form.contextId) add('contextId', form.contextId);
  if (form._sourcePage) add('_sourcePage', form._sourcePage);
  if (form.__fp) add('__fp', form.__fp);
  add('contextType', form.contextType || (form.contextId ? 'SUBJECT' : 'ITEM'));
  parts.push(`--${boundary}--\r\n`);
  const body = parts.join('');

  const headers: Record<string, string> = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
  // Optional cookie header extraction if jar provided
  if (jar) {
    try {
      const cookies: any[] = await new Promise((resolve) => {
        jar.getCookies('https://littlebiggy.net/item/share', (err: any, cookies: any[]) => resolve(err ? [] : cookies));
      });
      if (cookies && cookies.length > 0) {
        headers['Cookie'] = cookies.map((c: any) => `${c.key}=${c.value}`).join('; ');
      }
    } catch {}
  }

  const hosts = ['https://littlebiggy.net', 'https://www.littlebiggy.net'];
  let lastErr: any = null;
  let link: string | null = null;

  for (const host of hosts) {
    const url = `${host}/item/share`;
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
      if (!link && locationHeader && /\/link\//.test(locationHeader)) link = locationHeader.startsWith('http') ? locationHeader : host + locationHeader;
      if (!link && typeof data === 'string') {
        const m = data.match(/https?:\/\/[^\s"']+\/link\/[A-Za-z0-9]+/);
        if (m) link = m[0];
      }
      if (link) return { link, source: 'http' };
      lastErr = new Error('no_link_in_response');
    } catch (e: any) {
      lastErr = e;
    }
  }

  if (retry) {
    try {
      const res = await client.post(`${hosts[0]}/item/share`, body, {
        headers,
        maxRedirects: 0,
        validateStatus: () => true,
        responseType: 'text',
        timeout,
      });
      const locationHeader = res.headers?.location || res.headers?.Location;
      const data = res.data;
      if (data && typeof data === 'object') link = (data as any).link || link;
      if (!link && locationHeader && /\/link\//.test(locationHeader)) link = locationHeader.startsWith('http') ? locationHeader : hosts[0] + locationHeader;
      if (!link && typeof data === 'string') {
        const m = data.match(/https?:\/\/[^\s"']+\/link\/[A-Za-z0-9]+/);
        if (m) link = m[0];
      }
      if (link) return { link, source: 'http-retry' };
    } catch {}
  }

  const error = (lastErr && (lastErr.message || lastErr.code)) || 'no_link_in_response';
  return { link: null, source: 'none', error };
}