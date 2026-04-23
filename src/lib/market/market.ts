/**
 * Market detection helpers.
 *
 * Production: subdomain-based (de.biggyindex.com → DE)
 * Dev/preview: path-based fallback (/de → DE) or default GB
 */

export type MarketCode = "GB" | "DE" | "FR" | "PT" | "IT" | "ES" | "GR" | "CZ";

/** Derive market from hostname (subdomain detection). */
export function getMarketFromHost(hostname: string | undefined | null): MarketCode {
  const h = String(hostname ?? "")
    .toLowerCase()
    .split(":")[0];

  if (!h) return "GB";

  // Apex or www → GB
  if (h === "biggyindex.com" || h === "www.biggyindex.com") return "GB";

  // Subdomains
  if (h.endsWith(".biggyindex.com")) {
    if (h.startsWith("de.")) return "DE";
    if (h.startsWith("fr.")) return "FR";
    if (h.startsWith("pt.")) return "PT";
    if (h.startsWith("it.")) return "IT";
    if (h.startsWith("es.")) return "ES";
    if (h.startsWith("gr.")) return "GR";
    if (h.startsWith("cz.")) return "CZ";
    return "GB";
  }

  // Vercel preview / other hosts — best-effort hint
  if (/\bde[.-]/.test(h)) return "DE";
  if (/\bfr[.-]/.test(h)) return "FR";
  if (/\bpt[.-]/.test(h)) return "PT";
  if (/\bit[.-]/.test(h)) return "IT";
  if (/\bes[.-]/.test(h)) return "ES";
  if (/\bgr[.-]/.test(h)) return "GR";
  if (/\bcz[.-]/.test(h)) return "CZ";

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
  return (
    h === "biggyindex.com" ||
    h === "www.biggyindex.com" ||
    h.endsWith(".biggyindex.com")
  );
}

/** Map BCP 47 locale → market code. */
export function localeToMarket(locale: string | undefined): MarketCode {
  switch (locale) {
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
    default:
      return "GB";
  }
}

/** Map market code → BCP 47 locale. */
export function marketToLocale(market: MarketCode): string {
  switch (market) {
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
    default:
      return "en-GB";
  }
}

export const ALL_MARKETS: MarketCode[] = ["GB", "DE", "FR", "PT", "IT", "ES", "GR", "CZ"];

/** Market code → native currency symbol. */
export function marketCurrencySymbol(market: MarketCode | string): string {
  switch (market.toUpperCase()) {
    case "GB":
      return "£";
    case "CZ":
      return "Kč";
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
