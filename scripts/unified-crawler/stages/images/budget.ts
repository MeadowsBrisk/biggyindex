import type { BlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { log } from '../../shared/logging/logger';

/**
 * R2 Free Tier Limits (per month):
 * - Storage: 10 GB ($0.015/GB after)
 * - Class A operations (writes/uploads): 1,000,000 ($4.50/million after)
 * - Class B operations (reads): 10,000,000 ($0.36/million after)
 * 
 * Our usage estimate (2000 items, 2 sizes each: thumb.avif + full.avif):
 * - Storage: ~300MB (well under 10GB)
 * - Writes: ~4,000 initial + ~350/day = ~14,500/month
 * - Reads: Tracked separately (depends on traffic)
 */

// Conservative limits with safety buffer (95% of free tier)
const MONTHLY_WRITE_LIMIT = 1_000_000;
const MONTHLY_WRITE_BUDGET = 950_000;  // 95% safety

const MONTHLY_STORAGE_LIMIT_MB = 10_000; // 10GB in MB
const MONTHLY_STORAGE_BUDGET_MB = 9_500; // 95% safety

// Alert thresholds
const WRITE_WARN_THRESHOLD = 0.75; // Warn at 75% usage
const STORAGE_WARN_THRESHOLD = 0.75;

export interface R2Budget {
  month: string;           // '2025-12' format
  writesUsed: number;      // Class A operations (uploads)
  storageUsedMB: number;   // Approximate storage in MB
  imagesProcessed: number; // Total images (each = 2 writes: thumb + full)
  lastUpdated: string;
}

export interface R2Meta {
  lastRun?: string;
  totalImagesProcessed?: number;
  monthlyBudget?: R2Budget;
  history?: { month: string; writesUsed: number; storageUsedMB: number; imagesProcessed: number }[];
  errors?: { url: string; error: string; at: string }[];
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // '2025-12'
}

/**
 * Check if we have budget remaining for R2 operations.
 */
export async function checkBudget(
  sharedBlob: BlobClient
): Promise<{ allowed: boolean; remainingWrites: number; budget: R2Budget }> {
  const meta = await sharedBlob.getJSON<R2Meta>(Keys.shared.aggregates.r2Meta());
  const currentMonth = getCurrentMonth();

  // Get or initialize current month's budget
  let budget: R2Budget = meta?.monthlyBudget || {
    month: currentMonth,
    writesUsed: 0,
    storageUsedMB: 0,
    imagesProcessed: 0,
    lastUpdated: new Date().toISOString(),
  };

  // Reset if new month
  if (budget.month !== currentMonth) {
    log.image.info('new month, resetting R2 budget', { 
      oldMonth: budget.month, 
      oldWrites: budget.writesUsed.toLocaleString(),
      oldStorage: `${budget.storageUsedMB.toFixed(1)}MB`,
      newMonth: currentMonth 
    });
    budget = {
      month: currentMonth,
      writesUsed: 0,
      storageUsedMB: meta?.monthlyBudget?.storageUsedMB || 0, // Storage persists across months
      imagesProcessed: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  const remainingWrites = MONTHLY_WRITE_BUDGET - budget.writesUsed;
  const allowed = remainingWrites > 0;

  // Warn if approaching limits
  const writePercent = budget.writesUsed / MONTHLY_WRITE_BUDGET;
  const storagePercent = budget.storageUsedMB / MONTHLY_STORAGE_BUDGET_MB;
  
  if (writePercent >= WRITE_WARN_THRESHOLD) {
    log.image.warn('R2 write budget approaching limit', {
      used: budget.writesUsed.toLocaleString(),
      limit: MONTHLY_WRITE_BUDGET.toLocaleString(),
      percent: `${(writePercent * 100).toFixed(1)}%`,
    });
  }
  
  if (storagePercent >= STORAGE_WARN_THRESHOLD) {
    log.image.warn('R2 storage approaching limit', {
      used: `${budget.storageUsedMB.toFixed(1)}MB`,
      limit: `${MONTHLY_STORAGE_BUDGET_MB}MB`,
      percent: `${(storagePercent * 100).toFixed(1)}%`,
    });
  }

  return { allowed, remainingWrites, budget };
}

/**
 * Check if a batch would exceed budget.
 * Each image = 2 R2 writes (thumb.avif + full.avif)
 */
export async function wouldExceedBudget(
  sharedBlob: BlobClient,
  imageCount: number
): Promise<{ allowed: boolean; remainingWrites: number; writesNeeded: number }> {
  const { remainingWrites } = await checkBudget(sharedBlob);
  const writesNeeded = imageCount * 2; // thumb + full per image
  return { 
    allowed: writesNeeded <= remainingWrites, 
    remainingWrites,
    writesNeeded,
  };
}

/**
 * Record usage after successful image optimization batch.
 */
export async function recordUsage(
  sharedBlob: BlobClient,
  imagesProcessed: number,
  totalSizeBytes: number
): Promise<R2Budget> {
  const key = Keys.shared.aggregates.r2Meta();
  const meta = (await sharedBlob.getJSON<R2Meta>(key)) || {};
  const currentMonth = getCurrentMonth();

  // Calculate operations (2 writes per image: thumb.avif + full.avif)
  const writesUsed = imagesProcessed * 2;
  const sizeMB = totalSizeBytes / (1024 * 1024);

  // Initialize or update budget
  let budget: R2Budget = meta.monthlyBudget?.month === currentMonth
    ? meta.monthlyBudget
    : { month: currentMonth, writesUsed: 0, storageUsedMB: meta.monthlyBudget?.storageUsedMB || 0, imagesProcessed: 0, lastUpdated: '' };

  budget.writesUsed += writesUsed;
  budget.storageUsedMB += sizeMB;
  budget.imagesProcessed += imagesProcessed;
  budget.lastUpdated = new Date().toISOString();

  // Update history (archive previous months)
  const history = meta.history || [];
  if (meta.monthlyBudget && meta.monthlyBudget.month !== currentMonth) {
    history.push({
      month: meta.monthlyBudget.month,
      writesUsed: meta.monthlyBudget.writesUsed,
      storageUsedMB: meta.monthlyBudget.storageUsedMB,
      imagesProcessed: meta.monthlyBudget.imagesProcessed,
    });
  }

  // Save updated meta
  await sharedBlob.putJSON(key, {
    ...meta,
    lastRun: new Date().toISOString(),
    totalImagesProcessed: (meta.totalImagesProcessed || 0) + imagesProcessed,
    monthlyBudget: budget,
    history: history.slice(-12), // Keep last 12 months
  });

  return budget;
}

/**
 * Record an image processing error.
 */
export async function recordError(
  sharedBlob: BlobClient,
  url: string,
  error: string
): Promise<void> {
  const key = Keys.shared.aggregates.r2Meta();
  const meta = (await sharedBlob.getJSON<R2Meta>(key)) || {};
  
  const errors = meta.errors || [];
  errors.push({
    url: url.slice(0, 200), // Truncate long URLs
    error: error.slice(0, 200),
    at: new Date().toISOString(),
  });

  await sharedBlob.putJSON(key, {
    ...meta,
    errors: errors.slice(-100), // Keep last 100 errors
  });
}

/**
 * Get a formatted budget status string for logging.
 */
export function formatBudgetStatus(budget: R2Budget): string {
  const remainingWrites = MONTHLY_WRITE_BUDGET - budget.writesUsed;
  const writePercent = ((budget.writesUsed / MONTHLY_WRITE_BUDGET) * 100).toFixed(1);
  const storagePercent = ((budget.storageUsedMB / MONTHLY_STORAGE_BUDGET_MB) * 100).toFixed(1);
  
  return `Writes: ${budget.writesUsed.toLocaleString()}/${MONTHLY_WRITE_BUDGET.toLocaleString()} (${writePercent}%), ` +
         `Storage: ${budget.storageUsedMB.toFixed(1)}MB/${MONTHLY_STORAGE_BUDGET_MB}MB (${storagePercent}%), ` +
         `Images: ${budget.imagesProcessed.toLocaleString()}`;
}

/**
 * Calculate how many images can be processed with remaining budget.
 */
export async function getRemainingCapacity(
  sharedBlob: BlobClient
): Promise<{ imagesRemaining: number; writesRemaining: number }> {
  const { remainingWrites } = await checkBudget(sharedBlob);
  return {
    writesRemaining: remainingWrites,
    imagesRemaining: Math.floor(remainingWrites / 2), // 2 writes per image (thumb + full)
  };
}

export { MONTHLY_WRITE_BUDGET, MONTHLY_WRITE_LIMIT, MONTHLY_STORAGE_BUDGET_MB };
