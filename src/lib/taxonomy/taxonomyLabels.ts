// Reusable mapping and translation helpers for category and subcategory labels

// Canonical keys for top-level categories from manifest values
export function catKeyForManifest(cat: string): string {
  // Special case: PreRolls -> preRolls (camelCase, not all lowercase)
  if (cat === 'PreRolls') return 'preRolls';
  return String(cat || '').toLowerCase();
}

// Canonical keys for subcategories from manifest values
export function subKeyForManifest(sub: string): string {
  // Special cases that don't follow the simple camelCase pattern
  const exceptions: Record<string, string> = {
    rs11: 'rs11',
    '120u': '120u',
    '90u': '90u',
  };
  
  if (exceptions[sub]) return exceptions[sub];
  
  // Default: lowercase first letter (camelCase conversion)
  return String(sub || '').replace(/^[A-Z]/, (c) => c.toLowerCase());
}

// next-intl may return the key itself for missing messages; this helper returns null in that case
export function safeTranslate(t: (key: string) => string, key: string): string | null {
  try {
    const v = t(key);
    if (!v || v === key) return null;
    return v;
  } catch {
    return null;
  }
}

// Translate a single subcategory label with fallback strategy
export function translateSubLabel(tCats: (key: string) => string, parentKey: string | null, subKey: string): string | null {
  if (parentKey) {
    const v1 = safeTranslate(tCats, `${parentKey}.subs.${subKey}`);
    if (v1) return v1;
  }
  const v2 = safeTranslate(tCats, `subs.${subKey}`);
  return v2 || null;
}

// Produce translated labels for category + subs; returns array of strings
export function translateCategoryAndSubs({ tCats, category, subcategories } : { tCats: (key: string) => string; category?: string | null; subcategories?: string[] | null }) : string[] {
  const parentKey = category ? catKeyForManifest(category) : null;
  const catLabel = parentKey ? (safeTranslate(tCats, parentKey) || category || null) : null;
  const subs = Array.isArray(subcategories) ? subcategories : [];
  const subLabels = subs.map((s) => {
    const sk = subKeyForManifest(s);
    return translateSubLabel(tCats, parentKey, sk) || s;
  });
  return [catLabel, ...subLabels].filter(Boolean) as string[];
}
