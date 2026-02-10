import type { NextApiRequest, NextApiResponse } from 'next';
import { readR2JSON, writeR2JSON } from '@/lib/data/r2Client';

/**
 * Lightweight outbound click tracking endpoint.
 *
 * Receives beacon POST from the client when a user clicks "View on Little Biggy".
 * Persists clicks to R2 as daily JSON files: outbound/YYYY-MM-DD.json
 * Each file contains an array of click events for that day.
 *
 * POST /api/track/outbound
 * Body: { id, type, url, market?, category?, ts, page }
 */

export const config = { runtime: 'nodejs' };

const R2_PREFIX = 'outbound';

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${R2_PREFIX}/${yyyy}-${mm}-${dd}.json`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body?.id) {
      res.status(204).end();
      return;
    }

    const click = {
      id: String(body.id),
      type: body.type || 'item',
      url: body.url || '',
      market: body.market || '',
      category: body.category || '',
      page: body.page || '/',
      ts: body.ts || Date.now(),
    };

    // Read today's file, append, write back
    // Low-volume endpoint — race conditions are negligible
    const key = todayKey();
    const existing: any[] = (await readR2JSON<any[]>(key)) || [];
    existing.push(click);
    await writeR2JSON(key, existing);

    res.status(204).end();
  } catch (e: any) {
    // Never block the user — log and return 204 anyway
    console.error('[outbound] R2 write error:', e?.message || e);
    res.status(204).end();
  }
}
