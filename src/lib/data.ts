/** R2 data loaders: browse items, sellers, item detail, archive and status. */

import { cacheLife, cacheTag } from "next/cache";
import { IMAGE_VARIANT_VERSION } from "./imageVariants";
import { R2Keys, readR2JSON } from "./r2";
import type {
  HomeFeed,
  Item,
  MergedDetailBlob,
  Seller,
  SellerDetail,
} from "./types";

// ─── Archive types (crawler contract) ───────────────────────────
//
// Written by the crawler's archive stage. ref ∈ manifest ⇔ archived;
// manifest keys and indexed_items refs are kept strictly disjoint.

/**
 * Entry in the per-market archive manifest
 * (`markets/{mkt}/archive/manifest.json`).
 *
 * NOTE: `at` here means archivedAt/delistedAt — NOT item attributes.
 * Optional fields are omitted when absent (never null).
 */
export interface ArchiveManifestEntry {
  /** Item name (market-localized) */
  n: string;
  /** Category */
  c?: string;
  /** Subcategories */
  sc?: string[];
  /** Seller id */
  sid?: number;
  /** Seller name */
  sn?: string;
  /** Primary image hash */
  ih?: string;
  /** Gallery image hashes (nulls already filtered out) */
  ish?: string[];
  /** firstSeenAt ISO */
  fsa?: string;
  /** lastUpdatedAt ISO — "last known at" */
  lua?: string;
  /** archivedAt/delistedAt ISO — used as sitemap lastModified */
  at: string;
}

/** ref → manifest entry. */
export type ArchiveManifest = Record<string, ArchiveManifestEntry>;

/** Archive stamp on snapshot blobs. */
export interface ArchiveStamp {
  /** archivedAt/delistedAt ISO */
  at: string;
  /** Last seen in index, when known */
  lsi?: string | null;
  /** How the snapshot was produced */
  src: "live" | "backfill-v2" | "backfill-v1";
  v: 1;
}

/**
 * Archived snapshot blob — the merged detail blob as last seen, plus the
 * archive stamp. backfill-v1 snapshots may lack ih/ish entirely (no-image
 * state) and have empty shOpts.
 */
export interface ArchivedDetailBlob extends MergedDetailBlob {
  arc?: ArchiveStamp;
}

const archiveManifestKey = (market: string) =>
  `markets/${market}/archive/manifest.json`;
const archivedDetailKey = (market: string, ref: string) =>
  `markets/${market}/archive/item-detail/${encodeURIComponent(ref)}.json`;

// ─── Browse field stripping ─────────────────────────────────────

function truncateDesc(text: string, max = 260): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  return (cut > max * 0.5 ? text.slice(0, cut) : text.slice(0, max)) + "…";
}

/**
 * Strip fields unused by browse components to shrink the RSC payload.
 * `d` is truncated to ~260 chars (CSS line-clamp handles visual clipping;
 * the full text comes from the item detail API). Raw `i`/`is` are left in
 * place as fallbacks for items whose optimized image hashes aren't confirmed.
 *
 * @param market lowercase market code. On English markets `nEn`/`dEn`
 *   duplicate `n`/`d` and are dropped; on translated markets they are kept so
 *   the "Show in English" toggle can swap originals without re-fetching.
 */
function stripBrowseFields(items: Item[], market: string): Item[] {
  const isEnglishMarket = market === "gb" || market === "ie";
  for (const item of items) {
    if (item.d) item.d = truncateDesc(item.d);
    if (isEnglishMarket) {
      delete item.dEn;
      delete item.nEn;
    } else {
      // Truncate to the same length as `d` so the toggle swaps like for like.
      if (item.dEn) item.dEn = truncateDesc(item.dEn);
      // Identical means untranslated — no reason to ship it twice.
      if (item.nEn && item.nEn === item.n) delete item.nEn;
    }
    // Normalize legacy .net share links to the canonical .org domain.
    if (item.sl && item.sl.includes("littlebiggy.net")) {
      item.sl = item.sl.replace(/littlebiggy\.net/g, "littlebiggy.org");
    }
    // `lur` is deliberately kept: ItemCard uses it for the hover title and to
    // decide whether to show "Updated X ago". Costs only a few KB.
  }
  return items;
}

