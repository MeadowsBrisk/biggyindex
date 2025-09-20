// Generic UI formatting utilities

export function formatBritishDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
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
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// Decode basic HTML entities (&amp;, &quot;, &#x2026;, etc.) into plain text for display
export function decodeEntities(str) {
  if (!str) return "";
  const map = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', bull: '•', middot: '·', deg: '°', euro: '€', pound: '£', copy: '©', reg: '®', trade: '™'
  };
  let s = String(str);
  // Iteratively decode in case of nested entities like &amp;hellip;
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        const code = parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
      })
      .replace(/&#(\d+);/g, (_, num) => {
        const code = parseInt(num, 10);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
      })
      // Named with optional semicolon (case-insensitive)
      .replace(/&([a-zA-Z]+);?/g, (m, name) => {
        const v = map[name.toLowerCase()];
        return v != null ? v : m;
      });
    if (s === before) break;
  }
  return s;
}


