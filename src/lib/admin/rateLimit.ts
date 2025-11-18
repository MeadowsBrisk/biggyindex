/**
 * Rate Limiting Utilities
 * 
 * Simple in-memory rate limiting for admin endpoints.
 * Sufficient for single-instance Netlify Functions.
 */

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, RateLimitRecord>();

/**
 * Check if a request should be rate limited
 * 
 * @param key - Unique identifier (IP address, session ID, etc.)
 * @param maxAttempts - Maximum attempts allowed in the time window
 * @param windowMs - Time window in milliseconds
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const record = attempts.get(key);

  // No record or window expired — allow and create new record
  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  // Exceeded max attempts — rate limit
  if (record.count >= maxAttempts) {
    return false;
  }

  // Increment counter and allow
  record.count++;
  return true;
}

/**
 * Reset rate limit for a specific key (useful for testing or manual reset)
 */
export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

/**
 * Clean up expired rate limit records (call periodically to prevent memory leak)
 */
export function cleanupExpiredRecords(): void {
  const now = Date.now();
  for (const [key, record] of attempts.entries()) {
    if (now > record.resetAt) {
      attempts.delete(key);
    }
  }
}

// Auto-cleanup every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredRecords, 10 * 60 * 1000);
}
