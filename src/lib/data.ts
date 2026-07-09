/**
 * Data loading helpers for BiggyIndex v2.
 *
 * Mirrors food-aggregator pattern:
 * - `loadItems()` returns browse-optimised items (descriptions truncated, hash-first images)
 * - `loadSellers()` returns seller list
 * - `loadItemByRef()` loads a single item's full detail from per-item R2 file
 * - `stripBrowseFields()` trims fields unused by browse components
 */

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
// Written by the crawler's archive stage
// (dashboard/scripts/unified-crawler/stages/archive/logic.ts).
// ref ∈ manifest ⇔ archived; manifest keys and indexed_items refs are
// kept strictly disjoint by the crawler.

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
 * Archived snapshot blob — the full merged detail blob as last seen,
 * plus the archive stamp. backfill-v1 snapshots may lack ih/ish entirely
 * (no-image state) and have empty shOpts.
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
 * Strip fields unused by browse components to shrink RSC payload.
 *
 * - `d` — truncated to ~260 chars; CSS line-clamp handles visual clipping.
 *         Full description available via item detail API.
 * - `dEn`, `nEn` — translation originals not used on browse.
 * - `lur` — last update reason only shown in item detail.
 *
 * NOTE: public index output now prefers crawler-stamped `ih`/`ish` hashes.
 * Raw `i`/`is` may still be present for items whose optimized images are not
 * confirmed yet, so the loader leaves those fallback fields untouched.
 */
/**
 * @param market lowercase market code. On English markets (GB, IE) the
 *   English original (`nEn`/`dEn`) duplicates `n`/`d`, so strip them.
 *   On translated markets we KEEP them so the global "Show in English"
 *   toggle (`forceEnglishAtom`) can swap to originals on browse cards
 *   without re-fetching. Strips on `dEn` truncation match `d`.
 */
function stripBrowseFields(items: Item[], market: string): Item[] {
  const isEnglishMarket = market === "gb" || market === "ie";
  for (const item of items) {
    if (item.d) item.d = truncateDesc(item.d);
    if (isEnglishMarket) {
      delete item.dEn;
      delete item.nEn;
    } else {
      // Truncate the English description to the same length as the
      // translated one — the toggle should swap "the same length of text"
      // not surprise users with a much longer / shorter blurb.
      if (item.dEn) item.dEn = truncateDesc(item.dEn);
      // Drop nEn if it's identical to n (untranslated item) — keeps the
      // payload small for items where translation didn't add anything.
      if (item.nEn && item.nEn === item.n) delete item.nEn;
    }
    // Normalize legacy .net share links to .org (canonical domain). Belt-and-braces
    // with the R2 fix-net-to-org script — covers any items that slip through.
    if (item.sl && item.sl.includes("littlebiggy.net")) {
      item.sl = item.sl.replace(/littlebiggy\.net/g, "littlebiggy.org");
    }
    // Keep any remaining raw image fields as fallback for not-yet-optimized items.
    // Keep `lur` — shown on hover title ("Images changed, -3 variants") and used
    // by ItemCard to decide whether to show "Updated X ago". Only a few KB total.
  }
  return items;
}

/**
 * Strip seller fields unused by browse to shrink payload.
 * `url` is a littlebiggy.net URL we don't want in the frontend.
 */
function stripSellerFields(sellers: Seller[]): Seller[] {
  for (const seller of sellers) {
    // url is a littlebiggy.net link — strip from frontend payload
    delete (seller as unknown as Record<string, unknown>).url;
  }
  return sellers;
}

// ─── Browse data version ────────────────────────────────────────

/**
 * Stable short version of the browse dataset — changes whenever the dataset
 * meaningfully changes. Used to version /api/browse URLs so browsers can
 * cache the payload immutably across visits (pattern from food-aggregator).
 *
 * Hashes per-item id/lua/lur/prices/variant-count/category rather than just
 * count+max(lua): repair scripts can REVERT lua values (making the max
 * unchanged), and an unchanged version would leave browsers pinned to the
 * pre-repair payload forever via the immutable cache.
 *
 * Hotness (`h`) is deliberately excluded — it drifts every crawl, and any
 * crawl that matters also touches lua/price/variants on some item, so the
 * version still rolls over when real changes land.
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
 * The variants (`{hash}/w320.avif`, …) are per-hash in R2, so a single global
 * lookup keyed by hash is authoritative regardless of which item references it.
 * Only entries stamped `variantV >= IMAGE_VARIANT_VERSION` with a non-empty
 * width list are included — legacy / tiny-source hashes are simply absent, and
 * their cards fall back to the plain `thumb.avif` with no srcset.
 *
 * Cached like the item data ('items' profile + tag) so the crawler's existing
 * revalidation rolls this over in lockstep with the grid, and the ~625KB
 * aggregate is fetched at most once per revalidation window per instance.
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

/** Load pre-built home feed — single R2 read replaces 5 separate loads. */
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

// ─── Archive loaders (delisted items) ───────────────────────────

/**
 * Load the archive manifest for a market (delisted refs → summary entries).
 *
 * Plain loader — same idiom as loadMergedDetail: callers cache. The item
 * page reads it inside a `'use cache'` scope tagged `item-detail`, which the
 * crawler revalidates whenever any market's manifest changes (archive,
 * relist, or applied backfill); the API/sitemap routes rely on their CDN
 * cache headers.
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
 * relisted ref and MUST be ignored unless manifested. Returns null when the
 * ref isn't archived or either fetch fails — callers fall through to their
 * not-found flow.
 */
export async function loadArchivedDetail(
  ref: string,
  market = "gb",
): Promise<ArchivedDetailBlob | null> {
  const manifest = await loadArchiveManifest(market);
  const entry = manifest[ref];
  if (!entry) return null;

  const blob = await readR2JSON<ArchivedDetailBlob>(
    archivedDetailKey(market, ref),
  );
  if (!blob) return null;

  // Normalize legacy .net share link to .org (matches loadMergedDetail).
  if (blob.sl?.includes("littlebiggy.net")) {
    blob.sl = blob.sl.replace(/littlebiggy\.net/g, "littlebiggy.org");
  }

  // Belt-and-braces: if a snapshot ever predates the arc stamp, fall back
  // to the manifest's archivedAt so consumers always get a delist date.
  if (!blob.arc?.at) {
    blob.arc = { src: "live", v: 1, ...blob.arc, at: entry.at };
  }

  return blob;
}
