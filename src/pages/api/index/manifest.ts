import type { NextApiRequest, NextApiResponse } from 'next';
import { getManifest, getSnapshotMeta } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const meta: any = await getSnapshotMeta(mkt);
  const manifest: any = await getManifest(mkt);
  const version: string = meta?.version || `${manifest.totalItems || 0}-${Object.keys(manifest.categories||{}).length}`;
  const updatedAt: string = meta?.updatedAt || new Date().toISOString();
  await conditionalJSON(req as any, res as any, {
    prefix: `manifest-${mkt}`,
    version,
    updatedAt,
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
