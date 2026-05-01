/**
 * Market detection helpers.
 *
 * Production: subdomain-based (de.biggyindex.com → DE)
 * Dev/preview: path-based fallback (/de → DE) or default GB
 */

export type MarketCode =
  | "GB"
  | "IE"
  | "DE"
  | "FR"
  | "PT"
  | "IT"
  | "ES"
  | "GR"
  | "CZ"
  | "PL";

const GB_HOSTS = new Set([
  "biggyindex.com",
  "www.biggyindex.com",
  "lbindex.vip",
  "www.lbindex.vip",
]);

/** Derive market from hostname (subdomain detection). */
export function getMarketFromHost(
  hostname: string | undefined | null,
): MarketCode {
  const h = String(hostname ?? "")
    .toLowerCase()
    .split(":")[0];

  if (!h) return "GB";

  // Apex or www → GB
  if (GB_HOSTS.has(h)) return "GB";

  // Subdomains
  if (h.endsWith(".biggyindex.com")) {
    if (h.startsWith("ie.")) return "IE";
    if (h.startsWith("de.")) return "DE";
    if (h.startsWith("fr.")) return "FR";
    if (h.startsWith("pt.")) return "PT";
    if (h.startsWith("it.")) return "IT";
    if (h.startsWith("es.")) return "ES";
    if (h.startsWith("gr.")) return "GR";
    if (h.startsWith("cz.")) return "CZ";
    if (h.startsWith("pl.")) return "PL";
    return "GB";
  }

  // Vercel preview / other hosts — best-effort hint
  if (/\bie[.-]/.test(h)) return "IE";
  if (/\bde[.-]/.test(h)) return "DE";
  if (/\bfr[.-]/.test(h)) return "FR";
  if (/\bpt[.-]/.test(h)) return "PT";
  if (/\bit[.-]/.test(h)) return "IT";
  if (/\bes[.-]/.test(h)) return "ES";
  if (/\bgr[.-]/.test(h)) return "GR";
  if (/\bcz[.-]/.test(h)) return "CZ";
  if (/\bpl[.-]/.test(h)) return "PL";

  return "GB";
}

/** Whether the host uses subdomain-based market routing. */
export function isHostBasedEnv(hostname?: string | null): boolean {
  const h = String(
    hostname ??
      (typeof window !== "undefined" ? window.location?.hostname : "") ??
      "",
  ).toLowerCase();

  if (!h || h === "localhost" || h.startsWith("localhost:")) return false;
  return GB_HOSTS.has(h) || h.endsWith(".biggyindex.com");
}

/** Map BCP 47 locale → market code. */
export function localeToMarket(locale: string | undefined): MarketCode {
  switch (locale) {
    case "en-IE":
      return "IE";
    case "de-DE":
    case "de":
      return "DE";
    case "fr-FR":
    case "fr":
      return "FR";
    case "pt-PT":
    case "pt":
      return "PT";
    case "it-IT":
    case "it":
      return "IT";
    case "es-ES":
    case "es":
      return "ES";
    case "el-GR":
    case "el":
      return "GR";
    case "cs-CZ":
    case "cs":
      return "CZ";
    case "pl-PL":
    case "pl":
      return "PL";
    default:
      return "GB";
  }
}

/** Map market code → BCP 47 locale. */
export function marketToLocale(market: MarketCode): string {
  switch (market) {
    case "IE":
      return "en-IE";
    case "DE":
      return "de-DE";
    case "FR":
      return "fr-FR";
    case "PT":
      return "pt-PT";
    case "IT":
      return "it-IT";
    case "ES":
      return "es-ES";
    case "GR":
      return "el-GR";
    case "CZ":
      return "cs-CZ";
    case "PL":
      return "pl-PL";
    default:
      return "en-GB";
  }
}

export const ALL_MARKETS: MarketCode[] = [
  "GB",
  "IE",
  "DE",
  "FR",
  "PT",
  "IT",
  "ES",
  "GR",
  "CZ",
  "PL",
];

/**
 * Map a market code to its production hostname. Mirrors the `domains`
 * config in `src/i18n/routing.ts`. GB lives at the apex; every other
 * market is a subdomain. Used by the market switcher in `SiteHeader` to
 * build the cross-origin navigation URL.
 */
export function marketToHost(market: MarketCode): string {
  switch (market) {
    case "GB":
      return "biggyindex.com";
    case "IE":
      return "ie.biggyindex.com";
    case "DE":
      return "de.biggyindex.com";
    case "FR":
      return "fr.biggyindex.com";
    case "PT":
      return "pt.biggyindex.com";
    case "IT":
      return "it.biggyindex.com";
    case "ES":
      return "es.biggyindex.com";
    case "GR":
      return "gr.biggyindex.com";
    case "CZ":
      return "cz.biggyindex.com";
    case "PL":
      return "pl.biggyindex.com";
    default:
      return "biggyindex.com";
  }
}

/** Markets where the UI is English (skip translation toggle, reuse en-GB copy). */
export const ENGLISH_MARKETS: MarketCode[] = ["GB", "IE"];

/** Market code → native currency symbol. */
export function marketCurrencySymbol(market: MarketCode | string): string {
  switch (market.toUpperCase()) {
    case "GB":
      return "£";
    case "CZ":
      return "Kč";
    case "PL":
      return "zł";
    case "IE":
    case "DE":
    case "FR":
    case "PT":
    case "IT":
    case "ES":
    case "GR":
      return "€";
    default:
      return "£";
  }
}