/**
 * Strip seller fields unused by browse to shrink the payload.
 * `url` is an upstream marketplace link we don't ship to the frontend.
 */
function stripSellerFields(sellers: Seller[]): Seller[] {
  for (const seller of sellers) {
    delete (seller as unknown as Record<string, unknown>).url;
  }
  return sellers;
}

// ─── Browse data version ────────────────────────────────────────

/**
 * Stable short version of the browse dataset, used to version /api/browse URLs
 * so browsers can cache the payload immutably.
 *
 * Hashes per-item id/lua/lur/prices/variant-count/category rather than
 * count+max(lua): a repair that reverts `lua` leaves the max unchanged, and an
 * unchanged version pins browsers to the stale payload forever.
 *
 * Hotness (`h`) is excluded — it drifts every crawl, and any crawl that
 * matters also moves lua/price/variants on some item.
 */
export function browseDataVersion(items: Item[]): string {
  let h = 5381;
  const mix = (src: string) => {
    for (let i = 0; i < src.length; i++) {
      h = ((h << 5) + h + src.charCodeAt(i)) | 0;
    }
  };
  mix(String(items.length));
  for (const item of items) {
    mix(
      `|${item.id}:${item.lua ?? ""}:${item.lur ?? ""}:${item.uMin ?? ""}:${item.uMax ?? ""}:${item.v?.length ?? 0}:${item.c ?? ""}:${item.sc?.join("+") ?? ""}`,
    );
  }
  return (h >>> 0).toString(36);
}

// ─── Data loaders ───────────────────────────────────────────────

/** Load all items for a market (browse-optimised). */
export async function loadItems(market = "gb"): Promise<Item[]> {
  const items = await readR2JSON<Item[]>(R2Keys.items(market));
  return items ? stripBrowseFields(items, market) : [];
}

// ─── Responsive image variants ──────────────────────────────────

/**
 * Per-item image-meta entry (subset we read). Shared aggregate at
 * `shared/aggregates/image-meta.json`, keyed by item ref. `variantWidths` is
 * index-parallel with `hashes`; `variantV` gates whether it can be trusted.
 */
interface ImageMetaEntry {
  hashes?: string[];
  variantWidths?: number[][];
  variantV?: number;
}

/** Global hash → available card-variant widths (e.g. `abc123` → [320, 640]). */
export type VariantWidthsByHash = Record<string, number[]>;

/**
 * Load the hash → variant-widths map from the shared image-meta aggregate.
 *
 * Variants (`{hash}/w320.avif`, …) are per-hash in R2, so one global lookup
 * keyed by hash is authoritative regardless of which item references it. Only
 * entries stamped `variantV >= IMAGE_VARIANT_VERSION` with a non-empty width
 * list are included; anything else is absent and its card falls back to plain
 * `thumb.avif` with no srcset.
 *
 * Cached under the 'items' profile + tag so crawler revalidation rolls it over
 * in lockstep with the grid, and the large aggregate is fetched at most once
 * per revalidation window per instance.
 */
export async function loadVariantWidths(): Promise<VariantWidthsByHash> {
  "use cache";
  cacheLife("items");
  cacheTag("items");

  const meta = await readR2JSON<Record<string, ImageMetaEntry>>(
    R2Keys.imageMeta,
  );
  const map: VariantWidthsByHash = {};
  if (!meta) return map;

  for (const ref in meta) {
    const entry = meta[ref];
    if (!entry || (entry.variantV ?? 0) < IMAGE_VARIANT_VERSION) continue;
    const { hashes, variantWidths } = entry;
    if (!hashes || !variantWidths) continue;
    for (let i = 0; i < hashes.length; i++) {
      const hash = hashes[i];
      const widths = variantWidths[i];
      if (!hash || !Array.isArray(widths) || widths.length === 0) continue;
      // First writer wins — a hash's variants are identical across items.
      if (!map[hash]) map[hash] = widths;
    }
  }
  return map;
}

