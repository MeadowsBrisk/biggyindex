/**
 * Images Stage - Entry point
 * 
 * Optimizes item images (static + GIFs) and uploads to Cloudflare R2.
 * Run as: yarn uc --stage=images
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
