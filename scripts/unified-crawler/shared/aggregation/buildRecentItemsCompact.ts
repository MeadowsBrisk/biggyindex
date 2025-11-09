import type { MarketCode } from '../env/loadEnv';
import { computeIndexSignature } from '../logic/changes';

export interface RawIndexItem {
  id: string;
  n?: string;
  name?: string;
  i?: string; // primary image
  imageUrl?: string;
  sid?: number; // seller id
  sellerId?: number;
  sn?: string; // seller name
  sellerName?: string;
  c?: string; // category
  category?: string;
  fsa?: string; // first seen at (ISO)
  firstSeenAt?: string;
  lua?: string; // last updated at (ISO)
  lastUpdatedAt?: string;
  refNum?: string | number;
  ref?: string | number;
  sl?: string; // share link/code
  share?: string;
  // passthrough raw for signature computation
  [k: string]: any;
}

export interface CompactRecentItem {
  id: string | null;
  refNum?: string | number | null;
  name?: string | null;
  imageUrl?: string | null;
  sellerId?: number | null;
  sellerName?: string | null;
  category?: string | null;
  createdAt?: string | null; // ISO timestamp used for ordering within list
  share?: string | null;
}

export interface RecentItemsCompactPayload {
  added: CompactRecentItem[];
  updated: CompactRecentItem[];
}

function toISO(v: any): string | null {
  if (!v) return null;
  try {
    if (typeof v === 'number') {
      const ms = v < 1e12 ? v * 1000 : v;
      return new Date(ms).toISOString();
    }
    const d = new Date(v);
    return isNaN(+d) ? null : d.toISOString();
  } catch { return null; }
}

export function buildRecentItemsCompact(rawItems: RawIndexItem[], limit: number): RecentItemsCompactPayload {
  const norm = rawItems.map(it => {
    const id = String(it?.id ?? it?.refNum ?? it?.ref ?? '').trim() || null;
    const refNum = it?.refNum ?? it?.ref ?? null;
    const name = it?.n ?? it?.name ?? null;
    const imageUrl = it?.i ?? it?.imageUrl ?? null;
    const sellerId = (it?.sid != null) ? Number(it.sid) : (it?.sellerId != null ? Number(it.sellerId) : null);
    const sellerName = it?.sn ?? it?.sellerName ?? null;
    const category = it?.c ?? it?.category ?? null;
    const fsa = it?.fsa ?? it?.firstSeenAt ?? null;
    const lua = it?.lua ?? it?.lastUpdatedAt ?? null;
    const share = it?.sl ?? it?.share ?? null;
    return { id, refNum, name, imageUrl, sellerId: Number.isFinite(sellerId) ? sellerId : null, sellerName, category, fsa, lua, share };
  });

  const added: CompactRecentItem[] = norm
    .filter(x => x.fsa)
    .sort((a, b) => {
      const da = Date.parse(a.fsa as string);
      const db = Date.parse(b.fsa as string);
      return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
    })
    .slice(0, limit)
    .map(x => ({ id: x.id, refNum: x.refNum ?? null, name: x.name ?? null, imageUrl: x.imageUrl ?? null, sellerId: x.sellerId ?? null, sellerName: x.sellerName ?? null, category: x.category ?? null, createdAt: toISO(x.fsa), share: x.share ?? null }));

  const updated: CompactRecentItem[] = norm
    .filter(x => x.lua)
    .sort((a, b) => {
      const da = Date.parse(a.lua as string);
      const db = Date.parse(b.lua as string);
      return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
    })
    .slice(0, limit)
    .map(x => ({ id: x.id, refNum: x.refNum ?? null, name: x.name ?? null, imageUrl: x.imageUrl ?? null, sellerId: x.sellerId ?? null, sellerName: x.sellerName ?? null, category: x.category ?? null, createdAt: toISO(x.lua), share: x.share ?? null }));

  return { added, updated };
}
