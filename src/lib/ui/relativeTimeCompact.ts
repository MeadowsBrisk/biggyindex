// Localized one-letter (or minimal) relative time formatting with per-locale prefix/suffix.
// Uses translation keys in messages under "Rel":
//   { agoPrefix, agoSuffix, year, month, week, day, hour, minute, second, now? }
// Falls back to English defaults if keys missing.

export function relativeCompact(ts: number | string | Date | null | undefined, tRel?: (key: string, vars?: any) => string): string {
  if (ts == null || ts === '') return '';
  let ms: number | null = null;
  if (typeof ts === 'number') {
    // Seconds vs ms heuristic
    ms = ts < 1e12 ? ts * 1000 : ts;
  } else if (ts instanceof Date) {
    ms = ts.getTime();
  } else if (typeof ts === 'string') {
    const num = Number(ts);
    if (!isNaN(num) && ts.trim().match(/^\d+$/)) {
      ms = num < 1e12 ? num * 1000 : num;
    } else {
      const parsed = Date.parse(ts);
      ms = isNaN(parsed) ? null : parsed;
    }
  }
  if (ms == null) return '';
  const now = Date.now();
  let diff = now - ms;
  if (diff < 0) diff = 0; // future safeguard
  const sec = Math.floor(diff / 1000);
  const units: Array<[key: string, size: number]> = [
    ['year', 31536000], // 365d
    ['month', 2592000], // 30d
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1]
  ];
  // Edge: just now (<30s) show now token if present
  if (sec < 30) {
    const nowToken = safeT(tRel, 'now');
    const suffix = safeT(tRel, 'agoSuffix') ?? ' ago';
    const prefix = safeT(tRel, 'agoPrefix') ?? '';
    // Represent "now" without suffix if dedicated key exists (e.g., "now" is complete, no "ago" needed)
    if (nowToken) return nowToken;
    // Fallback: use second abbreviation with prefix/suffix
    const secAbbr = safeT(tRel, 'second') || 's';
    return prefix + '0' + secAbbr + suffix;
  }
  for (const [label, size] of units) {
    if (sec >= size) {
      const val = Math.floor(sec / size);
      const abbr = safeT(tRel, label) || defaultAbbr(label);
      const suffix = safeT(tRel, 'agoSuffix') ?? ' ago';
      const prefix = safeT(tRel, 'agoPrefix') ?? '';
      return prefix + String(val) + abbr + suffix;
    }
  }
  // fallback
  const prefix = safeT(tRel, 'agoPrefix') ?? '';
  const suffix = safeT(tRel, 'agoSuffix') ?? ' ago';
  return prefix + '0s' + suffix;
}

function safeT(tRel?: (key: string, vars?: any) => string, key?: string) {
  if (!tRel || !key) return null;
  try { return tRel(key); } catch { return null; }
}

function defaultAbbr(label: string): string {
  switch (label) {
    case 'year': return 'y';
    case 'month': return 'mo'; // avoid clash with minute
    case 'week': return 'w';
    case 'day': return 'd';
    case 'hour': return 'h';
    case 'minute': return 'm';
    case 'second': return 's';
    default: return label.charAt(0);
  }
}

/**
 * Translate an English online status string (from the API) to the current locale.
 * Handles: "today", "yesterday", "2 days ago", "3 days ago", etc.
 * @param online - The English online status string from the API
 * @param tRel - Translation function for "Rel" namespace
 * @returns Translated string, or original if parsing fails
 */
export function translateOnlineStatus(online: string | null | undefined, tRel?: (key: string, vars?: any) => string): string | null {
  if (!online) return null;
  const lower = online.toLowerCase().trim();
  
  // Direct matches
  if (lower === 'today') {
    return safeT(tRel, 'today') || 'today';
  }
  if (lower === 'yesterday') {
    return safeT(tRel, 'yesterday') || 'yesterday';
  }
  
  // Pattern: "X days ago" or "X day ago"
  const daysMatch = lower.match(/^(\d+)\s*days?\s*ago$/);
  if (daysMatch) {
    const count = parseInt(daysMatch[1], 10);
    // Call tRel directly since we need to pass variables
    if (tRel) {
      try {
        const translated = tRel('daysAgo', { count });
        if (translated && translated !== 'daysAgo') return translated;
      } catch {}
    }
    // Fallback to English
    return `${count} days ago`;
  }
  
  // Return original if we can't parse it
  return online;
}
