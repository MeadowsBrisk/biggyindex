/**
 * Shared ship-from country mapping.
 *
 * Normalizes lowercase country names (as stored in `item.sf`) to ISO 3166-1
 * alpha-2 codes for <CountryFlag />. Consumed by FilterPanel's "Ships from"
 * filter and by ItemCard's flag badge.
 */

export const SHIP_FROM_CODES: Record<string, string> = {
  uk: "gb",
  "united kingdom": "gb",
  spain: "es",
  netherlands: "nl",
  germany: "de",
  france: "fr",
  italy: "it",
  portugal: "pt",
  belgium: "be",
  "czech republic": "cz",
  czechia: "cz",
  austria: "at",
  switzerland: "ch",
  poland: "pl",
  denmark: "dk",
  sweden: "se",
  ireland: "ie",
  usa: "us",
  "united states": "us",
  canada: "ca",
  thailand: "th",
  morocco: "ma",
};

/** Pretty-print a ship-from value ("united kingdom" -> "United Kingdom"). */
export function formatShipFrom(sf: string): string {
  return sf
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Synthetic ship-from codes. These don't correspond to a country but we
 * render them as flag glyphs (globe / question mark) via CountryFlag for
 * visual consistency with real country chips.
 */
export const SHIP_FROM_MULTI = "multi" as const;
export const SHIP_FROM_UNKNOWN = "unknown" as const;

/**
 * Display names keyed by alpha-2 / synthetic code. Used by filter chips
 * and any UI that wants to show "United Kingdom" rather than "GB".
 */
export const SHIP_FROM_LABELS: Record<string, string> = {
  gb: "United Kingdom",
  es: "Spain",
  nl: "Netherlands",
  de: "Germany",
  fr: "France",
  it: "Italy",
  pt: "Portugal",
  be: "Belgium",
  cz: "Czech Republic",
  at: "Austria",
  ch: "Switzerland",
  pl: "Poland",
  dk: "Denmark",
  se: "Sweden",
  ie: "Ireland",
  us: "United States",
  ca: "Canada",
  th: "Thailand",
  ma: "Morocco",
  multi: "Multiple",
  unknown: "Unknown",
};

const SYNTHETIC_LABELS: Record<string, Record<string, string>> = {
  multi: {
    en: "Multiple",
    de: "Mehrere",
    fr: "Multiple",
    pt: "Vários",
    it: "Multipli",
    es: "Varios",
    el: "Πολλαπλές",
    cs: "Více zemí",
    pl: "Wiele krajów",
  },
  unknown: {
    en: "Unknown",
    de: "Unbekannt",
    fr: "Inconnu",
    pt: "Desconhecido",
    it: "Sconosciuto",
    es: "Desconocido",
    el: "Άγνωστο",
    cs: "Neznámé",
    pl: "Nieznane",
  },
};

type RegionDisplayNames = {
  of(code: string): string | undefined;
};

type RegionDisplayNamesConstructor = new (
  locales: string | string[],
  options: { type: "region" },
) => RegionDisplayNames;

function displayRegionName(code: string, locale?: string): string | null {
  if (!locale || !/^[a-z]{2}$/i.test(code)) return null;
  const DisplayNames = (
    Intl as typeof Intl & { DisplayNames?: RegionDisplayNamesConstructor }
  ).DisplayNames;
  if (!DisplayNames) return null;

  try {
    return (
      new DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ??
      null
    );
  } catch {
    return null;
  }
}

function syntheticShipFromLabel(code: string, locale?: string): string | null {
  const language = locale?.toLowerCase().split("-")[0] ?? "en";
  return SYNTHETIC_LABELS[code]?.[language] ?? null;
}

/**
 * Display name for a ship-from code (the value returned by `shipFromCode`).
 * Falls back to title-casing the code itself for genuinely unmapped values.
 */
export function shipFromLabel(code: string, locale?: string): string {
  const normalized = code.trim().toLowerCase();
  return (
    syntheticShipFromLabel(normalized, locale) ??
    displayRegionName(normalized, locale) ??
    SHIP_FROM_LABELS[normalized] ??
    normalized.replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

/** ship-from values that mean "ships from several countries". */
const MULTI_VALUES = new Set([
  "multiple countries",
  "multiple",
  "various",
  "various countries",
  "global",
  "international",
  "worldwide",
]);

/** ship-from values that mean "seller didn't declare an origin". */
const UNKNOWN_VALUES = new Set(["undeclared", "unknown", "n/a", "na", ""]);

/**
 * Get the flag-renderable code for a ship-from value:
 *   - real ISO-3166 alpha-2 (e.g. "gb", "de") for known countries
 *   - "multi" for multi-country sellers
 *   - "unknown" for undeclared
 *   - null for genuinely unrecognised strings (caller decides fallback)
 */
export function shipFromCode(sf: string | null | undefined): string | null {
  if (sf == null) return SHIP_FROM_UNKNOWN;
  const lower = sf.trim().toLowerCase();
  if (!lower) return SHIP_FROM_UNKNOWN;
  const known = SHIP_FROM_CODES[lower];
  if (known) return known;
  if (MULTI_VALUES.has(lower)) return SHIP_FROM_MULTI;
  if (UNKNOWN_VALUES.has(lower)) return SHIP_FROM_UNKNOWN;
  return null;
}
