import { getSellers, getSnapshotMeta } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const meta = await getSnapshotMeta();
  const sellers = await getSellers();
  const updatedAt = meta?.updatedAt || new Date().toISOString();
  const version = meta?.version || sellers.length.toString(36);
  await conditionalJSON(req, res, {
    prefix: 'sellers',
    version,
    updatedAt,
    getBody: async () => ({ sellers, count: sellers.length, dynamic: true, version, updatedAt })
  });
}
