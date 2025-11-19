/**
 * Item Search Endpoint
 * GET /api/admin/items/search?q=query&market=gb
 * 
 * Search for items to add overrides.
 */

import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { isAuthenticated, unauthorizedResponse } from '../lib/auth';

// Middleware: require authentication
function requireAuth(request: Request): Response | null {
  if (!isAuthenticated(request)) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  
  return null;
}

export default async (request: Request, context: Context) => {
  // Only allow GET
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Check authentication
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const market = url.searchParams.get('market') || 'gb';

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ results: [] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Load market index
    const storeName = `site-index-${market.toLowerCase()}`;
    const store = getStore(storeName);
    
    let items: any[] = [];
    try {
      const blob = await store.get('indexed_items.json', { type: 'json' });
      items = (blob as any) || [];
      console.log(`[items-search] Loaded ${items.length} items from ${storeName}/indexed_items.json`);
    } catch (e) {
      console.error(`[items-search] Failed to load items from ${storeName}:`, e);
      items = [];
    }

    // Search by name or ID (case-insensitive)
    const queryLower = query.toLowerCase();
    const matches = items.filter((item: any) => {
      const name = (item.n || item.name || '').toLowerCase();
      const id = String(item.id || '').toLowerCase();
      const refNum = String(item.refNum || item.ref || '').toLowerCase();
      
      return name.includes(queryLower) || 
             id.includes(queryLower) || 
             refNum.includes(queryLower);
    });

    // Limit to 50 results
    const results = matches.slice(0, 50).map((item: any) => ({
      id: String(item.refNum || item.ref || item.id),
      name: item.n || item.name,
      description: item.d || item.description || '',
      category: item.c || item.category,
      subcategories: item.sc || item.subcategories || [],
      imageUrl: item.i || item.imageUrl,
      seller: item.sn || item.sellerName,
    }));

    return new Response(
      JSON.stringify({ results }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('[admin/items/search] Error:', err);
    return new Response(
      JSON.stringify({ results: [], error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const config = {
  path: '/api/category-dash/items/search',
};
