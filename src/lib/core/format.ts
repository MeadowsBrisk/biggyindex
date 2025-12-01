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
