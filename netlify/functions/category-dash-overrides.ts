/**
 * Category Overrides Management Endpoint
 * GET/POST /api/admin/overrides
 * 
 * Get all overrides or add/update an override.
 */

import type { Context } from '@netlify/functions';
import { isAuthenticated, unauthorizedResponse } from '../lib/auth';
import { checkRateLimit } from '../lib/rateLimit';
import {
  OVERRIDES_KEY,
  type OverridesData,
  type OverrideEntry,
  validateOverride,
  createOverrideEntry,
  updateOverrideEntry,
  createEmptyOverridesData,
} from '../lib/categoryOverrides';
import { readFromR2, writeToR2 } from '../lib/r2Sync';

// Middleware: require authentication
function requireAuth(request: Request): Response | null {
  if (!isAuthenticated(request)) {
    return unauthorizedResponse();
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

  try {
    // GET: Return all overrides with existence check
    if (request.method === 'GET') {
      let data: OverridesData;
      
      try {
        data = await readFromR2<OverridesData>('site-index-shared', OVERRIDES_KEY) || createEmptyOverridesData();
      } catch {
        data = createEmptyOverridesData();
      }

      // Check which items still exist in the index (use GB market as default)
      let currentItems: any[] = [];
      try {
        currentItems = await readFromR2<any[]>('site-index-gb', 'indexed_items.json') || [];
      } catch {}

      // Build set of current item IDs for fast lookup
      const currentItemIds = new Set<string>();
      for (const item of currentItems) {
        const id = String(item.refNum || item.ref || item.id);
        if (id) currentItemIds.add(id);
      }

      // Add exists flag to each override
      const overridesWithStatus = data.overrides.map(override => ({
        ...override,
        exists: currentItemIds.has(override.id),
      }));

      return new Response(
        JSON.stringify({ 
          ...data, 
          overrides: overridesWithStatus 
        }), 
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // POST: Add or update override
    if (request.method === 'POST') {
      const body = await request.json();
      const { id, itemName, sellerName, primary, subcategories, reason } = body;

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
        data = await readFromR2<OverridesData>('site-index-shared', OVERRIDES_KEY) || createEmptyOverridesData();
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
        // Preserve sellerName if it exists
        if (sellerName && !existing.sellerName) {
          override.sellerName = sellerName;
        }
        data.overrides[existingIndex] = override;
      } else {
        // Add new
        override = createOverrideEntry(id, itemName, primary, subcategories || [], reason, sellerName);
        data.overrides.push(override);
      }

      // Update timestamp
      data.updatedAt = new Date().toISOString();

      // Save to R2
      await writeToR2('site-index-shared', OVERRIDES_KEY, data);

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
