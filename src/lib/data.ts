/**
 * Data loading helpers for BiggyIndex v2.
 *
 * Mirrors food-aggregator pattern:
 * - `loadItems()` returns browse-optimised items (descriptions truncated, hash-first images)
 * - `loadSellers()` returns seller list
 * - `loadItemByRef()` loads a single item's full detail from per-item R2 file
 * - `stripBrowseFields()` trims fields unused by browse components
 */

import { readR2JSON, R2Keys } from "./r2";
import type { Item, Seller, HomeFeed, MergedDetailBlob } from "./types";

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
function stripBrowseFields(items: Item[]): Item[] {
  for (const item of items) {
    if (item.d) item.d = truncateDesc(item.d);
    delete item.dEn;
    delete item.nEn;
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

// ─── Data loaders ───────────────────────────────────────────────

/** Load all items for a market (browse-optimised). */
export async function loadItems(market = "gb"): Promise<Item[]> {
  const items = await readR2JSON<Item[]>(R2Keys.items(market));
  return items ? stripBrowseFields(items) : [];
}

/** Load sellers for a market. */
export async function loadSellers(market = "gb"): Promise<Seller[]> {
  const sellers = await readR2JSON<Seller[]>(R2Keys.sellers(market));
  return sellers ? stripSellerFields(sellers) : [];
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
    (item as unknown as Record<string, unknown>).shippingOptions = ship.translations.shippingOptions;
  } else if (ship?.options) {
    (item as unknown as Record<string, unknown>).shippingOptions = ship.options;
  }
  if (ship?.translations?.description) {
    (item as unknown as Record<string, unknown>).descriptionTranslated = ship.translations.description;
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
