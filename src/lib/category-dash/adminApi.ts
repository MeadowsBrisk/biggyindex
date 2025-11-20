/**
 * Admin API Client
 * 
 * Type-safe client functions for admin endpoints.
 * Password is stored in sessionStorage and sent with every request.
 */

import type { OverrideEntry, OverridesData } from '../categoryOverrides';

export type SearchResult = {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategories: string[];
  imageUrl?: string;
  seller?: string;
};

/**
 * Get stored password from sessionStorage
 */
function getPassword(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('adminPassword');
}

/**
 * Get auth headers with password
 */
function getAuthHeaders(): HeadersInit {
  const password = getPassword();
  return password ? { 'Authorization': `Bearer ${password}` } : {};
}

/**
 * Check if user is authenticated (has password stored)
 */
export async function checkAuth(): Promise<boolean> {
  const password = getPassword();
  if (!password) return false;
  
  try {
    const res = await fetch('/api/category-dash/overrides', {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Logout (clear password from storage)
 */
export async function logout(): Promise<void> {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('adminPassword');
  }
  await fetch('/api/category-dash/logout', {
    method: 'POST',
  });
}

/**
 * Fetch all category overrides
 */
export async function fetchOverrides(): Promise<OverridesData> {
  const res = await fetch('/api/category-dash/overrides', {
    method: 'GET',
    headers: getAuthHeaders(),
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
  sellerName?: string;
  primary: string;
  subcategories: string[];
  reason?: string;
}): Promise<OverrideEntry> {
  const res = await fetch('/api/category-dash/overrides', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
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
    headers: getAuthHeaders(),
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
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error('Failed to search items');
  }

  const data = await res.json();
  return data.results || [];
}
