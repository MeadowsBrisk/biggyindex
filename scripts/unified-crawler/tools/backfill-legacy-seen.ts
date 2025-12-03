#!/usr/bin/env ts-node
import dotenv from 'dotenv';
dotenv.config();
import { loadEnv } from '../shared/env/loadEnv';
import { getBlobClient } from '../shared/persistence/blobs';
import { Keys } from '../shared/persistence/keys';
import { mergeIndexMetaEntry, type IndexMetaEntry } from '../shared/logic/indexMetaStore';

/*
 Backfill index-meta.json with legacy seen.json timestamps.
 
 Problem: Items hidden during migration now appear "newly seen" even though
 legacy indexer had historical firstSeenAt data.
 
 Solution:
 1. Load legacy seen.json from site-index blob store (keyed by numeric ID)
 2. Load current index-meta.json aggregate (keyed by canonical refNum)
 3. Build numeric-to-canonical ID mapping from current market indexes
 4. For each legacy entry with an older firstSeenAt, merge into index-meta
 5. Write updated index-meta.json back to shared store
 
 Usage:
   MIGRATE_DRY=0 yarn ts-node scripts/unified-crawler/tools/backfill-legacy-seen.ts
*/

//yarn tsx scripts/unified-crawler/tools/backfill-legacy-seen.ts

interface LegacySeenEntry {
  firstSeenAt?: string;
  lastUpdatedAt?: string | null;
  sig?: string;
  lastUpdateReason?: string | null;
}

async function main() {
  const env = loadEnv();
  const dryRun = !/^(0|false|no|off)$/i.test(String(process.env.MIGRATE_DRY ?? '1'));
  
  console.log(`[backfill-legacy-seen] start dry=${dryRun ? 1 : 0}`);

  // 1. Load legacy seen.json
  const legacyStoreName = String(process.env.LEGACY_INDEX_STORE || 'site-index');
  const legacyBlob = getBlobClient(legacyStoreName);
  
  let legacySeen: Record<string, LegacySeenEntry> = {};
  try {
    const raw = await legacyBlob.getJSON<any>('seen.json');
    if (raw && typeof raw === 'object') {
      legacySeen = raw;
      console.log(`[backfill-legacy-seen] loaded legacy seen.json: ${Object.keys(legacySeen).length} entries`);
    } else {
      console.warn('[backfill-legacy-seen] legacy seen.json not found or invalid');
      return;
    }
  } catch (e: any) {
    console.error(`[backfill-legacy-seen] failed to load legacy seen.json: ${e?.message || e}`);
    return;
  }

  // 2. Load current index-meta.json
  const sharedBlob = getBlobClient(env.stores.shared);
  let indexMetaAgg: Record<string, IndexMetaEntry> = {};
  try {
    const agg = await sharedBlob.getJSON<any>(Keys.shared.aggregates.indexMeta());
    if (agg && typeof agg === 'object') {
      indexMetaAgg = agg as Record<string, IndexMetaEntry>;
      console.log(`[backfill-legacy-seen] loaded index-meta.json: ${Object.keys(indexMetaAgg).length} entries`);
    }
  } catch (e: any) {
    console.warn(`[backfill-legacy-seen] index-meta.json not found (will create new): ${e?.message || e}`);
  }

  // 3. Build numeric-to-canonical mapping from current market indexes
  const numToCanon = new Map<string, string>();
  const canonToNum = new Map<string, string>();
  
  for (const mkt of env.markets) {
    try {
      const storeName = (env.stores as any)[mkt];
      if (!storeName) continue;
      
      const blob = getBlobClient(storeName);
      const idx = await blob.getJSON<any[]>(Keys.market.index(mkt));
      
      if (!Array.isArray(idx)) continue;
      
      for (const e of idx) {
        const numId = e?.id != null ? String(e.id) : null;
        const refNum = e?.refNum != null ? String(e.refNum) : null;
        
        if (!numId && !refNum) continue;
        
        // Prefer refNum as canonical, but accept numeric if that's all we have
        const canonical = refNum || numId;
        
        if (numId && canonical) {
          if (!numToCanon.has(numId)) {
            numToCanon.set(numId, canonical);
          }
          if (canonical !== numId && !canonToNum.has(canonical)) {
            canonToNum.set(canonical, numId);
          }
        }
      }
      
      console.log(`[backfill-legacy-seen] market=${mkt} mapped ${numToCanon.size} numeric IDs`);
    } catch (e: any) {
      console.warn(`[backfill-legacy-seen] market=${mkt} index read failed: ${e?.message || e}`);
    }
  }

  console.log(`[backfill-legacy-seen] built mapping: ${numToCanon.size} numeric→canonical`);

  // 4. Merge legacy timestamps into index-meta
  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const [legacyId, legacy] of Object.entries(legacySeen)) {
    if (!legacy?.firstSeenAt) {
      skipped++;
      continue;
    }

    // Map numeric legacy ID to canonical
    const canonicalId = numToCanon.get(legacyId) || legacyId;
    
    // Check if we have this item in current index
    if (!numToCanon.has(legacyId) && !indexMetaAgg[canonicalId]) {
      notFound++;
      continue;
    }

    const legacyFsa = legacy.firstSeenAt;
    const legacyLua = legacy.lastUpdatedAt || null;
    const legacyLur = legacy.lastUpdateReason || null;

    const current = indexMetaAgg[canonicalId];
    
    // Only update if legacy has older firstSeenAt OR current has no fsa
    const legacyTs = Date.parse(legacyFsa);
    const currentTs = current?.fsa ? Date.parse(current.fsa) : Number.POSITIVE_INFINITY;
    
    if (!Number.isFinite(legacyTs)) {
      skipped++;
      continue;
    }

    // Merge: keep oldest fsa, newest lua
    const candidate = {
      fsa: legacyFsa,
      lua: legacyLua,
      lur: legacyLur,
    };

    const { changed, next } = mergeIndexMetaEntry(current, candidate);
    
    if (changed) {
      indexMetaAgg[canonicalId] = next;
      updated++;
      
      if (updated <= 10) {
        // Log first 10 for verification
        console.log(`[backfill-legacy-seen] updated id=${canonicalId} (legacy=${legacyId}) fsa=${next.fsa}`);
      }
    } else {
      skipped++;
    }
  }

  console.log(`[backfill-legacy-seen] merge complete: updated=${updated} skipped=${skipped} notFound=${notFound}`);

  // 5. Write back to shared store
  if (!dryRun && updated > 0) {
    try {
      await sharedBlob.putJSON(Keys.shared.aggregates.indexMeta(), indexMetaAgg);
      console.log(`[backfill-legacy-seen] wrote index-meta.json with ${Object.keys(indexMetaAgg).length} entries`);
    } catch (e: any) {
      console.error(`[backfill-legacy-seen] write failed: ${e?.message || e}`);
      process.exit(1);
    }
  } else if (dryRun) {
    console.log(`[backfill-legacy-seen] DRY RUN: would have updated ${updated} entries`);
  } else {
    console.log(`[backfill-legacy-seen] no updates needed`);
  }

  console.log('[backfill-legacy-seen] done');
}

main().catch((e) => {
  console.error('[backfill-legacy-seen] fatal', e?.stack || e?.message || String(e));
  process.exit(1);
});
