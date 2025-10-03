export default async (request, context) => {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get('url');
  
  if (!imageUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Validate URL
  try {
    new URL(imageUrl);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  try {
    // Fetch the image from the source
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return new Response(`Failed to fetch image: ${response.status} ${response.statusText}`, { status: response.status });
    }

    // Forward the image with strong caching headers
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
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
