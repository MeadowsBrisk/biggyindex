import type { MarketCode } from "../../shared/env/loadEnv";
import { loadEnv } from "../../shared/env/loadEnv";
import { marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { pruneIndexMeta, type IndexMetaEntry } from "../../shared/logic/indexMetaStore";
import { log } from "../../shared/logging/logger";
import { createR2Client, getR2Config } from "../images/optimizer";
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { loadImageMeta } from "../images/imageMeta";

export interface PruningRunResult {
  ok: boolean;
  markets: MarketCode[];
  dryRun?: boolean;
  counts?: {
    itemsDeleted?: number;
    sellersDeleted?: number;
    translationsPruned?: number;
    indexMetaRemoved?: number;
    indexMetaRetained?: number;
    indexMetaMigrated?: number;
    perMarket?: Record<string, { shipDeleted: number; shipSummaryTrimmed: number }>;
    imagesPruned?: number;
    imagesErrors?: number;
  };
  note?: string;
}

export interface PruningOptions {
  dryRun?: boolean;
  retentionDays?: number;  // Default 365 - items not seen for this long are pruned
  confirmed?: boolean;     // Must be true to actually prune (safety flag)
}

const DEFAULT_RETENTION_DAYS = 365;

/**
 * Retention-based pruning stage.
 * 
 * Items are only pruned if:
 * 1. Not in any current market index
 * 2. AND lastSeenInIndex (lsi) is older than retentionDays (default 365)
 * 
 * Safety: requires --confirmed flag or opts.confirmed=true to actually delete.
 * Without confirmation, runs as dry-run automatically.
 * 
 * Per market:
 * - Delete market-shipping/<id>.json only if item is past retention period
 * - Trim aggregates/ship.json entries past retention period
 * 
 * Shared:
 * - Delete items/<id>.json only if item is past retention period in ALL markets
 * - Update indexMeta aggregate with retention-aware logic
 * 
 * Sellers: not deleted (kept for analytics continuity)
 */
export async function runPruning(markets?: MarketCode[], opts: PruningOptions = {}): Promise<PruningRunResult> {
  const retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;

  // Safety: force dry-run unless explicitly confirmed
  const dryRun = !opts.confirmed || opts.dryRun === true;

  if (!opts.confirmed && !opts.dryRun) {
    log.cli.warn(`pruning: safety mode - running as dry-run. Use --confirmed to actually delete data.`);
  }

  try {
    const env = loadEnv();
    const mkts = (markets && markets.length ? markets : env.markets) as MarketCode[];
    log.cli.info(`pruning start`, {
      markets: mkts.join(','),
      dryRun,
      retentionDays,
      confirmed: opts.confirmed ?? false
    });
    const sharedBlob = getBlobClient(env.stores.shared);
    const now = new Date();
    const cutoffMs = now.getTime() - (retentionDays * 24 * 60 * 60 * 1000);
    const cutoffDate = new Date(cutoffMs).toISOString();

    // 1) Build active item id sets per market and union across markets
    const activeByMarket = new Map<string, Set<string>>();
    const unionActive = new Set<string>();
    for (const mkt of mkts) {
      try {
        const storeName = marketStore(mkt, env.stores as any);
        const blob = getBlobClient(storeName);
        const index = (await blob.getJSON<any[]>(Keys.market.index(mkt))) || [];
        const ids = new Set<string>();
        for (const e of Array.isArray(index) ? index : []) {
          const id = String(e?.refNum ?? e?.ref ?? e?.id ?? '').trim();
          if (id) { ids.add(id); unionActive.add(id); }
        }
        activeByMarket.set(mkt, ids);
        log.cli.info(`pruning market scan`, { market: mkt, activeItems: ids.size });
      } catch (e: any) {
        log.cli.warn(`pruning: failed to read index`, { market: mkt, reason: e?.message || String(e) });
        activeByMarket.set(mkt, new Set());
      }
    }

    // Load indexMeta to check lsi (lastSeenInIndex) for retention decisions
    let indexMetaAgg: Record<string, IndexMetaEntry> = {};
    try {
      const agg = await sharedBlob.getJSON<any>(Keys.shared.aggregates.indexMeta());
      if (agg && typeof agg === 'object') indexMetaAgg = agg as Record<string, IndexMetaEntry>;
    } catch (e: any) {
      log.cli.warn(`pruning: failed to load index-meta`, { reason: e?.message || String(e) });
    }

    // Helper: check if an item is past retention period
    const isPastRetention = (id: string): boolean => {
      const meta = indexMetaAgg[id];
      if (!meta?.lsi) return false;  // No lsi = not safe to prune (migration case)
      const lsiTs = Date.parse(meta.lsi);
      if (!Number.isFinite(lsiTs)) return false;
      return lsiTs < cutoffMs;
    };

    // Update indexMeta with retention-aware pruning
    let indexMetaRemoved = 0;
    let indexMetaRetained = 0;
    let indexMetaMigrated = 0;
    try {
      const result = pruneIndexMeta(indexMetaAgg, unionActive, { retentionDays, now });
      indexMetaRemoved = result.removed;
      indexMetaRetained = result.retained;
      indexMetaMigrated = result.migrated;

      if (!dryRun && (result.removed > 0 || result.migrated > 0)) {
        await sharedBlob.putJSON(Keys.shared.aggregates.indexMeta(), indexMetaAgg);
      }
      log.cli.info(`pruning: indexMeta ${dryRun ? 'scan' : 'update'}`, {
        removed: indexMetaRemoved,
        retained: indexMetaRetained,
        migrated: indexMetaMigrated,
        cutoffDate,
        dryRun
      });
    } catch (e: any) {
      log.cli.warn(`pruning: failed to prune index-meta aggregate`, { reason: e?.message || String(e) });
    }

    // Prune translations aggregate: remove entries past retention period
    let translationsPruned = 0;
    try {
      const translationsAgg = await sharedBlob.getJSON<Record<string, any>>(Keys.shared.aggregates.translations());
      if (translationsAgg && typeof translationsAgg === 'object') {
        const toDelete: string[] = [];
        for (const refNum of Object.keys(translationsAgg)) {
          if (!unionActive.has(refNum) && isPastRetention(refNum)) {
            toDelete.push(refNum);
          }
        }
        translationsPruned = toDelete.length;
        if (toDelete.length > 0) {
          if (!dryRun) {
            for (const refNum of toDelete) {
              delete translationsAgg[refNum];
            }
            await sharedBlob.putJSON(Keys.shared.aggregates.translations(), translationsAgg);
          }
          log.cli.info(`pruning: translations ${dryRun ? 'would prune' : 'pruned'}`, { entries: translationsPruned });
        }
      }
    } catch (e: any) {
      log.cli.warn(`pruning: failed to prune translations aggregate`, { reason: e?.message || String(e) });
    }

    // 2) Per-market: delete stale shipping files and trim ship summary aggregate (only if past retention)
    const perMarketCounts: Record<string, { shipDeleted: number; shipSummaryTrimmed: number }> = {};
    for (const mkt of mkts) {
      const storeName = marketStore(mkt, env.stores as any);
      const blob = getBlobClient(storeName);
      const active = activeByMarket.get(mkt) || new Set<string>();
      let shipDeleted = 0;
      let shipSummaryTrimmed = 0;

      try {
        const shipKeys = await blob.list("market-shipping/");
        for (const key of shipKeys) {
          const match = key.match(/^market-shipping\/(.+)\.json$/);
          const id = match?.[1];
          if (!id) continue;
          // Only prune if NOT active AND past retention period
          if (!active.has(id) && isPastRetention(id)) {
            if (!dryRun) {
              try { await blob.del(key); } catch { }
            }
            shipDeleted++;
          }
        }
      } catch (e: any) {
        log.cli.warn(`pruning: list shipping failed`, { market: mkt, reason: e?.message || String(e) });
      }

      // Trim aggregates/ship.json - only entries past retention period
      try {
        const aggKey = Keys.market.aggregates.shipSummary();
        const existing = (await blob.getJSON<Record<string, { min: number; max: number; free: number }>>(aggKey)) || {};
        const toDelete: string[] = [];
        for (const id of Object.keys(existing)) {
          if (!active.has(id) && isPastRetention(id)) {
            toDelete.push(id);
            shipSummaryTrimmed++;
          }
        }
        if (toDelete.length > 0 && !dryRun) {
          for (const id of toDelete) {
            delete (existing as any)[id];
          }
          await blob.putJSON(aggKey, existing);
        }
      } catch (e: any) {
        // non-fatal
      }

      perMarketCounts[mkt] = { shipDeleted, shipSummaryTrimmed };
      log.cli.info(`pruning: market ${dryRun ? 'scan' : 'complete'}`, {
        market: mkt,
        shipDeleted,
        shipSummaryTrimmed,
        dryRun
      });
    }

    // 3) Shared: delete orphaned item cores only if past retention period in ALL markets
    let orphanCores = 0;
    try {
      const coreKeys = await sharedBlob.list("items/");
      for (const key of coreKeys) {
        const match = key.match(/^items\/(.+)\.json$/);
        const id = match?.[1];
        if (!id) continue;
        // Only prune if NOT in any market AND past retention period
        if (!unionActive.has(id) && isPastRetention(id)) {
          if (!dryRun) {
            try { await sharedBlob.del(key); } catch { }
          }
          orphanCores++;
        }
      }
    } catch (e: any) {
      log.cli.warn(`pruning: shared list cores failed`, { reason: e?.message || String(e) });
    }

    // 4) Images: prune orphaned image folders in R2
    // Strategy:
    // A. First, ensure pruned items are removed from image-meta.json (so their hashes become orphans)
    // B. Then scan R2. Any hash NOT in image-meta.json is trash (replaced or expired).

    let imagesPruned = 0;
    let imagesErrors = 0;

    try {
      const imageMeta = await loadImageMeta(sharedBlob);
      let imageMetaChanged = false;

      // A. Remove pruned items from image-meta
      // We know 'unionActive' has all currently listed items
      // We check retention for items NOT in unionActive
      const imageMetaKeys = Object.keys(imageMeta);
      for (const id of imageMetaKeys) {
        // If item is not active AND is past retention -> Remove from image-meta
        if (!unionActive.has(id) && isPastRetention(id)) {
          delete imageMeta[id];
          imageMetaChanged = true;
        }
      }

      if (imageMetaChanged && !dryRun) {
        await sharedBlob.putJSON(Keys.shared.aggregates.imageMeta(), imageMeta);
        log.cli.info('pruning: updated image-meta (removed expired items)');
      }

      // B. Scan R2 for orphans
      // An orphan is any R2 folder hash that is NOT in the Values of image-meta
      const config = getR2Config();
      if (config.accountId) {
        log.cli.info('pruning: starting image scan...');

        // Collect all valid hashes
        const validHashes = new Set<string>();
        for (const entry of Object.values(imageMeta)) {
          if (Array.isArray(entry.hashes)) {
            entry.hashes.forEach(h => validHashes.add(h));
          }
        }

        const r2Client = createR2Client();
        let continuationToken: string | undefined;
        const potentialOrphans = new Set<string>();

        // Scan R2 folders (prefixes)
        do {
          const listResponse: any = await r2Client.send(new ListObjectsV2Command({
            Bucket: config.bucketName,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
          }));

          const objects = listResponse.Contents || [];
          for (const obj of objects) {
            if (!obj.Key) continue;
            // Key format: {hash}/filename
            const match = obj.Key.match(/^([a-f0-9]{8})\//);
            if (match) {
              const hash = match[1];
              if (!validHashes.has(hash)) {
                potentialOrphans.add(hash);
              }
            }
          }
          continuationToken = listResponse.NextContinuationToken;
        } while (continuationToken);

        const toDeleteHashes = Array.from(potentialOrphans);
        log.cli.info(`pruning: found ${toDeleteHashes.length} orphaned image folders (safe to delete)`);

        if (!dryRun && toDeleteHashes.length > 0) {
          const BATCH_SIZE = 10;
          const chunks = [];
          for (let i = 0; i < toDeleteHashes.length; i += BATCH_SIZE) {
            chunks.push(toDeleteHashes.slice(i, i + BATCH_SIZE));
          }

          for (const chunk of chunks) {
            await Promise.all(chunk.map(async (hash) => {
              try {
                const listRes: any = await r2Client.send(new ListObjectsV2Command({
                  Bucket: config.bucketName,
                  Prefix: `${hash}/`
                }));
                if (listRes.Contents && listRes.Contents.length > 0) {
                  const keys = listRes.Contents.map((o: any) => ({ Key: o.Key }));
                  await r2Client.send(new DeleteObjectsCommand({
                    Bucket: config.bucketName,
                    Delete: { Objects: keys }
                  }));
                  imagesPruned++;
                }
              } catch (e) {
                imagesErrors++;
              }
            }));
          }
        } else if (dryRun) {
          imagesPruned = toDeleteHashes.length;
        }
      }
    } catch (e: any) {
      log.cli.error('pruning: image cleanup failed', { reason: e?.message || String(e) });
    }

    // Sellers: keep for now (never deleted - valuable for analytics)
    const sellersDeleted = 0;

    log.cli.info(`pruning ${dryRun ? 'dry run complete' : 'complete'}`, {
      orphanCores,
      translationsPruned,
      indexMetaRemoved,
      indexMetaRetained,
      retentionDays,
      cutoffDate,
      dryRun
    });

    return {
      ok: true,
      markets: mkts,
      dryRun,
      counts: {
        itemsDeleted: orphanCores,
        sellersDeleted,
        translationsPruned,
        indexMetaRemoved,
        indexMetaRetained,
        indexMetaMigrated,
        perMarket: perMarketCounts,
        imagesPruned,
        imagesErrors
      }
    };
  } catch (e: any) {
    log.cli.error(`pruning error`, { reason: e?.message || String(e) });
    return {
      ok: false,
      markets: (loadEnv().markets as MarketCode[]),
      counts: { itemsDeleted: 0, sellersDeleted: 0, translationsPruned: 0 },
      note: e?.message || String(e)
    } as any;
  }
}
