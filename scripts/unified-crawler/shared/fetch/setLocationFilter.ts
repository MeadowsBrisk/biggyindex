import type { AxiosInstance } from 'axios';

export interface SetLocationFilterOptions { client: AxiosInstance; shipsTo: string; tokens?: { _sourcePage?: string; __fp?: string } }

export async function setLocationFilter({ client, shipsTo, tokens = {} }: SetLocationFilterOptions): Promise<{ ok: boolean; attempted: boolean; status?: number; error?: string }> {
  if (!client || !shipsTo) return { ok: false, attempted: false };
  try {
    const boundary = '----crawlerBoundary' + Date.now();
    const parts: string[] = [];
    const addField = (name: string, value: string | undefined) => {
      if (value == null) return;
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    };
    addField('shipsTo', shipsTo);
    addField('_sourcePage', tokens._sourcePage);
    addField('__fp', tokens.__fp);
    parts.push(`--${boundary}--\r\n`);
    const body = parts.join('');
    const url = 'https://littlebiggy.net/setLocationFilter';
    const res = await client.post(url, body, {
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      timeout: 15000,
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const status = res.status;
    if (status >= 200 && status < 300) {
      return { ok: true, attempted: true, status };
    }
    return { ok: false, attempted: true, status };
  } catch (e: any) {
    return { ok: false, attempted: true, error: e?.message || String(e) };
  }
}