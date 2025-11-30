import type { NextApiRequest, NextApiResponse } from 'next';
import { getManifest, getSnapshotMeta } from '@/lib/data/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market/market';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const meta: any = await getSnapshotMeta(mkt);
  const manifest: any = await getManifest(mkt);
  
  // Safety check: if manifest is empty, don't cache it (likely a blob read failure)
  const isEmpty = !manifest || Object.keys(manifest.categories || {}).length === 0;
  if (isEmpty) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  
  const version: string = meta?.version || `${manifest.totalItems || 0}-${Object.keys(manifest.categories||{}).length}`;
  const updatedAt: string = meta?.updatedAt || new Date().toISOString();
  await conditionalJSON(req as any, res as any, {
    prefix: `manifest-${mkt}`,
    version,
    updatedAt,
    // Don't cache empty manifests
    ...(isEmpty ? { cacheControl: 'no-store, no-cache, must-revalidate' } : {}),
    getBody: async () => {
      const categories: Record<string, any> = {};
      for (const [name, info] of Object.entries(manifest.categories || {})) {
        const endpoint = `/api/index/category/${encodeURIComponent(name)}?mkt=${encodeURIComponent(mkt)}`;
        (categories as any)[name] = { ...(info as any), endpoint };
      }
      return { ...manifest, categories, dynamic: true, version, updatedAt };
    }
  });
}
