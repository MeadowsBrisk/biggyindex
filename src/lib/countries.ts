// Human-friendly labels for shipping origin codes
// Supports ISO-like 2-letter codes and special sentinels: 'multi', 'und'

export type ShipCode =
  | 'uk' | 'us' | 'nl' | 'de' | 'fr' | 'es' | 'it' | 'ie' | 'pt' | 'be' | 'pl' | 'at' | 'ch' | 'se' | 'no' | 'dk' | 'fi' | 'cz' | 'gr' | 'ca' | 'tr'
  | 'multi' | 'und';

const CODE_TO_NAME: Record<string, string> = {
  uk: 'UK',
  us: 'US',
  nl: 'Netherlands',
  de: 'Germany',
  fr: 'France',
  es: 'Spain',
  it: 'Italy',
  ie: 'Ireland',
  pt: 'Portugal',
  be: 'Belgium',
  pl: 'Poland',
  at: 'Austria',
  ch: 'Switzerland',
  se: 'Sweden',
  no: 'Norway',
  dk: 'Denmark',
  fi: 'Finland',
  cz: 'Czech Republic',
  gr: 'Greece',
  ca: 'Canada',
  tr: 'Turkey',
  // Special sentinels
  multi: 'Multi',
  und: 'Undeclared',
};

export function countryLabel(code: string): string {
  if (!code || typeof code !== 'string') return '';
  const key = code.toLowerCase();
  return CODE_TO_NAME[key] || code.toUpperCase();
}

// Normalize free-form "shipsFrom" strings into internal filter codes
// Returns: two-letter code like 'uk','us','de','es', or special sentinels 'multi','und'. Null if unknown.
export function normalizeShipFromCode(source: string): ShipCode | null {
  if (!source || typeof source !== 'string') return null;
  const s = source.trim().toLowerCase();
  if (!s) return null;
  const map: Record<string, ShipCode> = {
    'united kingdom': 'uk', 'uk': 'uk', 'great britain': 'uk', 'britain': 'uk', 'england': 'uk', 'scotland': 'uk', 'wales': 'uk', 'northern ireland': 'uk',
    'united states': 'us', 'united states of america': 'us', 'usa': 'us', 'us': 'us', 'america': 'us',
    'germany': 'de', 'deutschland': 'de',
    'spain': 'es', 'españa': 'es', 'espana': 'es',
    'netherlands': 'nl', 'holland': 'nl', 'nederland': 'nl',
    'france': 'fr',
    'italy': 'it', 'italia': 'it',
    'ireland': 'ie', 'eire': 'ie',
    'portugal': 'pt',
    'belgium': 'be',
    'poland': 'pl', 'polska': 'pl',
    'austria': 'at',
    'switzerland': 'ch', 'schweiz': 'ch', 'suisse': 'ch', 'svizzera': 'ch',
    'sweden': 'se', 'sverige': 'se',
    'norway': 'no', 'norge': 'no',
    'denmark': 'dk', 'danmark': 'dk',
    'finland': 'fi', 'suomi': 'fi',
    'czech republic': 'cz', 'czechia': 'cz',
    'greece': 'gr', 'hellas': 'gr',
    'canada': 'ca',
    'turkey': 'tr', 'türkiye': 'tr', 'turkiye': 'tr',
    'multiple countries': 'multi', 'multi': 'multi',
    'undeclared': 'und', 'unknown': 'und', 'not specified': 'und', 'n/a': 'und', 'na': 'und'
  };
  if (map[s]) return map[s];
  // 3-letter common ISO codes to 2-letter
  const iso3: Record<string, ShipCode> = {
    gbr: 'uk', usa: 'us', deu: 'de', esp: 'es', nld: 'nl', fra: 'fr', ita: 'it', irl: 'ie', prt: 'pt', bel: 'be', pol: 'pl', aut: 'at', che: 'ch', swe: 'se', nor: 'no', dnk: 'dk', fin: 'fi', cze: 'cz', grc: 'gr', can: 'ca', tur: 'tr'
  };
  if (iso3[s]) return iso3[s];
  // 2-letter pass-through
  if (/^[a-z]{2}$/.test(s)) return s as ShipCode;
  return null;
}

// Convert source-provided names to display labels with proper casing
export function countryLabelFromSource(name: string): string | null {
  if (!name || typeof name !== 'string') return null;
  const code = normalizeShipFromCode(name);
  if (code) return countryLabel(code);
  // fallback: best-effort capitalization of original
  const lower = name.toLowerCase().trim();
  return lower ? lower.replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase()) : null;
}
