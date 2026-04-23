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

/** Get the ISO alpha-2 code for a ship-from value (or null if unknown). */
export function shipFromCode(sf: string | null | undefined): string | null {
  if (!sf) return null;
  return SHIP_FROM_CODES[sf.toLowerCase()] ?? null;
}
