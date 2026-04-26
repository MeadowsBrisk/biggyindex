/**
 * v2 Mirror — dual-write select aggregates from v1 to the v2 bucket.
 *
 * Why: at BiggyIndex v2 cutover, only timestamp/history aggregates need to
 * survive. If v1 mirrors these to `biggyindex-data-v2` continuously, v2
 * launches with pre-seeded history and we avoid a last-minute port script.
 *
 * Mirrored (shape-identical to v2):
 *   - shared/aggregates/index-meta.json    (fsa/lua/lur/lsi per item)
 *   - shared/aggregates/image-meta.json    (per-item image hash ledger)
 *   - shared/aggregates/seller-state.json  (per-seller enrichment state)
 *
 * Not mirrored: pricing (regenerated fresh at cutover), shipping-meta
 * (forced recrawl at cutover), translations (regenerated), shares, etc.
 *
 * Behaviour:
 *   - Gated by env `R2_V2_MIRROR=1`. Off → all mirror calls are no-ops.
 *   - Bucket: `R2_V2_DATA_BUCKET` (default `biggyindex-data-v2`).
 *   - Credentials: reuses the same R2_ACCOUNT_ID / ACCESS_KEY / SECRET.
 *   - Fire-and-forget: failures are logged and swallowed. v1 writes to
 *     `biggyindex-data` remain the source of truth; the mirror must never
 *     break the primary pipeline.
 *
 * Schema note:
 *   v2's IndexMetaEntry adds an optional `ph` (price history) field that
 *   v1 doesn't collect. We mirror v1's shape as-is; v2 treats `ph` as
 *   optional so the omission is safe. All other fields match exactly.
 */

import { createR2Store, type DataStore } from './store';
import { Keys } from './keys';
import { log } from '../logging/logger';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _v2Store: DataStore | null = null;
let _initTried = false;
let _warnedDisabled = false;

/** True if the mirror is enabled via env. */
export function isV2MirrorEnabled(): boolean {
  return process.env.R2_V2_MIRROR === '1';
}

/** Lazy-get the v2 DataStore. Returns null if disabled or init failed. */
function getV2Store(): DataStore | null {
  if (!isV2MirrorEnabled()) {
    if (!_warnedDisabled) {
      _warnedDisabled = true;
      log.cli.info('v2Mirror disabled (set R2_V2_MIRROR=1 to enable)');
    }
    return null;
  }
  if (_v2Store) return _v2Store;
  if (_initTried) return null;
  _initTried = true;

  try {
    const bucket = process.env.R2_V2_DATA_BUCKET || 'biggyindex-data-v2';
    // Scope to the `shared` prefix so keys like `aggregates/index-meta.json`
    // resolve to `shared/aggregates/index-meta.json` — matching v2's layout.
    _v2Store = createR2Store(bucket, 'shared');
    log.cli.info('v2Mirror enabled', { bucket, prefix: 'shared' });
    return _v2Store;
  } catch (e: any) {
    log.cli.warn(`v2Mirror init failed: ${e?.message || e}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generic mirror
// ---------------------------------------------------------------------------

/**
 * Write a value to the v2 bucket at the given key. Non-fatal: any error is
 * logged and swallowed. Caller must not await this for correctness.
 */
async function mirror(key: string, value: unknown, label: string): Promise<void> {
  const store = getV2Store();
  if (!store) return;
  try {
    await store.putJSON(key, value);
  } catch (e: any) {
    log.cli.warn(`v2Mirror[${label}] write failed: ${e?.message || e}`);
  }
}

// ---------------------------------------------------------------------------
// Aggregate-specific helpers
// ---------------------------------------------------------------------------

/** Mirror `shared/aggregates/index-meta.json` to the v2 bucket. */
export async function mirrorIndexMeta(meta: unknown): Promise<void> {
  await mirror(Keys.shared.aggregates.indexMeta(), meta, 'index-meta');
}

/** Mirror `shared/aggregates/image-meta.json` to the v2 bucket. */
export async function mirrorImageMeta(meta: unknown): Promise<void> {
  await mirror(Keys.shared.aggregates.imageMeta(), meta, 'image-meta');
}

/** Mirror `shared/aggregates/seller-state.json` to the v2 bucket. */
export async function mirrorSellerState(state: unknown): Promise<void> {
  await mirror(Keys.shared.aggregates.sellerState(), state, 'seller-state');
}
