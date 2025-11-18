/**
 * Admin API Client
 * 
 * Type-safe client functions for admin endpoints.
 */

import type { OverrideEntry, OverridesData } from '../categoryOverrides';

export type SearchResult = {
  id: string;
  name: string;
  category: string;
  subcategories: string[];
  imageUrl?: string;
  seller?: string;
};

/**
 * Check if user is authenticated (has valid session)
 */
export async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch('/api/category-dash/overrides', {
      method: 'GET',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Logout (revoke session)
 */
export async function logout(): Promise<void> {
  await fetch('/api/category-dash/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

/**
 * Fetch all category overrides
 */
export async function fetchOverrides(): Promise<OverridesData> {
  const res = await fetch('/api/category-dash/overrides', {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Not authenticated' : 'Failed to fetch overrides');
  }

  return res.json();
}

/**
 * Add or update a category override
 */
export async function saveOverride(override: {
  id: string;
  itemName: string;
  primary: string;
  subcategories: string[];
  reason?: string;
}): Promise<OverrideEntry> {
  const res = await fetch('/api/category-dash/overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(override),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to save override');
  }

  const data = await res.json();
  return data.override;
}

/**
 * Delete a category override
 */
export async function deleteOverride(id: string): Promise<void> {
  const res = await fetch(`/api/category-dash/overrides/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete override');
  }
}

/**
 * Search for items
 */
export async function searchItems(query: string, market: string = 'gb'): Promise<SearchResult[]> {
  if (!query || query.length < 2) {
    return [];
  }

  const params = new URLSearchParams({ q: query, market });
  const res = await fetch(`/api/category-dash/items/search?${params}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error('Failed to search items');
  }

  const data = await res.json();
  return data.results || [];
}
