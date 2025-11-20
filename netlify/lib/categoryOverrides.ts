/**
 * Category Overrides — Shared Types & Utilities
 * 
 * Manual override system for items that cannot be reliably categorized
 * by the automated keyword pipeline.
 */

import { TAXONOMY } from '../../scripts/unified-crawler/shared/categorization/baseTaxonomy';

export const OVERRIDES_KEY = 'category-overrides.json';

export type OverrideEntry = {
  id: string;                    // refNum preferred, else numeric id (always string)
  itemName: string;              // cached for display in admin UI
  sellerName?: string;           // cached seller name for display
  primary: string;               // must be valid category from taxonomy
  subcategories: string[];       // must be valid children of primary
  reason?: string;               // optional explanation (max 500 chars)
  addedBy: string;               // always "admin" for v1
  addedAt: string;               // ISO 8601 timestamp
  lastModifiedAt: string;        // ISO 8601 timestamp
  exists?: boolean;              // flag added by API - true if item still exists in index
};

export type OverridesData = {
  version: string;               // schema version (currently "1.0.0")
  updatedAt: string;             // ISO 8601 timestamp of last change
  overrides: OverrideEntry[];    // array of all overrides
};

/**
 * Validate an override entry against the taxonomy
 * 
 * @param entry - Partial override entry to validate
 * @returns null if valid, error message string if invalid
 */
export function validateOverride(entry: Partial<OverrideEntry>): string | null {
  // Check required fields
  if (!entry.id || typeof entry.id !== 'string' || entry.id.trim() === '') {
    return 'Missing or invalid id';
  }

  if (!entry.itemName || typeof entry.itemName !== 'string' || entry.itemName.trim() === '') {
    return 'Missing or invalid item name';
  }

  if (!entry.primary || typeof entry.primary !== 'string') {
    return 'Missing or invalid primary category';
  }

  // Check primary category exists in taxonomy
  if (!TAXONOMY[entry.primary]) {
    return `Invalid primary category: ${entry.primary}`;
  }

  // Prevent Tips category (special case in pipeline)
  if (entry.primary === 'Tips') {
    return 'Cannot override to Tips category';
  }

  // Validate subcategories if provided
  if (entry.subcategories && Array.isArray(entry.subcategories)) {
    const validChildren = Object.keys(TAXONOMY[entry.primary].children || {});
    
    for (const sub of entry.subcategories) {
      if (!validChildren.includes(sub)) {
        return `Invalid subcategory "${sub}" for category "${entry.primary}"`;
      }
    }
  }

  // Check reason length if provided
  if (entry.reason && entry.reason.length > 500) {
    return 'Reason too long (max 500 characters)';
  }

  return null; // Valid
}

/**
 * Get all valid category names from taxonomy (excluding Tips)
 */
export function getValidCategories(): string[] {
  return Object.keys(TAXONOMY).filter(cat => cat !== 'Tips');
}

/**
 * Get valid subcategories for a given primary category
 */
export function getValidSubcategories(primaryCategory: string): string[] {
  const category = TAXONOMY[primaryCategory];
  if (!category || !category.children) {
    return [];
  }
  return Object.keys(category.children);
}

/**
 * Create a new override entry with timestamps
 */
export function createOverrideEntry(
  id: string,
  itemName: string,
  primary: string,
  subcategories: string[],
  reason?: string,
  sellerName?: string
): OverrideEntry {
  const now = new Date().toISOString();
  return {
    id: id.trim(),
    sellerName,
    itemName: itemName.trim(),
    primary,
    subcategories,
    reason: reason?.trim(),
    addedBy: 'admin',
    addedAt: now,
    lastModifiedAt: now,
  };
}

/**
 * Update an existing override entry
 */
export function updateOverrideEntry(
  existing: OverrideEntry,
  updates: {
    itemName?: string;
    primary?: string;
    subcategories?: string[];
    reason?: string;
  }
): OverrideEntry {
  return {
    ...existing,
    itemName: updates.itemName?.trim() ?? existing.itemName,
    primary: updates.primary ?? existing.primary,
    subcategories: updates.subcategories ?? existing.subcategories,
    reason: updates.reason?.trim() ?? existing.reason,
    lastModifiedAt: new Date().toISOString(),
  };
}

/**
 * Create an empty overrides data structure
 */
export function createEmptyOverridesData(): OverridesData {
  return {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    overrides: [],
  };
}
