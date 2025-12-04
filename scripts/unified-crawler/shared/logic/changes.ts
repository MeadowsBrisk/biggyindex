import type { MarketCode } from "../types";
import { getBlobClient, type BlobClient } from "../persistence/blobs";

export interface DetectChangesInput {
  market: MarketCode;
  items: Array<{ id: string; n?: string; sig?: string | null }>;
  fullCrawlDays?: number; // default 14
}

export interface DetectChangesResult {
  newIds: string[]; // not present in shared core
  staleIds: string[]; // present but older than threshold (based on lastFullCrawl/lastDescriptionRefresh/lastReviewsRefresh)
  changedIds?: string[]; // signature mismatch vs provided index signature
  fullCrawlIds: string[]; // union of newIds and staleIds
}

// Minimal change detection for Phase A:
// - "New": id not found in shared core
// - "Stale": lastFullCrawl OR lastDescriptionRefresh OR lastReviewsRefresh older than N days
// NB: This uses shared store metadata; we do not diff per-market lightweight index yet.
export async function detectItemChanges(
  input: DetectChangesInput,
  opts: { sharedStoreName: string; sharedClient?: BlobClient } 
): Promise<DetectChangesResult> {
  const days = Math.max(1, input.fullCrawlDays ?? 14);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const shared = opts.sharedClient || getBlobClient(opts.sharedStoreName);

  // List all existing item cores once (key shape: items/<id>.json)
  const keys = await shared.list("items/");
  const existingIds = new Set(
    keys
      .map((k) => k.match(/^items\/(.+)\.json$/)?.[1] || "")
      .filter(Boolean)
  );

  const newIds: string[] = [];
  const staleIds: string[] = [];
  const changedIds: string[] = [];

  // Quick pass to find news; we'll only fetch metadata for known existing items
  for (const it of input.items) {
    if (!it?.id) continue;
    if (!existingIds.has(it.id)) newIds.push(it.id);
  }

  // For staleness, use shipping-meta aggregate (one file instead of 100+ individual loads!)
  const shippingMeta = await shared.getJSON<any>('aggregates/shipping-meta.json').catch(() => ({}));
  
  const existingToCheck = input.items
    .map((it) => ({ id: it.id, sig: it.sig }))
    .filter((it) => existingIds.has(it.id));

  // Check staleness from aggregate metadata (fast!)
  for (const { id, sig } of existingToCheck) {
    const metaEntry = shippingMeta[id];
    
    // Stale if: no metadata entry OR lastRefresh older than cutoff
    if (!metaEntry || !metaEntry.lastRefresh) {
      staleIds.push(id);
    } else {
      const lastRefreshTime = new Date(metaEntry.lastRefresh).getTime();
      if (lastRefreshTime < cutoff) {
        staleIds.push(id);
      }
    }
    
    // Note: Cannot check signature changes from shipping-meta (doesn't track them)
    // Signature changes are rare; indexer marks items as "updated" anyway
  }

  const fullCrawlIds = Array.from(new Set([...newIds, ...staleIds, ...changedIds]));
  return { newIds, staleIds, changedIds, fullCrawlIds };
}

// Compute a stable signature from a market index entry (minimal, global-friendly)
// Recommended fields: seller id (sid), USD price bounds (uMin/uMax), variant count
// Avoid fields that change frequently but don’t require full recrawl (e.g., hotness)
export function computeIndexSignature(entry: Record<string, any>): string {
  const sid = entry?.sid ?? null;
  const uMin = entry?.uMin ?? null;
  const uMax = entry?.uMax ?? null;
  const vlen = Array.isArray(entry?.v) ? entry.v.length : 0;
  // Stable pipe-joined string; cheap and deterministic
  return `${sid ?? ''}|${uMin ?? ''}|${uMax ?? ''}|${vlen}`;
}

