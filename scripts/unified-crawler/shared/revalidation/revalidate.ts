/**
 * On-Demand ISR Revalidation Utility
 * 
 * Triggers Next.js ISR page rebuilds after the unified crawler updates blobs.
 * This eliminates the 16-minute delay from timed ISR (revalidate: 1000).
 * 
 * Environment Variables:
 *   REVALIDATE_SECRET_TOKEN - Shared secret for API authentication
 *   REVALIDATE_BASE_URL - Base URL for revalidation (defaults to production)
 */

const REVALIDATE_PATHS = {
  GB: '/',
  DE: '/de',
  FR: '/fr',
  PT: '/pt',
  IT: '/it',
} as const;

type Market = keyof typeof REVALIDATE_PATHS;

interface RevalidateOptions {
  baseUrl?: string;
  secret?: string;
}

interface RevalidateResult {
  success: boolean;
  path: string;
  error?: string;
  timestamp?: string;
}

/**
 * Trigger on-demand revalidation for a specific market's homepage
 */
export async function revalidateMarket(
  market: Market,
  options: RevalidateOptions = {}
): Promise<RevalidateResult> {
  const path = REVALIDATE_PATHS[market];
  const baseUrl = options.baseUrl || process.env.REVALIDATE_BASE_URL || 'https://biggyindex.com';
  const secret = options.secret || process.env.REVALIDATE_SECRET_TOKEN;

  if (!secret) {
    console.warn('[revalidate] REVALIDATE_SECRET_TOKEN not configured; skipping revalidation');
    return { success: false, path, error: 'No secret token configured' };
  }

  try {
    const url = `${baseUrl}/api/revalidate?secret=${encodeURIComponent(secret)}&path=${encodeURIComponent(path)}`;
    console.log(`[revalidate] Requesting revalidation for ${market} (${path})`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok || !data.revalidated) {
      console.error(`[revalidate] Failed for ${market}:`, data.error || response.statusText);
      return { success: false, path, error: data.error || response.statusText };
    }

    console.log(`[revalidate] Success for ${market} (${path}) at ${data.timestamp}`);
    return { success: true, path, timestamp: data.timestamp };
  } catch (err: any) {
    console.error(`[revalidate] Network error for ${market}:`, err?.message || err);
    return { success: false, path, error: err?.message || 'Network error' };
  }
}

/**
 * Trigger revalidation for all markets sequentially
 */
export async function revalidateAllMarkets(
  options: RevalidateOptions = {}
): Promise<RevalidateResult[]> {
  const markets: Market[] = ['GB', 'DE', 'FR', 'PT', 'IT'];
  const results: RevalidateResult[] = [];

  console.log('[revalidate] Starting revalidation for all markets');

  for (const market of markets) {
    const result = await revalidateMarket(market, options);
    results.push(result);
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const successful = results.filter(r => r.success).length;
  console.log(`[revalidate] Completed: ${successful}/${markets.length} markets revalidated`);

  return results;
}

/**
 * Best-effort revalidation wrapper (doesn't throw)
 * Use this in background functions where revalidation failure shouldn't block completion
 */
export async function tryRevalidateMarket(
  market: Market,
  options: RevalidateOptions = {}
): Promise<void> {
  try {
    await revalidateMarket(market, options);
  } catch (err: any) {
    console.warn(`[revalidate] Best-effort revalidation failed for ${market}:`, err?.message || err);
  }
}

/**
 * Best-effort revalidation for all markets (doesn't throw)
 */
export async function tryRevalidateAllMarkets(
  options: RevalidateOptions = {}
): Promise<void> {
  try {
    await revalidateAllMarkets(options);
  } catch (err: any) {
    console.warn('[revalidate] Best-effort revalidation failed for all markets:', err?.message || err);
  }
}
