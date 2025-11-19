/**
 * Admin Logout Endpoint
 * POST /api/category-dash/logout
 * 
 * No-op endpoint - frontend just clears password from memory.
 */

import type { Context } from '@netlify/functions';

export default async (request: Request, context: Context) => {
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // No server-side session to revoke - frontend just clears password
    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('[admin/logout] Error:', err);
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
  path: '/api/category-dash/logout',
};
