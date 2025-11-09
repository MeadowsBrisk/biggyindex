// Build per-market sellers list from raw API items and review summaries
// Output shape matches legacy sellers.json entries used by the frontend

export type SellerReviewSummary = {
  averageRating?: number | null;
  averageDaysToArrive?: number | null;
  numberOfReviews?: number | null;
};

export function buildMarketSellers({
  rawItems,
  marketIndexItems,
  sellerReviewSummaries,
}: {
  rawItems: any[];
  marketIndexItems: Array<Record<string, any>>;
  sellerReviewSummaries?: Record<string, SellerReviewSummary> | null;
}): Array<Record<string, any>> {
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, { sid: number | string | null; sn: string | null }>();

  for (const e of marketIndexItems as Array<Record<string, any>>) {
    const sid = (e as any).sid ?? null;
    const sn = ((e as any).sn != null ? String((e as any).sn) : null);
    const key = (sid != null) ? `id:${String(sid)}` : `name:${sn || ''}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!firstSeen.has(key)) firstSeen.set(key, { sid: sid ?? null, sn: sn || null });
  }

  // Online flags sourced from raw items; prefer 'today' if any item reports it
  const onlineMap = new Map<string, 'today' | 'yesterday' | null>();
  try {
    for (const it of Array.isArray(rawItems) ? rawItems : []) {
      const sid = it?.seller?.id ?? it?.sellerId ?? null;
      const sn = it?.seller?.name ?? null;
      const online = (it?.seller?.online ?? null) as any;
      if (sid == null && !sn) continue;
      const k = (sid != null) ? `id:${String(sid)}` : `name:${String(sn || '')}`;
      const prev = onlineMap.get(k) || null;
      if (online === 'today') onlineMap.set(k, 'today');
      else if (online === 'yesterday' && prev !== 'today') onlineMap.set(k, 'yesterday');
      else if (!prev && online) onlineMap.set(k, null);
    }
  } catch {}

  const srs = sellerReviewSummaries || {};
  const out: Array<Record<string, any>> = [];
  for (const [k, cnt] of counts) {
    const base = firstSeen.get(k) || { sid: null, sn: null };
    const sid = base.sid;
    const sn = base.sn || '';
    const online = onlineMap.get(k) ?? null;
    const stats = (sid != null && (srs as any)[String(sid)]) ? (srs as any)[String(sid)] : null;
    const url = (sid != null) ? `https://littlebiggy.net/viewSubject/p/${String(sid)}` : null;
    out.push({
      id: sid ?? null,
      sellerRef: null,
      name: sn,
      url,
      online,
      itemsCount: cnt,
      averageRating: stats?.averageRating ?? null,
      averageDaysToArrive: stats?.averageDaysToArrive ?? null,
      numberOfReviews: stats?.numberOfReviews ?? null,
    });
  }

  // Sort by numberOfReviews desc, then name asc
  out.sort((a, b) => {
    const nrA = Number(a.numberOfReviews || 0);
    const nrB = Number(b.numberOfReviews || 0);
    if (nrB !== nrA) return nrB - nrA;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return out;
}
 
