/**
 * Unified Image Optimizer Stage
 * 
 * Handles both static images AND animated GIFs:
 * - Static (jpg/png/webp): Convert to AVIF at 600px + full size
 * - Animated GIFs: Extract poster (AVIF) + convert to animated WebP
 * 
 * All assets stored in Cloudflare R2 (free tier: 10GB, 10M reads/month).
 * 
 * Unified folder structure (no gif-map needed!):
 *   {hash}/thumb.avif   - 600px thumbnail (ALL images)
 *   {hash}/full.avif    - Original size (static only)
 *   {hash}/anim.webp    - Animated version (GIFs only)
 * 
 * Frontend GIF detection: HEAD request for anim.webp
 *   - 200: it's a GIF, load animation
 *   - 404: it's static, load full.avif
 */

import sharp from 'sharp';
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import type { BlobClient } from '../../shared/persistence/blobs';
import { log } from '../../shared/logging/logger';
import {
  checkBudget,
  wouldExceedBudget,
  recordUsage,
  recordError,
  formatBudgetStatus,
  getRemainingCapacity,
} from './budget';

// ============================================================================
// Configuration
// ============================================================================

export const getR2Config = () => ({
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucketName: process.env.R2_BUCKET_NAME || 'biggyindex-images',
  publicUrl: process.env.R2_PUBLIC_URL || '',
});

// Image sizes
const THUMB_SIZE = 600;  // Cards, thumbnails (2x retina for 300px display)
const QUALITY_THUMB = 75;
const QUALITY_FULL = 90;  // Higher quality for zoom (AVIF still very efficient)
const QUALITY_ANIM_WEBP = 75;

// Concurrency limits
const CONCURRENT_DOWNLOADS = 10;