/** Load sellers for a market. */
export async function loadSellers(market = "gb"): Promise<Seller[]> {
  const sellers = await readR2JSON<Seller[]>(R2Keys.sellers(market));
  return sellers ? stripSellerFields(sellers) : [];
}

/** Load full shared seller detail. */
export async function loadSellerDetail(
  id: string | number,
): Promise<SellerDetail | null> {
  const detail = await readR2JSON<SellerDetail>(R2Keys.sellerDetail(id));
  if (!detail) return null;

  if (detail.share?.includes("littlebiggy.net")) {
    detail.share = detail.share.replace(/littlebiggy\.net/g, "littlebiggy.org");
  }
  if (detail.sellerUrl?.includes("littlebiggy.net")) {
    detail.sellerUrl = detail.sellerUrl.replace(
      /littlebiggy\.net/g,
      "littlebiggy.org",
    );
  }

  return detail;
}

/** Load the pre-built home feed (one R2 read for the whole page). */
export async function loadHomeFeed(market = "gb"): Promise<HomeFeed | null> {
  return readR2JSON<HomeFeed>(R2Keys.homeFeed(market));
}

/**
 * Load a single item by refNum from per-item R2 file.
 * Also merges market-specific shipping options.
 */
export async function loadItemByRef(
  ref: string,
  market = "gb",
): Promise<Item | null> {
  const item = await readR2JSON<Item>(R2Keys.itemDetail(ref));
  if (!item) return null;

  // Normalize legacy .net share link to .org.
  if (item.sl && item.sl.includes("littlebiggy.net")) {
    item.sl = item.sl.replace(/littlebiggy\.net/g, "littlebiggy.org");
  }

  // Merge market shipping if available
  const ship = await readR2JSON<{
    options?: unknown[];
    translations?: { shippingOptions?: unknown[]; description?: string };
  }>(R2Keys.shippingDetail(market, ref));

  if (ship?.translations?.shippingOptions) {
    // biome-ignore lint: merging shipping into item detail
    (item as unknown as Record<string, unknown>).shippingOptions =
      ship.translations.shippingOptions;
  } else if (ship?.options) {
    (item as unknown as Record<string, unknown>).shippingOptions = ship.options;
  }
  if (ship?.translations?.description) {
    (item as unknown as Record<string, unknown>).descriptionTranslated =
      ship.translations.description;
  }

  return item;
}

/**
 * Load the full merged detail blob for an item (reviews, price history, shipping options).
 * Falls back to basic item detail if merged blob doesn't exist.
 */
export async function loadMergedDetail(
  ref: string,
  market = "gb",
): Promise<MergedDetailBlob | null> {
  const merged = await readR2JSON<MergedDetailBlob>(
    R2Keys.mergedDetail(market, ref),
  );
  if (merged) {
    if (merged.sl && merged.sl.includes("littlebiggy.net")) {
      merged.sl = merged.sl.replace(/littlebiggy\.net/g, "littlebiggy.org");
    }
    return merged;
  }

  // Fall back to basic item + shipping merge
  const item = await loadItemByRef(ref, market);
  return item as MergedDetailBlob | null;
}

// ─── Little Biggy live status (public uptime blob) ──────────────
//
// Written by the crawler to `shared/status.json` in the data bucket, by full
// index runs and by the status-ping function. Contract: a rolling window of
// the last ~144 reachability checks (≈24h at a 10-min cadence; the cap lives
// crawler-side). The blob ships independently of this frontend, so the loader
// must NEVER throw — missing or malformed degrades to `null` and the page
// renders an "unknown" state.

export interface StatusCheck {
  /** ISO timestamp of the check */
  at: string;
  up: boolean;
  /** Round-trip latency in ms, or null when unreachable/unknown */
  latencyMs: number | null;
}

