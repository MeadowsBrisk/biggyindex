/**
 * Delete Category Override Endpoint
 * DELETE /api/admin/overrides/:id
 * 
 * Remove a specific override by item ID.
 */

import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { isAuthenticated, unauthorizedResponse } from '../lib/auth';
import { OVERRIDES_KEY, type OverridesData, createEmptyOverridesData } from '../lib/categoryOverrides';
import { syncToR2 } from '../lib/r2Sync';

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
  // Only allow DELETE
  if (request.method !== 'DELETE') {
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
    // Extract ID from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const id = pathParts[pathParts.length - 1];

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Item ID required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const store = getStore('site-index-shared');

    // Load current overrides
    let data: OverridesData;
    try {
      const blob = await store.get(OVERRIDES_KEY, { type: 'json' });
      data = blob as OverridesData || createEmptyOverridesData();
    } catch {
      data = createEmptyOverridesData();
    }

    // Find and remove override
    const initialLength = data.overrides.length;
    data.overrides = data.overrides.filter(o => o.id !== id);

    if (data.overrides.length === initialLength) {
      return new Response(
        JSON.stringify({ success: false, error: 'Override not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Update timestamp and save
    data.updatedAt = new Date().toISOString();
    await store.setJSON(OVERRIDES_KEY, data);

    // Sync to R2 (non-blocking, won't throw)
    await syncToR2('site-index-shared', OVERRIDES_KEY, data);

    return new Response(
      JSON.stringify({ success: true, id }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('[admin/overrides/delete] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const config = {
  path: '/api/category-dash/overrides/*',
};
