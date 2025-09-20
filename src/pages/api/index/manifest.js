import { getManifest, getSnapshotMeta } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const meta = await getSnapshotMeta();
  const manifest = await getManifest();
  const version = meta?.version || `${manifest.totalItems || 0}-${Object.keys(manifest.categories||{}).length}`;
  const updatedAt = meta?.updatedAt || new Date().toISOString();
  await conditionalJSON(req, res, {
    prefix: 'manifest',
    version,
    updatedAt,
    getBody: async () => {
      const categories = {};
      for (const [name, info] of Object.entries(manifest.categories || {})) {
        categories[name] = { ...info, endpoint: `/api/index/category/${encodeURIComponent(name)}` };
      }
      return { ...manifest, categories, dynamic: true, version, updatedAt };
    }
  });
}
