#!/usr/bin/env ts-node
import 'dotenv/config';
import { loadEnv } from '../shared/env/loadEnv';
import type { MarketCode } from '../shared/env/loadEnv';
import { marketStore } from '../shared/env/markets';
import { getBlobClient } from '../shared/persistence/blobs';
import { Keys } from '../shared/persistence/keys';

/*
 One-time migration helper: produce a shared aggregate of legacy index timing fields.
 - Reads per-market indexed_items.json and snapshot_meta.json from market stores
 - For each item id, collects ONLY:
   - earliest firstSeenAt
   - latest lastUpdatedAt
   - lastUpdateReason (from most recent record that has it)
 - Writes a single mapping into shared store at aggregates/index-meta.json:
   { [id]: { fsa: string, lua: string, lur: string } }

 Notes:
 - Does NOT write per-item cores (items/<id>.json).
 - Dry-run by default. Set MIGRATE_DRY=0 to enable writes.
*/

async function main() {
  const env = loadEnv();
  const markets = env.markets as MarketCode[];
  const dryRun = !/^(0|false|no|off)$/i.test(String(process.env.MIGRATE_DRY ?? '1'));
  const nowIso = new Date().toISOString();

  console.log(`[migrate:index-meta] start markets=${markets.join(',')} dry=${dryRun ? 1 : 0}`);

  // Utility: canonical id prefers refNum/ref, then id (string)
  const canonId = (e: any): string => {
    const ref = e?.refNum ?? e?.ref;
    if (ref != null && String(ref).trim()) return String(ref).trim();
    const id = e?.id;
    return id != null ? String(id).trim() : "";
  };

  // Load per-market indexes and snapshot metas
  const byMarketIndex: Record<string, any[]> = {};
  const snapshotAt: Record<string, string> = {};
  for (const mkt of markets) {
    try {
      const storeName = marketStore(mkt, env.stores as any);
      const blob = getBlobClient(storeName);
  const idx = (await blob.getJSON<any[]>(Keys.market.index(mkt))) || [];
      byMarketIndex[mkt] = Array.isArray(idx) ? idx : [];
      const meta = (await blob.getJSON<any>(Keys.market.snapshotMeta())) || null;
      if (meta?.updatedAt) snapshotAt[mkt] = String(meta.updatedAt);
      console.log(`[migrate:index-meta] market=${mkt} items=${byMarketIndex[mkt].length} snapshotAt=${snapshotAt[mkt] || 'n/a'}`);
    } catch (e: any) {
      console.warn(`[migrate:index-meta] market=${mkt} read failed: ${e?.message || e}`);
      byMarketIndex[mkt] = [];
    }
  }

  // Load legacy single-store index (authoritative for historical data if present)
  const legacyStoreName = String(process.env.LEGACY_INDEX_STORE || 'site-index');
  let legacyIndex: any[] = [];
  try {
    const legacyBlob = getBlobClient(legacyStoreName);
    const legacy = await legacyBlob.getJSON<any>('indexed_items.json');
    if (Array.isArray(legacy)) {
      legacyIndex = legacy;
      console.log(`[migrate:index-meta] legacy store='${legacyStoreName}' items=${legacyIndex.length}`);
    } else {
      console.log(`[migrate:index-meta] legacy store='${legacyStoreName}' has no indexed_items.json array`);
    }
  } catch (e: any) {
    console.warn(`[migrate:index-meta] legacy read failed from store='${legacyStoreName}': ${e?.message || e}`);
  }

  // Build union of ids across markets and legacy
  const allIds = new Set<string>();
  for (const mkt of markets) for (const e of (byMarketIndex[mkt] || [])) {
    const id = canonId(e);
    if (id) allIds.add(id);
  }
  for (const e of legacyIndex) {
    const id = canonId(e);
    if (id) allIds.add(id);
  }
  console.log(`[migrate:index-meta] unionIds=${allIds.size}`);

  const sharedBlob = getBlobClient(env.stores.shared);
  let touched = 0, errors = 0;

  // Load existing aggregate for idempotent merges
  let existingAgg: Record<string, { fsa?: string; lua?: string; lur?: string }> = {};
  try {
    const cur = await sharedBlob.getJSON<any>(Keys.shared.aggregates.indexMeta());
    if (cur && typeof cur === 'object') existingAgg = cur as any;
  } catch {}

  const outAgg: Record<string, { fsa?: string; lua?: string; lur?: string }> = { ...existingAgg };

  for (const id of allIds) {
    try {
      // Aggregate metadata across markets
      let firstSeenAt: string | null = null;
      let lastIndexUpdatedAt: string | null = null;
      let lastIndexUpdateReason: string | null = null;

      // Prefer legacy record if present
      const legacyRec = legacyIndex.find((e) => canonId(e) === id);
      if (legacyRec) {
        const fs = legacyRec.firstSeenAt || legacyRec.first_seen_at || legacyRec.fsa || null;
        const lu = legacyRec.lastUpdatedAt || legacyRec.last_updated_at || legacyRec.lua || null;
        const lr = legacyRec.lastUpdateReason || legacyRec.last_update_reason || legacyRec.lur || null;
        if (fs) firstSeenAt = fs;
        if (lu) { lastIndexUpdatedAt = lu; if (lr) lastIndexUpdateReason = lr; }
      }

      // Merge in per-market compact or verbose shapes
      for (const mkt of markets) {
        const list = byMarketIndex[mkt] || [];
        const rec = list.find((e) => canonId(e) === id);
        if (!rec) continue;
        const fs = rec.firstSeenAt || rec.first_seen_at || rec.fsa || null;
        const lu = rec.lastUpdatedAt || rec.last_updated_at || rec.lua || null;
        const lr = rec.lastUpdateReason || rec.last_update_reason || rec.lur || null;
        if (fs) {
          if (!firstSeenAt || new Date(fs).getTime() < new Date(firstSeenAt).getTime()) firstSeenAt = fs;
        }
        if (lu) {
          if (!lastIndexUpdatedAt || new Date(lu).getTime() > new Date(lastIndexUpdatedAt).getTime()) {
            lastIndexUpdatedAt = lu;
            if (lr) lastIndexUpdateReason = lr;
          }
        }
      }

      const prev = existingAgg[id] || {};
      const fsa = firstSeenAt || prev.fsa;
      const lua = lastIndexUpdatedAt || prev.lua;
      const lur = lastIndexUpdateReason || prev.lur;
      if (fsa || lua || lur) {
        outAgg[id] = { ...(outAgg[id] || {}), ...(fsa ? { fsa } : {}), ...(lua ? { lua } : {}), ...(lur ? { lur } : {}) };
      }
      touched++;
      if (touched % 200 === 0) console.log(`[migrate:index-meta] progress ${touched}/${allIds.size}`);
    } catch (e: any) {
      errors += 1;
      console.warn(`[migrate:index-meta] id=${id} failed: ${e?.message || e}`);
    }
  }

  if (!dryRun) {
    await sharedBlob.putJSON(Keys.shared.aggregates.indexMeta(), outAgg);
  }

  const wroteCount = Object.keys(outAgg).length;
  console.log(`[migrate:index-meta] done touched=${touched} errors=${errors} wrote=${wroteCount} dry=${dryRun ? 1 : 0}`);
}

main().catch((e) => {
  console.error('[migrate:index-meta] fatal', e?.stack || e?.message || String(e));
  process.exit(1);
});
