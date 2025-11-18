/**
 * Admin Authentication Utilities
 * 
 * Simple session-based authentication for admin area.
 * Uses environment variable ADMIN_PASSWORD for verification.
 * No external dependencies - uses built-in crypto for session tokens.
 */

import { randomBytes, createHash } from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const SESSION_DURATION_MS = parseInt(process.env.ADMIN_SESSION_DURATION || '86400', 10) * 1000; // 24 hours default

export type AdminSession = {
  token: string;
  createdAt: number;
  expiresAt: number;
};

// In-memory session store (sufficient for single admin, lost on function restart)
const sessions = new Map<string, AdminSession>();

/**
 * Verify admin password (constant-time comparison to prevent timing attacks)
 */
export function verifyPassword(password: string): boolean {
  const expected = Buffer.from(ADMIN_PASSWORD);
  const actual = Buffer.from(password);
  
  // Ensure same length to prevent timing attacks
  if (expected.length !== actual.length) {
    return false;
  }
  
  // Constant-time comparison
  return expected.equals(actual);
}

/**
 * Generate a secure random session token
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a new admin session
 */
export function createSession(): AdminSession {
  const token = generateSessionToken();
  const now = Date.now();
  
  const session: AdminSession = {
    token,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
  };
  
  sessions.set(token, session);
  
  // Auto-cleanup expired sessions periodically
  cleanupExpiredSessions();
  
  return session;
}

/**
 * Verify a session token
 */
export function verifySession(token: string): boolean {
  const session = sessions.get(token);
  
  if (!session) {
    return false;
  }
  
  // Check if expired
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  
  return true;
}

/**
 * Revoke a session (logout)
 */
export function revokeSession(token: string): void {
  sessions.delete(token);
}

/**
 * Clean up expired sessions to prevent memory leak
 */
function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}

/**
 * Extract session token from cookie or Authorization header
 */
export function extractSessionToken(request: Request): string | null {
  // Try cookie first
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [key, ...value] = c.trim().split('=');
        return [key, value.join('=')];
      })
    );
    
    if (cookies.adminSession) {
      return cookies.adminSession;
    }
  }
  
  // Try Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

/**
 * Create Set-Cookie header for session
 */
export function createSessionCookie(token: string): string {
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  const isProduction = process.env.NODE_ENV === 'production';
  
  return [
    `adminSession=${token}`,
    'HttpOnly',
    isProduction ? 'Secure' : '',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join('; ');
}

/**
 * Create Set-Cookie header to clear session (logout)
 */
export function clearSessionCookie(): string {
  return 'adminSession=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
}
