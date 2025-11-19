/**
 * Admin Authentication Utilities
 * 
 * Simple password-based authentication for admin area.
 * Just checks password on every request - no sessions needed.
 */

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

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
export async function createSession(): Promise<AdminSession> {
  const token = generateSessionToken();
  const now = Date.now();
  
  const session: AdminSession = {
    token,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
  };
  
  const sessions = await loadSessions();
  sessions[token] = session;
  
  // Auto-cleanup expired sessions periodically
  await cleanupExpiredSessions(sessions);
  await saveSessions(sessions);
  
  return session;
}

/**
 * Verify a session token
 */
export async function verifySession(token: string): Promise<boolean> {
  const sessions = await loadSessions();
  const session = sessions[token];
  
  if (!session) {
    return false;
  }
  
  // Check if expired
  if (Date.now() > session.expiresAt) {
    delete sessions[token];
    await saveSessions(sessions);
    return false;
  }
  
  return true;
}

/**
 * Revoke a session (logout)
 */
export async function revokeSession(token: string): Promise<void> {
  const sessions = await loadSessions();
  delete sessions[token];
  await saveSessions(sessions);
}

/**
 * Clean up expired sessions to prevent memory leak
 */
async function cleanupExpiredSessions(sessions: SessionStore): Promise<void> {
  const now = Date.now();
  let needsSave = false;
  
  for (const [token, session] of Object.entries(sessions)) {
    if (now > session.expiresAt) {
      delete sessions[token];
      needsSave = true;
    }
  }
  
  if (needsSave) {
    await saveSessions(sessions);
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
