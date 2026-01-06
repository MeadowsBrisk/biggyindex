import type { BlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { log } from '../../shared/logging/logger';

// Azure Free Tier: 2,000,000 chars/month
const MONTHLY_CHAR_LIMIT = 2_000_000;
// Safety buffer: stop at 97.5% to avoid Azure hard rejection
const MONTHLY_CHAR_BUDGET = 1_999_500;

export interface TranslationBudget {
  month: string;           // '2025-12' format
  charsUsed: number;
  itemsTranslated: number;
  lastUpdated: string;
}

export interface TranslationMeta {
  lastRun?: string;
  totalItemsTranslated?: number;
  monthlyBudget?: TranslationBudget;
  history?: { month: string; charsUsed: number; itemsTranslated: number }[];
  errors?: { refNum: string; locale: string; error: string; at: string }[];
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // '2025-12'
}

/**
 * Check if we have budget remaining and return current state.
 */
export async function checkBudget(
  sharedBlob: BlobClient
): Promise<{ allowed: boolean; remaining: number; budget: TranslationBudget }> {
  const meta = await sharedBlob.getJSON<TranslationMeta>(Keys.shared.aggregates.translationMeta());
  const currentMonth = getCurrentMonth();

  // Get or initialize current month's budget
  let budget: TranslationBudget = meta?.monthlyBudget || {
    month: currentMonth,
    charsUsed: 0,
    itemsTranslated: 0,
    lastUpdated: new Date().toISOString(),
  };

  // Reset if new month
  if (budget.month !== currentMonth) {
    log.translate.info('new month, resetting budget', { 
      oldMonth: budget.month, 
      oldUsed: budget.charsUsed.toLocaleString(),
      newMonth: currentMonth 
    });
    budget = {
      month: currentMonth,
      charsUsed: 0,
      itemsTranslated: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  const remaining = MONTHLY_CHAR_BUDGET - budget.charsUsed;
  const allowed = remaining > 0;

  return { allowed, remaining, budget };
}

/**
 * Check if a specific char usage would exceed budget.
 */
export async function wouldExceedBudget(
  sharedBlob: BlobClient,
  charsNeeded: number
): Promise<{ allowed: boolean; remaining: number }> {
  const { remaining } = await checkBudget(sharedBlob);
  return { allowed: charsNeeded <= remaining, remaining };
}

/**
 * Record character usage after successful translation batch.
 */
export async function recordUsage(
  sharedBlob: BlobClient,
  charsUsed: number,
  itemsTranslated: number
): Promise<TranslationBudget> {
  const key = Keys.shared.aggregates.translationMeta();
  const meta = (await sharedBlob.getJSON<TranslationMeta>(key)) || {};
  const currentMonth = getCurrentMonth();

  // Initialize or update budget
  let budget: TranslationBudget = meta.monthlyBudget?.month === currentMonth
    ? meta.monthlyBudget
    : { month: currentMonth, charsUsed: 0, itemsTranslated: 0, lastUpdated: '' };

  budget.charsUsed += charsUsed;
  budget.itemsTranslated += itemsTranslated;
  budget.lastUpdated = new Date().toISOString();

  // Update history (archive previous months)
  const history = meta.history || [];
  if (meta.monthlyBudget && meta.monthlyBudget.month !== currentMonth) {
    history.push({
      month: meta.monthlyBudget.month,
      charsUsed: meta.monthlyBudget.charsUsed,
      itemsTranslated: meta.monthlyBudget.itemsTranslated,
    });
  }

  // Save updated meta
  await sharedBlob.putJSON(key, {
    ...meta,
    lastRun: new Date().toISOString(),
    totalItemsTranslated: (meta.totalItemsTranslated || 0) + itemsTranslated,
    monthlyBudget: budget,
    history: history.slice(-12), // Keep last 12 months
  });

  return budget;
}

/**
 * Record a translation error for debugging.
 */
export async function recordError(
  sharedBlob: BlobClient,
  refNum: string,
  locale: string,
  error: string
): Promise<void> {
  const key = Keys.shared.aggregates.translationMeta();
  const meta = (await sharedBlob.getJSON<TranslationMeta>(key)) || {};
  
  const errors = meta.errors || [];
  errors.push({
    refNum,
    locale,
    error: error.slice(0, 200), // Truncate long errors
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
export function formatBudgetStatus(budget: TranslationBudget): string {
  const remaining = MONTHLY_CHAR_BUDGET - budget.charsUsed;
  const percentUsed = ((budget.charsUsed / MONTHLY_CHAR_BUDGET) * 100).toFixed(1);
  return `${budget.charsUsed.toLocaleString()}/${MONTHLY_CHAR_BUDGET.toLocaleString()} (${percentUsed}% used, ${remaining.toLocaleString()} remaining)`;
}

/**
 * Initialize/set the budget to a specific char count (for recovery after blob deletion).
 */
export async function initBudget(
  sharedBlob: BlobClient,
  charsUsed: number,
  itemsTranslated: number = 0
): Promise<TranslationBudget> {
  const key = Keys.shared.aggregates.translationMeta();
  const meta = (await sharedBlob.getJSON<TranslationMeta>(key)) || {};
  const currentMonth = getCurrentMonth();

  const budget: TranslationBudget = {
    month: currentMonth,
    charsUsed,
    itemsTranslated,
    lastUpdated: new Date().toISOString(),
  };

  await sharedBlob.putJSON(key, {
    ...meta,
    lastRun: new Date().toISOString(),
    totalItemsTranslated: itemsTranslated,
    monthlyBudget: budget,
  });

  log.translate.info('budget initialized', {
    month: currentMonth,
    charsUsed: charsUsed.toLocaleString(),
    remaining: (MONTHLY_CHAR_BUDGET - charsUsed).toLocaleString(),
  });

  return budget;
}

export { MONTHLY_CHAR_BUDGET, MONTHLY_CHAR_LIMIT };