// Diff two compact market index entries and return human-readable reasons
// Mirrors legacy indexer semantics: Description/Images/Variants/Price bounds
// NOTE: Description comparison only meaningful for GB market (English source)
// Non-GB markets have translated descriptions so we skip that comparison
// Pass isEnglishMarket=true for GB, false for others
export function diffMarketIndexEntries(prev: Record<string, any> | null | undefined, curr: Record<string, any>, isEnglishMarket = true) {
  const reasons: string[] = [];
  if (!prev || typeof prev !== 'object') return { changed: false, reasons };
  try {
    // Description: only compare for English market (GB)
    // Non-GB markets have translated d, can't reliably compare against English curr.d
    if (isEnglishMarket) {
      const prevDesc: string = prev?.d ?? prev?.description ?? '';
      const curDesc: string = curr?.d ?? '';
      if (prevDesc !== curDesc) reasons.push('Description changed');
    }

    // Images: primary or thumbnail count
    const prevPrimary = prev?.i ?? null;
    const curPrimary = curr?.i ?? null;
    const prevThumbCount = Array.isArray(prev?.is) ? prev.is.length : 0;
    const curThumbCount = Array.isArray(curr?.is) ? curr.is.length : 0;
    if (prevPrimary !== curPrimary || prevThumbCount !== curThumbCount) reasons.push('Images changed');

    // Variants comparison
    const prevV: Array<Record<string, any>> = Array.isArray(prev?.v) ? prev.v : [];
    const curV: Array<Record<string, any>> = Array.isArray(curr?.v) ? curr.v : [];
    
    if (isEnglishMarket) {
      // GB market: compare by description + price (full comparison)
      const toKey = (x: any) => `${x?.d ?? ''}|${typeof x?.usd === 'number' ? x.usd : ''}`;
      const prevSet = new Set(prevV.map(toKey));
      const curSet = new Set(curV.map(toKey));
      
      let added = 0, removed = 0;
      for (const k of curSet) if (!prevSet.has(k)) added++;
      for (const k of prevSet) if (!curSet.has(k)) removed++;
      
      // Price change detection by description
      const prevDescMap: Record<string, Set<number>> = {};
      for (const pv of prevV) {
        const d = pv?.d ?? '';
        const amt = (typeof pv?.usd === 'number' ? pv.usd : NaN);
        if (!prevDescMap[d]) prevDescMap[d] = new Set<number>();
        if (Number.isFinite(amt)) prevDescMap[d].add(amt);
      }
      let priceChanged = 0;
      for (const cv of curV) {
        const d = cv?.d ?? '';
        const amt = (typeof cv?.usd === 'number' ? cv.usd : NaN);
        if (!Number.isFinite(amt)) continue;
        const set = prevDescMap[d];
        if (set && !set.has(amt)) priceChanged++;
      }
      
      if (priceChanged) reasons.push('Price changed');
      if (added || removed) {
        const label = (added && removed)
          ? `+${added} / -${removed} variants`
          : (added ? `+${added} variants` : `-${removed} variants`);
        reasons.push(label);
      }
    } else {
      // Non-GB markets: compare by COUNT and PRICES only (not descriptions)
      // This avoids false positives from translated vs English description mismatches
      
      // Count change
      if (prevV.length !== curV.length) {
        const diff = curV.length - prevV.length;
        if (diff > 0) reasons.push(`+${diff} variants`);
        else reasons.push(`${diff} variants`);
      }
      
      // Price set comparison (ignoring descriptions)
      const prevPrices = prevV.map(v => typeof v?.usd === 'number' ? v.usd : null).filter(p => p !== null).sort((a, b) => (a as number) - (b as number));
      const curPrices = curV.map(v => typeof v?.usd === 'number' ? v.usd : null).filter(p => p !== null).sort((a, b) => (a as number) - (b as number));
      
      // Compare sorted price arrays
      const pricesMatch = prevPrices.length === curPrices.length && 
        prevPrices.every((p, i) => p === curPrices[i]);
      
      if (!pricesMatch && prevV.length === curV.length) {
        // Same count but different prices
        reasons.push('Price changed');
      }
    }

    // Bounds change: uMin/uMax
    const pm = typeof prev?.uMin === 'number' ? prev.uMin : undefined;
    const px = typeof prev?.uMax === 'number' ? prev.uMax : undefined;
    const cm = typeof curr?.uMin === 'number' ? curr.uMin : undefined;
    const cx = typeof curr?.uMax === 'number' ? curr.uMax : undefined;
    if ((pm != null && cm != null && pm !== cm) || (px != null && cx != null && px !== cx)) {
      if (!reasons.includes('Price changed')) reasons.push('Price changed');
    }
  } catch {}
  return { changed: reasons.length > 0, reasons };
}
