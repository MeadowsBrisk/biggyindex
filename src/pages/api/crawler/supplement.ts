import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const legacyPath = path.join(process.cwd(), 'public', 'item-crawler', 'index-supplement.js');
  const jsonPath = path.join(process.cwd(), 'public', 'item-crawler', 'index-supplement.json');

  let body: string | null = null;
  if (fs.existsSync(jsonPath)) {
    try {
      body = fs.readFileSync(jsonPath, 'utf8');
    } catch {}
  }
  if (!body && fs.existsSync(legacyPath)) {
    try {
      const js = fs.readFileSync(legacyPath, 'utf8');
      const cleaned = js.replace(/\r?\n/g, '\n');
      const m = cleaned.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
      if (m && m[1]) {
        body = m[1];
      }
    } catch {}
  }

  if (!body) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.setHeader('Content-Type','application/json');
  res.status(200).send(body);
}
