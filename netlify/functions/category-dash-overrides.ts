/**
 * Category Overrides Management Endpoint
 * GET/POST /api/admin/overrides
 * 
 * Get all overrides or add/update an override.
 */

import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { verifySession, extractSessionToken } from '../../../src/lib/category-dash/auth';
import { checkRateLimit } from '../../../src/lib/category-dash/rateLimit';
import {
  OVERRIDES_KEY,
  type OverridesData,
  type OverrideEntry,
  validateOverride,
  createOverrideEntry,
  updateOverrideEntry,
  createEmptyOverridesData,
} from '../../../src/lib/categoryOverrides';

// Middleware: require authentication
function requireAuth(request: Request): Response | null {
  const token = extractSessionToken(request);
  
  if (!token || !verifySession(token)) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  
  return null; // Authorized
}

export default async (request: Request, context: Context) => {
  // Check authentication
  const authError = requireAuth(request);
  if (authError) return authError;

  // Rate limit: 30 requests per minute
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(clientIP, 30, 60 * 1000)) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const store = getStore('site-index-shared');

  try {
    // GET: Return all overrides
    if (request.method === 'GET') {
      let data: OverridesData;
      
      try {
        const blob = await store.get(OVERRIDES_KEY, { type: 'json' });
        data = blob as OverridesData || createEmptyOverridesData();
      } catch {
        data = createEmptyOverridesData();
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST: Add or update override
    if (request.method === 'POST') {
      const body = await request.json();
      const { id, itemName, primary, subcategories, reason } = body;

      // Validate input
      const validationError = validateOverride({ id, itemName, primary, subcategories, reason });
      if (validationError) {
        return new Response(
          JSON.stringify({ success: false, error: validationError }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Load current overrides
      let data: OverridesData;
      try {
        const blob = await store.get(OVERRIDES_KEY, { type: 'json' });
        data = blob as OverridesData || createEmptyOverridesData();
      } catch {
        data = createEmptyOverridesData();
      }

      // Check if override already exists
      const existingIndex = data.overrides.findIndex(o => o.id === id);
      let override: OverrideEntry;

      if (existingIndex >= 0) {
        // Update existing
        const existing = data.overrides[existingIndex];
        override = updateOverrideEntry(existing, { itemName, primary, subcategories, reason });
        data.overrides[existingIndex] = override;
      } else {
        // Add new
        override = createOverrideEntry(id, itemName, primary, subcategories || [], reason);
        data.overrides.push(override);
      }

      // Update timestamp
      data.updatedAt = new Date().toISOString();

      // Save to blob
      await store.setJSON(OVERRIDES_KEY, data);

      return new Response(
        JSON.stringify({ success: true, override }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Method not allowed
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('[admin/overrides] Error:', err);
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
  path: '/api/category-dash/overrides',
};
