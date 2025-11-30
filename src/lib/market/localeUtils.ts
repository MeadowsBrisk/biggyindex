/**
 * Get the domestic country name for the current locale.
 * Used to determine when to hide "ships from" badges for domestic shipping.
 * 
 * @param {string} locale - The locale string (e.g., 'en-GB', 'de-DE', 'fr-FR')
 * @returns {string} The domestic country name in lowercase
 */
export function getDomesticCountry(locale: string): string {
  const l = (locale || 'en-GB').toLowerCase();
  
  if (l.startsWith('de')) return 'germany';
  if (l.startsWith('fr')) return 'france';
  if (l.startsWith('it')) return 'italy';
  if (l.startsWith('pt')) return 'portugal';
  
  // Default to UK for en-GB and any other locale
  return 'united kingdom';
}

/**
 * Check if shipping is domestic (from the locale's country).
 * 
 * @param {string} shipsFrom - The country the item ships from
 * @param {string} locale - The current locale
 * @returns {boolean} True if shipping is domestic
 */
export function isDomesticShipping(shipsFrom: string | null | undefined, locale: string): boolean {
  if (!shipsFrom) return true; // Treat unknown as domestic (hide badge)
  
  const domesticCountry = getDomesticCountry(locale);
  const lcShips = String(shipsFrom).toLowerCase();
  
  return lcShips.includes(domesticCountry);
}
