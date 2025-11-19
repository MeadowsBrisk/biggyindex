/**
 * Admin Authentication Utilities
 * 
 * Simple password-based authentication - check password on every request.
 * Frontend stores password in memory and sends it with each API call.
 */

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

/**
 * Verify admin password
 */
export function verifyPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

/**
 * Extract password from Authorization header (Bearer token)
 */
export function extractPassword(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Check if request is authenticated
 */
export function isAuthenticated(request: Request): boolean {
  const password = extractPassword(request);
  return password ? verifyPassword(password) : false;
}

/**
 * Return 401 response
 */
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Authentication required' }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
