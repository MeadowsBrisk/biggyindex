/** Format a price value with currency symbol and rate conversion. */
export function fmtPrice(
  val: number | null | undefined,
  sym: string,
  rate: number,
): string {
  if (val == null) return "N/A";
  return `${sym}${(val * rate).toFixed(2)}`;
}

/** Format a price change between two values. Returns e.g. "↓ 15%" or "↑ 8%", or null if equal. */
export function formatPriceChange(
  oldPrice: number,
  newPrice: number,
): string | null {
  if (oldPrice === newPrice || oldPrice <= 0) return null;
  const pct = Math.round(Math.abs(((newPrice - oldPrice) / oldPrice) * 100));
  if (pct === 0) return null;
  return newPrice < oldPrice ? `↓ ${pct}%` : `↑ ${pct}%`;
}

/** Format ISO string as "17 Feb 2026, 14:30" (en-GB). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Decode basic HTML entities (&amp;, &quot;, &#x2026;, &hellip;, numeric
 * references, etc.) into plain text. Ported from old-biggyindex
 * `lib/core/format.ts` — handles nested entities (e.g. `&amp;hellip;`) by
 * iterating up to 3 times, and covers the common named entities the crawler
 * surfaces in product/variant/review strings.
 */
const ENTITY_NAMES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  deg: "°",
  euro: "€",
  pound: "£",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(str: string | null | undefined): string {
  if (!str) return "";
  let s = String(str);
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
      })
      .replace(/&#(\d+);/g, (_, num: string) => {
        const code = Number.parseInt(num, 10);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
      })
      .replace(/&([a-zA-Z]+);?/g, (m, name: string) => {
        const v = ENTITY_NAMES[name.toLowerCase()];
        return v != null ? v : m;
      });
    if (s === before) break;
  }
  return s;
}
