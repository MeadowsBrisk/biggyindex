import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const legacyPath = path.join(process.cwd(), 'public', 'item-crawler', 'index-supplement.js');
  const jsonPath = path.join(process.cwd(), 'public', 'item-crawler', 'index-supplement.json');

  let body: string | null = null;
  let storage: 'fs' | 'blob' | 'miss' = 'miss';
  if (fs.existsSync(jsonPath)) {
    try {
      body = fs.readFileSync(jsonPath, 'utf8');
      storage = 'fs';
    } catch {}
  }
  if (!body && fs.existsSync(legacyPath)) {
    try {
      const js = fs.readFileSync(legacyPath, 'utf8');
      const cleaned = js.replace(/\r?\n/g, '\n');
      const m = cleaned.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
      if (m && m[1]) {
        body = m[1];
        storage = 'fs';
      }
    } catch {}
  }

  if (!body) {
    try {
      const store = process.env.CRAWLER_BLOBS_STORE || 'site-index';
      const prefix = (process.env.CRAWLER_BLOBS_PREFIX || 'item-crawler/').replace(/\/+$/,'/')
      const mod: any = await import('@netlify/blobs').catch(()=>null);
      if (mod && mod.createClient) {
        const client = mod.createClient({ bucket: store });
        const blobJson: any = await client.get(prefix + 'index-supplement.json');
        if (blobJson && blobJson.body) {
          body = blobJson.body as string;
          storage = 'blob';
        } else {
          const blobJs: any = await client.get(prefix + 'index-supplement.js');
          if (blobJs && blobJs.body) {
            body = blobJs.body as string;
            storage = 'blob';
          }
        }
      }
    } catch {}
  }

  if (!body) {
    try { res.setHeader('X-Crawler-Storage','miss'); } catch {}
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.setHeader('Content-Type','application/json');
  try { res.setHeader('X-Crawler-Storage', storage); } catch {}
  res.status(200).send(body);
}
