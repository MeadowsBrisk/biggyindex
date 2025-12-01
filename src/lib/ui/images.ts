// Image-related utilities

// Cloudinary cloud name
const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD || 'YOUR_CLOUD_NAME';
const USE_CLOUDINARY = CLOUDINARY_CLOUD !== 'YOUR_CLOUD_NAME';

// Cloudinary fetch URL builder with responsive sizing
// - f_avif: force AVIF format for best compression
// - q_auto: automatic quality optimization
// - w_X: resize to specified width
// - c_limit: only downscale, never upscale
function cloudinaryFetch(url: string, width?: number): string {
  const transforms = width 
    ? `f_avif,q_auto,w_${width},c_limit`
    : 'f_avif,q_auto';
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${transforms}/${encodeURIComponent(url)}`;
}

/**
 * Proxy image URLs via Cloudinary for optimization.
 * - Skips local paths (/, ./)
 * - Skips already-proxied URLs
 * - Returns original if Cloudinary not configured
 */
export function proxyImage(url: string, width?: number): string {
  if (!url || typeof url !== 'string') return url as any;
  
  // Skip local paths
  if (url.startsWith('/') || url.startsWith('./')) return url;
  
  // Skip already proxied URLs
  if (url.includes('res.cloudinary.com/')) return url;
  
  // Use Cloudinary if configured
  if (USE_CLOUDINARY) {
    return cloudinaryFetch(url, width);
  }
  
  // Not configured - return original
  return url;
}

