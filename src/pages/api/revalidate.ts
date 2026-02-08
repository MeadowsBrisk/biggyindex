import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * On-Demand ISR Revalidation API
 * 
 * Allows the unified crawler to trigger immediate page rebuilds after updating R2 data,
 * rather than waiting for the ISR safety-net timer (revalidate: 2400 = 40 minutes).
 * 
 * Security: Protected by REVALIDATE_SECRET_TOKEN via Authorization header.
 * 
 * Usage:
 *   POST /api/revalidate?path=/
 *   Authorization: Bearer YOUR_SECRET
 * 
 * Called by:
 *   - netlify/functions/crawler-index-*.ts (per-market indexers)
 *   - scripts/unified-crawler (CLI)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path = '/' } = req.query;

  // Read secret from Authorization header (preferred) or query param (legacy fallback)
  const authHeader = req.headers.authorization;
  const secret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.query.secret;

  // Validate secret token
  const expectedSecret = process.env.REVALIDATE_SECRET_TOKEN;
  if (!expectedSecret) {
    console.error('[revalidate] REVALIDATE_SECRET_TOKEN not configured');
    return res.status(500).json({ 
      revalidated: false, 
      error: 'Revalidation not configured' 
    });
  }

  if (secret !== expectedSecret) {
    console.warn('[revalidate] Invalid secret token attempt');
    return res.status(401).json({ 
      revalidated: false, 
      error: 'Invalid token' 
    });
  }

  try {
    const pathToRevalidate = typeof path === 'string' ? path : '/';
    console.log(`[revalidate] Triggering revalidation for: ${pathToRevalidate}`);
    
    await res.revalidate(pathToRevalidate);
    
    console.log(`[revalidate] Successfully revalidated: ${pathToRevalidate}`);
    return res.json({ 
      revalidated: true, 
      path: pathToRevalidate,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[revalidate] Error during revalidation:', err);
    return res.status(500).json({ 
      revalidated: false, 
      error: err?.message || 'Error revalidating',
      path: typeof path === 'string' ? path : '/'
    });
  }
}
