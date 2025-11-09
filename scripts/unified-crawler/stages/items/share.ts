import type { AxiosInstance } from "axios";
import { fetchItemShareLink as fetchItemShareLinkHttp } from "../../shared/fetch/fetchItemShareLink";

export interface ShareResult {
  ok: boolean;
  refNum: string;
  link?: string | null;
  source?: string;
  error?: string;
}

export async function fetchItemShareLink(
  client: AxiosInstance,
  jar: any,
  refNum: string,
  opts: { html?: string } = {}
): Promise<ShareResult> {
  try {
    const res = await fetchItemShareLinkHttp({ client, jar, refNum, html: opts.html, timeout: 20000, retry: true });
    if (res && res.link) {
      return { ok: true, refNum, link: res.link, source: res.source };
    }
    return { ok: false, refNum, link: null, source: res?.source, error: res?.error || 'no_link' };
  } catch (e: any) {
    return { ok: false, refNum, link: null, error: e?.message || String(e) };
  }
}
