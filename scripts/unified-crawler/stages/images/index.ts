/**
 * Images Stage - Entry point
 * 
 * Optimizes item images (static + GIFs) and uploads to Cloudflare R2.
 * Run as: yarn uc --stage=images
 * 
 * Smart change detection:
 *   - Only processes images for NEW or UPDATED items (based on lua/lastUpdatedAt)
 *   - Deletes stale image hashes when an item's images change
 *   - Does NOT delete images for unlisted items (preserved for SEO)
 * 
 * Unified folder structure (no gif-map needed!):
 *   {hash}/thumb.avif   - 600px thumbnail (ALL images)
 *   {hash}/full.avif    - Original size (static only)
 *   {hash}/anim.webp    - Animated version (GIFs only)
 * 
 * Frontend detects GIFs by checking if anim.webp exists (HEAD request).
 */

export {
  processImages,
  processImage,
  hashUrl,
  clearAllImages,
  deleteImageFolder,
  // URL helpers
  getThumbUrl,
  getFullUrl,
  getAnimUrl,
  isGifUrl,
  // Types
  type ProcessImageResult,
  type ProcessImagesStats,
  // Constants
  THUMB_WIDTH,
  SIZES,
} from './optimizer';

export {
  checkBudget,
  recordUsage,
  formatBudgetStatus,
  getRemainingCapacity,
  type R2Budget,
} from './budget';

export {
  loadImageMeta,
  saveImageMeta,
  getItemsNeedingImageUpdate,
  updateItemImageMeta,
  getStaleHashes,
  type ItemImageMeta,
  type ImageMetaAggregate,
} from './imageMeta';
