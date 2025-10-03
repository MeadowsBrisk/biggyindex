export default async (request, context) => {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get('url');
  
  if (!imageUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    // Try to use cached response first
    const cacheKey = new Request(imageUrl);
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (!response) {
      // Fetch the image from the source
      response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        cf: {
          cacheTtl: 31536000,
          cacheEverything: true
        }
      });

      if (!response.ok) {
        return new Response('Failed to fetch image', { status: response.status });
      }

      // Clone response before caching
      const clonedResponse = response.clone();
      
      // Cache the response
      context.waitUntil(cache.put(cacheKey, clonedResponse));
    }

    // Forward the image with strong caching headers
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'CDN-Cache-Control': 'max-age=31536000',
        'Netlify-CDN-Cache-Control': 'public, max-age=31536000, durable',
      }
    });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
};

export const config = {
  path: '/api/image-proxy',
  cache: 'manual'
};
