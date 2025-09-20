export default async function handler(req, res) {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
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

    const r = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        // Some hosts serve placeholders when UA/Referer are missing; send generic browser-like headers.
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (compatible; LittleBot/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
        'Referer': req.headers['referer'] || new URL(url).origin,
      },
    });
    if (!r.ok) {
      res.status(502).json({ error: 'Upstream error' });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/gif');
    // Disable CDN caching to avoid serving the same image across different URLs (Netlify/Vercel)
    // and enable CORS so canvas operations are not tainted in the client.
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


