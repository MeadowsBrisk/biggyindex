import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { runtime: 'nodejs' };

interface ErrorBody { error: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<ErrorBody | Buffer>) {
  const rawUrl = (req.query as any).url;
  const url: string | null = typeof rawUrl === 'string' ? rawUrl : null;
  if (!url) {
    res.status(400).json({ error: 'Missing url' });
    return;
  }
  try {
    // Basic allowlist for protocols to mitigate SSRF and ensure proper handling
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error('Invalid protocol');
    } catch {
      res.status(400).json({ error: 'Invalid url' });
      return;
    }

    const upstream = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (compatible; LittleBot/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
        'Referer': req.headers['referer'] || new URL(url).origin,
      },
    });
    if (!upstream.ok) {
      res.status(502).json({ error: 'Upstream error' });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/gif');
    // Disable CDN caching to avoid serving the same image across different URLs and enable CORS for canvas usage
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Proxy failed' });
  }
}
