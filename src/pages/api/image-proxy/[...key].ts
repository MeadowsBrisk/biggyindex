import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const segs = req.query.key;
  const key = Array.isArray(segs) ? segs.join('/') : (typeof segs === 'string' ? segs : '');
  if (!key) {
    res.status(400).json({ error: 'Missing key' });
    return;
  }
  // Decode base64url into the original URL string
  let urlStr = '';
  try {
    const b64 = key.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const buf = Buffer.from(b64 + pad, 'base64');
    urlStr = buf.toString('utf8');
  } catch {
    res.status(400).json({ error: 'Invalid key' });
    return;
  }

  try {
    const parsed = new URL(urlStr);
    if (!/^https?:$/.test(parsed.protocol)) {
      res.status(400).json({ error: 'Invalid protocol' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid url' });
    return;
  }

  try {
    const r = await fetch(urlStr, {
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        'User-Agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 (compatible; LittleBot/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
        'Referer': (req.headers['referer'] as string) || new URL(urlStr).origin,
      },
    });
    if (!r.ok) {
      res.status(502).json({ error: 'Upstream error' });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    // Disable CDN caching entirely and enable CORS for canvas safety
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Proxy-Origin', new URL(urlStr).origin);
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Proxy failed' });
  }
}
