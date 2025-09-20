import { getAllItems, getSnapshotMeta } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const meta = await getSnapshotMeta();
  const items = await getAllItems();
  const updatedAt = meta?.updatedAt || new Date().toISOString();
  const version = meta?.version || `${items.length.toString(36)}-${items[0]?.id || 'na'}-${items[items.length-1]?.id || 'na'}`;
  await conditionalJSON(req, res, {
    prefix: 'items',
    version,
    updatedAt,
    getBody: async () => ({ items, count: items.length, dynamic: true, version, updatedAt })
  });
}
