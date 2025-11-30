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
    const nowToken = safeT(tRel, 'now') || safeT(tRel, 'second') || 's';
    const suffix = safeT(tRel, 'agoSuffix') ?? ' ago';
    const prefix = safeT(tRel, 'agoPrefix') ?? '';
    // Represent "now" without number if dedicated key exists
    if (safeT(tRel, 'now')) return prefix + nowToken + suffix;
    return prefix + '0' + nowToken + suffix;
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
