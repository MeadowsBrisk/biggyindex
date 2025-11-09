// Cloudflare Worker for Image Proxying
// Deploy this at workers.cloudflare.com
// Routes (add all that apply):
//  - biggyindex.com/cf-image-proxy*
//  - *.biggyindex.com/cf-image-proxy*
//  - lbindex.vip/cf-image-proxy*            (legacy)
//  - *.lbindex.vip/cf-image-proxy*          (staging/legacy)
// If using a single apex for the proxy from all subdomains, configure the frontend env
// NEXT_PUBLIC_CF_IMAGE_PROXY_BASE=https://biggyindex.com and route only the apex.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const imageUrl = url.searchParams.get('url');
    
    if (!imageUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }

    // Validate URL
    let targetUrl;
    try {
      targetUrl = new URL(imageUrl);
      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        return new Response('Invalid protocol', { status: 400 });
      }
    } catch {
      return new Response('Invalid URL', { status: 400 });
    }

  // Check cache first
    const cache = caches.default;
    const cacheKey = new Request(imageUrl, request);
    let response = await cache.match(cacheKey);

    if (!response) {
      // Fetch from origin
      response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        },
        cf: {
          cacheTtl: 31536000, // 1 year
          cacheEverything: true,
          polish: 'off', // Don't compress, serve as-is
        }
      });

      if (!response.ok) {
        return new Response(`Failed to fetch: ${response.status}`, { status: response.status });
      }

      // Clone and cache
      response = new Response(response.body, response);
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      response.headers.set('Access-Control-Allow-Origin', '*');
      
      // Store in cache
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  }
};