// GIF detection
const GIF_REGEX = /\.gif(?:$|[?#])/i;
const isGifUrl = (url: string) => GIF_REGEX.test(url);

// ============================================================================
// R2 Client
// ============================================================================

export function createR2Client(): S3Client {
  const config = getR2Config();
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

// ============================================================================
// Hash Function (must match frontend: src/lib/ui/images.ts)
// ============================================================================

import { hashUrl } from '../../shared/hash';
export { hashUrl };

// ============================================================================
// R2 Helpers
// ============================================================================

async function objectExists(r2Client: S3Client, key: string): Promise<boolean> {
  try {
    await r2Client.send(new HeadObjectCommand({
      Bucket: getR2Config().bucketName,
      Key: key,
    }));
    return true;
  } catch {
    return false;
  }
}

async function uploadToR2(
  r2Client: S3Client,
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<{ url: string; size: number }> {
  const config = getR2Config();
  await r2Client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return {
    url: `${config.publicUrl}/${key}`,
    size: buffer.length,
  };
}

// ============================================================================
// Download
// ============================================================================

async function downloadImage(url: string, timeoutMs = 30000): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiggyIndex/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    log.image.debug('download failed', { url: url.slice(0, 80), error: (err as Error).message });
    return null;
  }
}

// ============================================================================
// Static Image Processing
// ============================================================================

async function processStaticImage(
  buffer: Buffer,
  hash: string,
  r2Client: S3Client,
  force: boolean
): Promise<{ urls: Record<string, string>; totalSize: number } | null> {
  const config = getR2Config();
  const urls: Record<string, string> = {};
  let totalSize = 0;

  // Check cache (use thumb as proxy)
  const thumbKey = `${hash}/thumb.avif`;
  if (!force && await objectExists(r2Client, thumbKey)) {
    return {
      urls: {
        thumb: `${config.publicUrl}/${thumbKey}`,
        full: `${config.publicUrl}/${hash}/full.avif`,
      },
      totalSize: 0,
    };
  }

  // Generate thumbnail (600px, q75)
  try {
    const thumb = await sharp(buffer)
      .resize(THUMB_SIZE, undefined, { fit: 'inside', withoutEnlargement: true })
      .avif({ quality: QUALITY_THUMB, effort: 4 })
      .toBuffer();
    const { url, size } = await uploadToR2(r2Client, thumbKey, thumb, 'image/avif');
    urls.thumb = url;
    totalSize += size;
  } catch (err) {
    log.image.debug('thumb generation failed', { hash, error: (err as Error).message });
    return null;
  }

  // Generate full size (no resize, q80)
  try {
    const full = await sharp(buffer)
      .avif({ quality: QUALITY_FULL, effort: 4 })
      .toBuffer();
    const fullKey = `${hash}/full.avif`;
    const { url, size } = await uploadToR2(r2Client, fullKey, full, 'image/avif');
    urls.full = url;
    totalSize += size;
  } catch (err) {
    log.image.debug('full generation failed', { hash, error: (err as Error).message });
    // Non-fatal - we still have thumb
  }

  return { urls, totalSize };
}

// ============================================================================
// GIF Processing  
// ============================================================================

// No GifMapEntry needed! Frontend detects GIFs by checking if anim.webp exists.
// Uses same folder structure as static: {hash}/thumb.avif + {hash}/anim.webp

async function processGif(
  buffer: Buffer,
  hash: string,
  r2Client: S3Client,
  force: boolean
): Promise<{ totalSize: number } | null> {
  let totalSize = 0;

  // Check cache (use thumb as proxy, same as static)
  const thumbKey = `${hash}/thumb.avif`;
  const animKey = `${hash}/anim.webp`;

  if (!force && await objectExists(r2Client, thumbKey)) {
    // Already processed
    return { totalSize: 0 };
  }

  // Generate thumb/poster (first frame only, AVIF) - same key as static
  try {
    const thumb = await sharp(buffer, { animated: false })
      .resize(THUMB_SIZE, undefined, { fit: 'inside', withoutEnlargement: true })
      .avif({ quality: QUALITY_THUMB, effort: 4 })
      .toBuffer();
    const { size } = await uploadToR2(r2Client, thumbKey, thumb, 'image/avif');
    totalSize += size;
  } catch (err) {
    log.image.debug('poster generation failed', { hash, error: (err as Error).message });
    return null;
  }

  // Generate animated WebP
  try {
    const anim = await sharp(buffer, { animated: true, limitInputPixels: false })
      .resize(THUMB_SIZE, undefined, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY_ANIM_WEBP })
      .toBuffer();
    const { size } = await uploadToR2(r2Client, animKey, anim, 'image/webp');
    totalSize += size;
  } catch (err) {
    log.image.debug('anim webp generation failed', { hash, error: (err as Error).message });
    // Non-fatal - thumb still works as fallback
  }

  return { totalSize };
}

// ============================================================================
// Main Processing
// ============================================================================

export interface ProcessImageResult {
  sourceUrl: string;
  hash: string;
  isGif: boolean;
  cached: boolean;
  totalSizeBytes: number;
  // URLs (same structure for both static and GIF)
  thumbUrl?: string;
  fullUrl?: string;  // static only
  animUrl?: string;  // GIF only
  error?: string;
}

export async function processImage(
  r2Client: S3Client,
  sourceUrl: string,
  options: { force?: boolean } = {}
): Promise<ProcessImageResult> {
  const hash = hashUrl(sourceUrl);
  const isGif = isGifUrl(sourceUrl);

  const result: ProcessImageResult = {
    sourceUrl,
    hash,
    isGif,
    cached: false,
    totalSizeBytes: 0,
  };

  if (!sourceUrl || typeof sourceUrl !== 'string') {
    result.error = 'Invalid URL';
    return result;
  }

  // Download
  const buffer = await downloadImage(sourceUrl);
  if (!buffer) {
    result.error = 'Download failed';
    return result;
  }

  if (isGif) {
    // Process as GIF
    const gifResult = await processGif(buffer, hash, r2Client, options.force || false);
    if (gifResult) {
      const config = getR2Config();
      result.thumbUrl = `${config.publicUrl}/${hash}/thumb.avif`;
      result.animUrl = `${config.publicUrl}/${hash}/anim.webp`;
      result.totalSizeBytes = gifResult.totalSize;
      result.cached = gifResult.totalSize === 0;
    } else {
      result.error = 'GIF processing failed';
    }
  } else {
    // Process as static image
    const staticResult = await processStaticImage(buffer, hash, r2Client, options.force || false);
    if (staticResult) {
      result.thumbUrl = staticResult.urls.thumb;
      result.fullUrl = staticResult.urls.full;
      result.totalSizeBytes = staticResult.totalSize;
      result.cached = staticResult.totalSize === 0;
    } else {
      result.error = 'Static image processing failed';
    }
  }

  return result;
}

// ============================================================================
// Batch Processing
// ============================================================================

export interface ProcessImagesOptions {
  concurrency?: number;
  force?: boolean;
  maxImages?: number;
  sharedBlob?: BlobClient;
  dryRun?: boolean;
}

export interface ProcessImagesStats {
  total: number;
  processed: number;
  cached: number;
  failed: number;
  gifs: number;
  totalSizeBytes: number;
  budgetLimited: boolean;
}

export async function processImages(
  urls: string[],
  options: ProcessImagesOptions = {}
): Promise<{
  results: Map<string, ProcessImageResult>;
  stats: ProcessImagesStats;
}> {
  const {
    concurrency = CONCURRENT_DOWNLOADS,
    force = false,
    maxImages,
    sharedBlob,
    dryRun = false,
  } = options;

  const results = new Map<string, ProcessImageResult>();
  const stats: ProcessImagesStats = {
    total: urls.length,
    processed: 0,
    cached: 0,
    failed: 0,
    gifs: 0,
    totalSizeBytes: 0,
    budgetLimited: false,
  };

  // Check R2 credentials
  const r2Config = getR2Config();
  if (!r2Config.accountId || !r2Config.accessKeyId || !r2Config.secretAccessKey) {
    log.image.error('R2 credentials not configured');
    log.image.info('Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    return { results, stats };
  }

  // Budget check
  let imagesToProcess = urls;
  if (sharedBlob) {
    const { allowed, budget } = await checkBudget(sharedBlob);
    log.image.info('R2 budget status', { status: formatBudgetStatus(budget) });

    if (!allowed) {
      log.image.warn('monthly R2 budget exhausted, skipping image optimization');
      stats.budgetLimited = true;
      return { results, stats };
    }

    const { allowed: batchAllowed, remainingWrites } =
      await wouldExceedBudget(sharedBlob, urls.length); // budget.ts handles ×2 internally

    if (!batchAllowed) {
      const { imagesRemaining } = await getRemainingCapacity(sharedBlob);
      log.image.warn('limiting batch to fit budget', {
        requested: urls.length,
        allowed: imagesRemaining,
        remainingWrites,
      });
      imagesToProcess = urls.slice(0, imagesRemaining);
      stats.budgetLimited = true;
    }
  }

  // Apply maxImages limit
  if (maxImages && imagesToProcess.length > maxImages) {
    log.image.info('limiting images', { from: imagesToProcess.length, to: maxImages });
    imagesToProcess = imagesToProcess.slice(0, maxImages);
  }

  if (dryRun) {
    const gifCount = imagesToProcess.filter(isGifUrl).length;
    log.image.info('dry run complete', {
      wouldProcess: imagesToProcess.length,
      gifs: gifCount,
      static: imagesToProcess.length - gifCount,
    });
    return { results, stats };
  }

  if (imagesToProcess.length === 0) {
    log.image.info('no images to process');
    return { results, stats };
  }

  const gifCount = imagesToProcess.filter(isGifUrl).length;
  log.image.info('starting optimization', {
    total: imagesToProcess.length,
    gifs: gifCount,
    static: imagesToProcess.length - gifCount,
    concurrency,
    force,
  });

  const r2Client = createR2Client();

  // Process in batches
  for (let i = 0; i < imagesToProcess.length; i += concurrency) {
    const batch = imagesToProcess.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(url => processImage(r2Client, url, { force }))
    );

    for (const result of batchResults) {
      results.set(result.sourceUrl, result);

      if (result.cached) {
        stats.cached++;
      } else if (result.error) {
        stats.failed++;
        if (sharedBlob) {
          await recordError(sharedBlob, result.sourceUrl, result.error);
        }
      } else {
        stats.processed++;
        stats.totalSizeBytes += result.totalSizeBytes;
      }

      if (result.isGif) {
        stats.gifs++;
      }
    }

    // Progress log
    const current = Math.min(i + concurrency, imagesToProcess.length);
    if (current % 50 === 0 || current >= imagesToProcess.length) {
      log.image.info('progress', {
        current,
        total: imagesToProcess.length,
        processed: stats.processed,
        cached: stats.cached,
        failed: stats.failed,
      });
    }
  }

  // Record budget usage
  if (sharedBlob && stats.processed > 0) {
    const updatedBudget = await recordUsage(sharedBlob, stats.processed, stats.totalSizeBytes);
    log.image.info('budget updated', { status: formatBudgetStatus(updatedBudget) });
  }

  log.image.info('optimization complete', {
    processed: stats.processed,
    cached: stats.cached,
    failed: stats.failed,
    gifs: stats.gifs,
    totalSizeMB: (stats.totalSizeBytes / (1024 * 1024)).toFixed(2),
    budgetLimited: stats.budgetLimited,
  });

  return { results, stats };
}

// ============================================================================
// URL Helpers (for frontend)
// ============================================================================

/**
 * Get R2 URL for thumbnail (works for both static and GIF)
 */
export function getThumbUrl(sourceUrl: string): string {
  const config = getR2Config();
  if (!config.publicUrl) return sourceUrl;
  const hash = hashUrl(sourceUrl);
  return `${config.publicUrl}/${hash}/thumb.avif`;
}

/**
 * Get R2 URL for full size (static images only)
 */
export function getFullUrl(sourceUrl: string): string {
  const config = getR2Config();
  if (!config.publicUrl) return sourceUrl;
  const hash = hashUrl(sourceUrl);
  return `${config.publicUrl}/${hash}/full.avif`;
}

/**
 * Get R2 URL for animated version (GIFs only)
 */
export function getAnimUrl(sourceUrl: string): string {
  const config = getR2Config();
  const hash = hashUrl(sourceUrl);
  return `${config.publicUrl}/${hash}/anim.webp`;
}

/**
 * Check if URL is a GIF (by extension)
 */
export { isGifUrl };

// ============================================================================
// Clear All (for size changes)
// ============================================================================

export async function clearAllImages(): Promise<{ deleted: number; errors: number }> {
  const config = getR2Config();
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    log.image.error('R2 credentials not configured');
    return { deleted: 0, errors: 0 };
  }

  const r2Client = createR2Client();
  let deleted = 0;
  let errors = 0;

  // All images are now in {hash}/ folders at root level
  let continuationToken: string | undefined;

  do {
    const listResponse = await r2Client.send(new ListObjectsV2Command({
      Bucket: config.bucketName,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));

    const objects = listResponse.Contents || [];
    if (objects.length === 0) break;

    const deleteKeys = objects
      .filter(obj => obj.Key)
      .map(obj => ({ Key: obj.Key! }));

    if (deleteKeys.length > 0) {
      try {
        await r2Client.send(new DeleteObjectsCommand({
          Bucket: config.bucketName,
          Delete: { Objects: deleteKeys },
        }));
        deleted += deleteKeys.length;
        log.image.info('deleted batch', { count: deleteKeys.length, total: deleted });
      } catch (err) {
        errors += deleteKeys.length;
        log.image.error('delete batch failed', { error: (err as Error).message });
      }
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  log.image.info('clear complete', { deleted, errors });
  return { deleted, errors };
}

/**
 * Delete a single image folder from R2 (for cleanup when seller avatar changes)
 * Deletes all files in {hash}/ folder: thumb.avif, full.avif, anim.webp
 */
export async function deleteImageFolder(hash: string): Promise<boolean> {
  const config = getR2Config();
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    return false;
  }

  const r2Client = createR2Client();

  // List all objects in the hash folder
  try {
    const listResponse = await r2Client.send(new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: `${hash}/`,
      MaxKeys: 10, // At most 3 files per folder, but be safe
    }));

    const objects = listResponse.Contents || [];
    if (objects.length === 0) return true; // Nothing to delete

    const deleteKeys = objects
      .filter(obj => obj.Key)
      .map(obj => ({ Key: obj.Key! }));

    await r2Client.send(new DeleteObjectsCommand({
      Bucket: config.bucketName,
      Delete: { Objects: deleteKeys },
    }));

    log.image.debug('deleted image folder', { hash, files: deleteKeys.length });
    return true;
  } catch (err) {
    log.image.warn('failed to delete image folder', { hash, error: (err as Error).message });
    return false;
  }
}

// ============================================================================
// Exports for client-side (default sizes)
// ============================================================================

export const THUMB_WIDTH = THUMB_SIZE;
export const SIZES = [THUMB_SIZE]; // For backwards compat

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  const testUrl = process.argv[2];
  if (!testUrl) {
    console.log('Usage: npx ts-node optimizer.ts <image-url>');
    console.log('\nEnvironment variables required:');
    console.log('  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL');
    process.exit(1);
  }

  const r2Client = createR2Client();
  processImage(r2Client, testUrl, { force: true })
    .then(result => {
      console.log('Result:', JSON.stringify(result, null, 2));
    })
    .catch(console.error);
}
