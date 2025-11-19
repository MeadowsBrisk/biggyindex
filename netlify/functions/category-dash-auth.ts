/**
 * Admin Authentication Endpoint
 * POST /api/admin/auth
 * 
 * Verifies password and creates session.
 */

import type { Context } from '@netlify/functions';
import { verifyPassword, createSession, createSessionCookie, revokeSession, extractSessionToken, clearSessionCookie } from '../lib/auth';
import { checkRateLimit } from '../lib/rateLimit';

export default async (request: Request, context: Context) => {
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get client IP for rate limiting
  const clientIP = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown';

  // Rate limit: 5 attempts per 10 minutes
  if (!checkRateLimit(clientIP, 5, 10 * 60 * 1000)) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Too many login attempts. Please try again later.' 
      }), 
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Password required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify password
    if (!verifyPassword(password)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid password' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Create session
    const session = await createSession();

    // Return success with session cookie
    return new Response(
      JSON.stringify({ 
        success: true,
        expiresAt: session.expiresAt,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': createSessionCookie(session.token),
        },
      }
    );
  } catch (err) {
    console.error('[admin/auth] Error:', err);
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
  path: '/api/category-dash/auth',
};
