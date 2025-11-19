/**
 * Admin Logout Endpoint
 * POST /api/admin/logout
 * 
 * Revokes current session.
 */

import type { Context } from '@netlify/functions';
import { revokeSession, extractSessionToken, clearSessionCookie } from '../lib/auth';

export default async (request: Request, context: Context) => {
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const token = extractSessionToken(request);
    
    if (token) {
      await revokeSession(token);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': clearSessionCookie(),
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
