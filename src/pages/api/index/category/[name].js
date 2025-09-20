import { getCategoryItems, getSnapshotMeta } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const name = req.query.name || '';
  const meta = await getSnapshotMeta();
  const items = await getCategoryItems(name);
  const updatedAt = meta?.updatedAt || new Date().toISOString();
  const version = meta?.version || `${name}-${items.length.toString(36)}`;
  await conditionalJSON(req, res, {
    prefix: `cat-${encodeURIComponent(name)}`,
    version,
    updatedAt,
    getBody: async () => ({ items, category: name, count: items.length, dynamic: true, version, updatedAt })
  });
}
