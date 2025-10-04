import { getSellerAnalytics } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const analytics = await getSellerAnalytics();
  const updatedAt = analytics?.generatedAt || new Date().toISOString();
  const version = analytics?.totalSellers?.toString(36) || '0';
  await conditionalJSON(req, res, {
    prefix: 'seller-analytics',
    version,
    updatedAt,
    getBody: async () => ({ ...analytics, dynamic: true })
  });
}
