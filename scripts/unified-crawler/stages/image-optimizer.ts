/**
 * Image Optimizer Stage
 * 
 * Converts item images to optimized AVIF format and uploads to Cloudflare R2.
 * This replaces Cloudinary's fetch API with a pre-processed approach.
 * 
 * Benefits:
 * - Free: R2 has generous free tier (10GB, 10M reads/month, no egress fees)
 * - Fast: Images are pre-optimized, not transformed on-the-fly
 * - Reliable: No third-party rate limits or account issues
 * 
 * Prerequisites:
 * - npm install sharp @aws-sdk/client-s3
 * - Set environment variables:
 *   - R2_ACCOUNT_ID (from Cloudflare dashboard)
 *   - R2_ACCESS_KEY_ID (R2 API token)
 *   - R2_SECRET_ACCESS_KEY (R2 API token secret)
 *   - R2_BUCKET_NAME (e.g., 'biggyindex-images')
 *   - R2_PUBLIC_URL (e.g., 'https://images.biggyindex.com' or R2 public bucket URL)
 */

import sharp from 'sharp';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';

// Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'biggyindex-images';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

// Sizes to generate (responsive images)
const SIZES = [400, 800, 1200] as const;

// Initialize R2 client (S3-compatible API)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a stable hash for an image URL (for cache key)
 * Uses FNV-1a hash - must match the client-side implementation in src/lib/ui/images.ts
 */
function hashUrl(url: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  // Convert to hex, ensure positive, pad to 8 chars
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Check if an image already exists in R2
 */
async function imageExists(key: string): Promise<boolean> {
  try {
    await r2Client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Download an image from a URL
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BiggyIndex/1.0)',
      },
      timeout: 15000,
    });
    if (!response.ok) return null;
    const buffer = await response.buffer();
    return buffer;
  } catch (err) {
    console.error(`Failed to download ${url}:`, err);
    return null;
  }
}

/**
 * Optimize an image to AVIF format at a specific width
 */
async function optimizeImage(
  buffer: Buffer, 
  width: number
): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, undefined, { 
      fit: 'inside', 
      withoutEnlargement: true 
    })
    .avif({ 
      quality: 75, 
      effort: 4 // Balance between speed and compression
    })
    .toBuffer();
}

/**
 * Upload an image to R2
 */
async function uploadToR2(key: string, buffer: Buffer): Promise<string> {
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'image/avif',
    CacheControl: 'public, max-age=31536000, immutable', // 1 year cache
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Process a single image: download, optimize to multiple sizes, upload to R2
 * Returns a map of size -> URL
 */
export async function processImage(
  sourceUrl: string,
  options: { force?: boolean } = {}
): Promise<Record<number, string> | null> {
  if (!sourceUrl || typeof sourceUrl !== 'string') return null;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.warn('R2 credentials not configured, skipping image optimization');
    return null;
  }

  const hash = hashUrl(sourceUrl);
  const results: Record<number, string> = {};

  // Check if already processed (check smallest size as proxy for all)
  const smallestKey = `images/${hash}-${SIZES[0]}.avif`;
  if (!options.force && await imageExists(smallestKey)) {
    // Return cached URLs
    for (const size of SIZES) {
      results[size] = `${R2_PUBLIC_URL}/images/${hash}-${size}.avif`;
    }
    return results;
  }

  // Download source image
  const buffer = await downloadImage(sourceUrl);
  if (!buffer) return null;

  // Process and upload each size
  for (const size of SIZES) {
    try {
      const optimized = await optimizeImage(buffer, size);
      const key = `images/${hash}-${size}.avif`;
      const url = await uploadToR2(key, optimized);
      results[size] = url;
    } catch (err) {
      console.error(`Failed to process ${sourceUrl} at ${size}px:`, err);
    }
  }

  return Object.keys(results).length > 0 ? results : null;
}

/**
 * Batch process multiple images with concurrency control
 */
export async function processImages(
  urls: string[],
  options: { concurrency?: number; force?: boolean } = {}
): Promise<Map<string, Record<number, string> | null>> {
  const { concurrency = 5, force = false } = options;
  const results = new Map<string, Record<number, string> | null>();
  
  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(url => processImage(url, { force }))
    );
    batch.forEach((url, idx) => results.set(url, batchResults[idx]));
    
    // Progress log
    if ((i + concurrency) % 50 === 0 || i + concurrency >= urls.length) {
      console.log(`Processed ${Math.min(i + concurrency, urls.length)}/${urls.length} images`);
    }
  }

  return results;
}

/**
 * Get the optimized URL for a source image
 * Used by the frontend to resolve image URLs
 */
export function getOptimizedUrl(sourceUrl: string, width: number = 800): string {
  if (!R2_PUBLIC_URL) return sourceUrl;
  
  const hash = hashUrl(sourceUrl);
  // Find closest size
  const size = SIZES.find(s => s >= width) || SIZES[SIZES.length - 1];
  return `${R2_PUBLIC_URL}/images/${hash}-${size}.avif`;
}

// CLI entry point
if (require.main === module) {
  const testUrl = process.argv[2];
  if (!testUrl) {
    console.log('Usage: npx ts-node image-optimizer.ts <image-url>');
    console.log('\nEnvironment variables required:');
    console.log('  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL');
    process.exit(1);
  }
  
  processImage(testUrl, { force: true })
    .then(result => {
      if (result) {
        console.log('Optimized URLs:', result);
      } else {
        console.log('Failed to process image');
      }
    })
    .catch(console.error);
}
