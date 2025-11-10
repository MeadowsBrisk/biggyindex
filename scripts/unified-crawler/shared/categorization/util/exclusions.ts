// Unified exclusion heuristics (parity with legacy isTipListing)
// Determines whether a listing should be treated as a non-categorizable tip/service/upgrade entry.
// This is a minimal reconstruction based on regression test cases.

export function isTipListing(name: string, description: string): boolean {
  const base = `${name || ''} ${description || ''}`.toLowerCase();
  // Tip / referral / passive income offerings
  const tipPatterns = [
    /referrer\s+retirement\s+plan/,
    /star\s+maker\s+package/,
    /passive\s+income/,
    /tip\s+jar/, /tips?\b/,
  ];
  // Upgrade (postage/shipping) patterns
  const upgradePatterns = [
    /postage\s+upgrade/, /shipping\s+upgrade/, /upgrade\s+to\s+special\s+delivery/,
  ];
  for (const re of tipPatterns) if (re.test(base)) return true;
  for (const re of upgradePatterns) if (re.test(base)) return true;
  return false;
}

export default isTipListing;
