// Human-friendly labels for shipping origin codes
// Supports ISO-like 2-letter codes and special sentinels: 'multi', 'und'

const CODE_TO_NAME = {
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

export function countryLabel(code) {
  if (!code || typeof code !== 'string') return '';
  const key = code.toLowerCase();
  return CODE_TO_NAME[key] || code.toUpperCase();
}

// Normalize free-form "shipsFrom" strings into internal filter codes
// Returns: two-letter code like 'uk','us','de','es', or special sentinels 'multi','und'. Null if unknown.
export function normalizeShipFromCode(source) {
  if (!source || typeof source !== 'string') return null;
  const s = source.trim().toLowerCase();
  if (!s) return null;
  const map = {
    // UK variants
    'united kingdom': 'uk', 'uk': 'uk', 'great britain': 'uk', 'britain': 'uk', 'england': 'uk', 'scotland': 'uk', 'wales': 'uk', 'northern ireland': 'uk',
    // US variants
    'united states': 'us', 'united states of america': 'us', 'usa': 'us', 'us': 'us', 'america': 'us',
    // DE variants
    'germany': 'de', 'deutschland': 'de',
    // ES variants
    'spain': 'es', 'españa': 'es', 'espana': 'es',
    // NL variants
    'netherlands': 'nl', 'holland': 'nl', 'nederland': 'nl',
    // FR
    'france': 'fr',
    // IT
    'italy': 'it', 'italia': 'it',
    // IE
    'ireland': 'ie', 'eire': 'ie',
    // PT
    'portugal': 'pt',
    // BE
    'belgium': 'be',
    // PL
    'poland': 'pl', 'polska': 'pl',
    // AT
    'austria': 'at',
    // CH
    'switzerland': 'ch', 'schweiz': 'ch', 'suisse': 'ch', 'svizzera': 'ch',
    // Nordics
    'sweden': 'se', 'sverige': 'se',
    'norway': 'no', 'norge': 'no',
    'denmark': 'dk', 'danmark': 'dk',
    'finland': 'fi', 'suomi': 'fi',
    // CZ
    'czech republic': 'cz', 'czechia': 'cz',
    // GR
    'greece': 'gr', 'hellas': 'gr',
    // CA/TR
    'canada': 'ca',
    'turkey': 'tr', 'türkiye': 'tr', 'turkiye': 'tr',
    // Sentinels
    'multiple countries': 'multi', 'multi': 'multi',
    'undeclared': 'und', 'unknown': 'und', 'not specified': 'und', 'n/a': 'und', 'na': 'und'
  };
  if (map[s]) return map[s];
  // 3-letter common ISO codes to 2-letter
  const iso3 = {
    gbr: 'uk', usa: 'us', deu: 'de', esp: 'es', nld: 'nl', fra: 'fr', ita: 'it', irl: 'ie', prt: 'pt', bel: 'be', pol: 'pl', aut: 'at', che: 'ch', swe: 'se', nor: 'no', dnk: 'dk', fin: 'fi', cze: 'cz', grc: 'gr', can: 'ca', tur: 'tr'
  };
  if (iso3[s]) return iso3[s];
  // 2-letter pass-through
  if (/^[a-z]{2}$/.test(s)) return s;
  return null;
}

// Convert source-provided names to display labels with proper casing
export function countryLabelFromSource(name) {
  if (!name || typeof name !== 'string') return '';
  const lower = name.toLowerCase().trim();
  const NAME_MAP = {
    'united kingdom': 'United Kingdom',
    'uk': 'United Kingdom',
    'great britain': 'United Kingdom',
    'britain': 'United Kingdom',
    'england': 'United Kingdom',
    'scotland': 'United Kingdom',
    'wales': 'United Kingdom',
    'northern ireland': 'United Kingdom',
    'united states': 'United States',
    'united states of america': 'United States',
    'usa': 'United States',
    'us': 'United States',
    'multiple countries': 'Multiple Countries',
    'undeclared': 'Undeclared',
    'unknown': 'Undeclared',
  };
  if (NAME_MAP[lower]) return NAME_MAP[lower];
  // Default: title-case each word
  return name.replace(/\b([a-z])(\w*)/gi, (_, a, rest) => a.toUpperCase() + rest.toLowerCase());
}