export interface LittleBiggyStatus {
  up: boolean;
  /** ISO timestamp of the most recent check */
  lastCheckedAt: string;
  /** ISO timestamp Little Biggy was last confirmed reachable */
  lastUpAt: string;
  /** ISO timestamp of the last observed outage, or null if never seen down */
  lastDownAt: string | null;
  /** Most recent checks, oldest→newest (last ~144 ≈ 24h at 10-min pings) */
  recentChecks: StatusCheck[];
}

function isIsoish(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/**
 * Load + validate the public Little Biggy status blob.
 *
 * Uncached — the /littlebiggy-status page caches it under the short `status`
 * profile. Returns null (unknown state) on any fetch failure or shape
 * mismatch, so a partial blob can never 500 or render a broken indicator.
 */
export async function loadLittleBiggyStatus(): Promise<LittleBiggyStatus | null> {
  const raw = await readR2JSON<unknown>(R2Keys.status);
  if (!raw || typeof raw !== "object") return null;

  const blob = raw as Record<string, unknown>;
  if (typeof blob.up !== "boolean") return null;
  if (!isIsoish(blob.lastCheckedAt) || !isIsoish(blob.lastUpAt)) return null;

  const recentChecks: StatusCheck[] = Array.isArray(blob.recentChecks)
    ? blob.recentChecks
        .filter(
          (c): c is Record<string, unknown> =>
            !!c &&
            typeof c === "object" &&
            isIsoish((c as { at?: unknown }).at),
        )
        .map((c) => ({
          at: c.at as string,
          up: c.up === true,
          latencyMs:
            typeof c.latencyMs === "number" ? (c.latencyMs as number) : null,
        }))
    : [];

  return {
    up: blob.up,
    lastCheckedAt: blob.lastCheckedAt as string,
    lastUpAt: blob.lastUpAt as string,
    lastDownAt: isIsoish(blob.lastDownAt) ? (blob.lastDownAt as string) : null,
    recentChecks,
  };
}

// ─── Archive loaders (delisted items) ───────────────────────────

/**
 * Load the archive manifest for a market (delisted refs → summary entries).
 *
 * Uncached — callers own caching, as with loadMergedDetail. The item page
 * reads it inside a `'use cache'` scope tagged `item-detail`, revalidated by
 * the crawler whenever a market's manifest changes; API/sitemap routes rely
 * on their CDN cache headers instead.
 */
export async function loadArchiveManifest(
  market = "gb",
): Promise<ArchiveManifest> {
  const manifest = await readR2JSON<ArchiveManifest>(
    archiveManifestKey(market),
  );
  return manifest ?? {};
}

/**
 * Load the archived snapshot for a delisted item.
 *
 * Gated on the manifest: an orphan snapshot blob may exist for a live or
 * relisted ref and MUST be ignored unless manifested, or a delisted page
 * renders for an item that is still on sale. Returns null when the ref isn't
 * archived or either fetch fails — callers fall through to not-found.
 *
 * Pass `manifest` if you already hold it, to avoid a second identical fetch.
 */
export async function loadArchivedDetail(
  ref: string,
  market = "gb",
  manifest?: ArchiveManifest,
): Promise<ArchivedDetailBlob | null> {
  const resolvedManifest = manifest ?? (await loadArchiveManifest(market));
  const entry = resolvedManifest[ref];
  if (!entry) return null;

  const blob = await readR2JSON<ArchivedDetailBlob>(
    archivedDetailKey(market, ref),
  );
  if (!blob) return null;

  // Normalize legacy .net share link to .org (matches loadMergedDetail).
  if (blob.sl?.includes("littlebiggy.net")) {
    blob.sl = blob.sl.replace(/littlebiggy\.net/g, "littlebiggy.org");
  }

  // Snapshots predating the arc stamp fall back to the manifest's archivedAt
  // so consumers always get a delist date.
  if (!blob.arc?.at) {
    blob.arc = { src: "live", v: 1, ...blob.arc, at: entry.at };
  }

  return blob;
}
