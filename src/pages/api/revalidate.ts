import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * On-Demand ISR Revalidation API
 * 
 * Allows the unified crawler to trigger immediate page rebuilds after updating blobs,
 * rather than waiting for the ISR timer (revalidate: 1000 = ~16 minutes).
 * 
 * Security: Protected by REVALIDATE_SECRET_TOKEN environment variable.
 * 
 * Usage:
 *   POST /api/revalidate?secret=YOUR_SECRET&path=/
 *   POST /api/revalidate?secret=YOUR_SECRET&path=/de
 * 
 * Called by:
 *   - netlify/functions/crawler-index-*.ts (per-market indexers)
 *   - netlify/functions/crawler-all-markets-background.ts (orchestrator)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { secret, path = '/' } = req.query;

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
