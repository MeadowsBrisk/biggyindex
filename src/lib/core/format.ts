// Generic UI formatting utilities

export function formatBritishDateTime(value: string | number | Date): string {
  if (!value && value !== 0) return "";
  const d = new Date(value as any);
  if (isNaN(d as any)) return "";
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    } as any);
    const parts = Object.fromEntries((dtf as any).formatToParts(d).map((p: any) => [p.type, p.value]));
    const dd = parts.day || "01";
    const MM = parts.month || "01";
    const yyyy = parts.year || "1970";
    const hh = parts.hour || "00";
    const mm = parts.minute || "00";
    return `${dd}/${MM}/${yyyy}, ${hh}:${mm}`;
  } catch {
    // fallback to UTC to remain deterministic
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d as any)) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const weeks = Math.floor(day / 7);
  if (weeks < 4) return `${weeks}w ago`;
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Europe/London' } as any).format(d);
  } catch {
    return d.toUTCString().slice(5, 16); // e.g., "29 Sep 2025"
  }
}

// Decode basic HTML entities (&amp;, &quot;, &#x2026;, etc.) into plain text for display
export function decodeEntities(str: string): string {
  if (!str) return "";
  const map: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', bull: '•', middot: '·', deg: '°', euro: '€', pound: '£', copy: '©', reg: '®', trade: '™'
  };
  let s = String(str);
  // Iteratively decode in case of nested entities like &amp;hellip;
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s
      .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => {
        const code = parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
      })
      .replace(/&#(\d+);/g, (_: string, num: string) => {
        const code = parseInt(num, 10);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
      })
      // Named with optional semicolon (case-insensitive)
      .replace(/&([a-zA-Z]+);?/g, (m: string, name: string) => {
        const v = map[name.toLowerCase()];
        return v != null ? v : m;
      });
    if (s === before) break;
  }
  return s;
}
