/**
 * Transforms a raw API item into a minified market-index entry.
 *
 * Extracted from run.ts's massive .map() callback to allow independent testing
 * and improve readability of the indexer orchestrator.
 */

import type { IndexMetaEntry } from '../../shared/logic/indexMetaStore';
import { diffMarketIndexEntries } from '../../shared/logic/changes';
import { mergeIndexMetaEntry } from '../../shared/logic/indexMetaStore';
import { isTipListing, isCustomListing } from '../../shared/exclusions/listing';
import { categorize } from '../../shared/categorization/index';

export interface NormalizeContext {
  code: string;
  prevByRef: Map<string, any>;
  prevByNum: Map<string, any>;
  coldStart: boolean;
  hashUrl: (url: string) => string;
  sharesAgg: Record<string, string>;
  shipAgg: Record<string, { min?: number; max?: number; free?: number | boolean }>;
  indexMetaAgg: Record<string, IndexMetaEntry>;
  imageMetaAgg: Record<string, { hashes: string[] }>;
  translationsAgg: Record<string, { sourceHash: string; locales: Record<string, { n: string; d: string; v?: { vid: string | number; d: string }[] }> }>;
  categoryOverrides: Map<string, { primary: string; subcategories: string[] }>;
  itemReviewSummaries: Record<string, any>;
  needsTranslation: boolean;
  targetLocale: string | null;
}

export interface NormalizeResult {
  entry: Record<string, any>;
  canonicalKey: string;
  numKey: string | null;
  metaUpdate?: { key: string; next: IndexMetaEntry };
  appliedMeta: boolean;
  appliedTranslation: boolean;
  appliedImageMeta: boolean;
}

function normalizeSh(x: any) {
  if (!x || typeof x !== 'object') return undefined;
  const out: any = {};
  if (typeof x.min === 'number') out.min = x.min;
  if (typeof x.max === 'number') out.max = x.max;
  if (typeof x.free === 'number') out.free = x.free ? 1 : 0;
  else if (typeof x.free === 'boolean') out.free = x.free ? 1 : 0;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Normalize a single raw API item into a minified market-index entry.
 * Returns null if the item should be excluded (tip listing, custom order, etc.).
 */
export function normalizeItem(it: any, ctx: NormalizeContext): NormalizeResult | null {
  const ref = it?.refNum ?? it?.refnum ?? it?.ref;
  const numId = it?.id;
  const refKey = ref != null ? String(ref) : null;
  const numKey = numId != null ? String(numId) : null;
  const canonicalKey = refKey ?? numKey;
  if (!canonicalKey) return null;

  const numericValue = typeof numId === 'number' ? numId : (numKey && /^\d+$/.test(numKey) ? Number(numKey) : null);
  const entryId = numericValue != null ? numericValue : (numKey ?? canonicalKey);
  const name = it?.name;
  const description = it?.description || '';

  // Exclusions: tip jars, custom orders/listings
  try {
    if (isTipListing(name, description) || isCustomListing(name, description)) return null;
  } catch { }

  const images: string[] = Array.isArray(it?.images) ? it.images : [];
  const primaryImg = images[0] || undefined;
  const imgSmall = images.length ? images.slice(0, 3) : undefined;

  // Normalize varieties into compact variant entries with USD
  const varieties: any[] = Array.isArray(it?.varieties) ? it.varieties : [];
  const v = varieties.map((vv: any) => {
    const usdStr = vv?.basePrice?.amount ?? vv?.basePrice?.value ?? undefined;
    const usd = typeof usdStr === 'string' ? parseFloat(usdStr) : (typeof usdStr === 'number' ? usdStr : undefined);
    const d = vv?.description;
    const vid = vv?.id;
    const out: Record<string, unknown> = {};
    if (vid != null) out.vid = vid;
    if (d) out.d = d;
    if (typeof usd === 'number' && Number.isFinite(usd)) out.usd = usd;
    return out;
  }).filter((o: any) => Object.keys(o).length > 0);

  // USD price bounds
  const usdVals = v.map((x: any) => x.usd).filter((n: any) => typeof n === 'number' && Number.isFinite(n)) as number[];
  const uMin = usdVals.length ? Math.min(...usdVals) : undefined;
  const uMax = usdVals.length ? Math.max(...usdVals) : undefined;

  // Seller info
  const sid = it?.seller?.id ?? it?.sellerId;
  const sn = it?.seller?.name;
  const h = it?.hotness;
  const sf = it?.shipsFrom ?? it?.ships_from;

  const entry: Record<string, any> = { id: entryId };
  if (canonicalKey) entry.refNum = canonicalKey;
  if (name) entry.n = name;
  if (description) entry.d = description;

  let _appliedImageMeta = false;
  if (primaryImg) {
    entry.i = primaryImg;
    const hash = ctx.hashUrl(primaryImg);
    const meta = canonicalKey ? ctx.imageMetaAgg[canonicalKey] : undefined;
    const metaNum = numKey ? ctx.imageMetaAgg[numKey] : undefined;
    const hashes = meta?.hashes || metaNum?.hashes;
    if (hashes && Array.isArray(hashes) && hashes.includes(hash)) {
      entry.io = 1;
      _appliedImageMeta = true;
    }
  }
  if (imgSmall && imgSmall.length) entry.is = imgSmall;
  if (v.length) entry.v = v;
  if (uMin != null) entry.uMin = uMin;
  if (uMax != null) entry.uMax = uMax;
  if (sid != null) entry.sid = sid;
  if (sn) entry.sn = sn;
  if (h != null) entry.h = h;
  if (sf) entry.sf = sf;

  // Review stats (minified key: rs)
  const ir = (canonicalKey && ctx.itemReviewSummaries?.[canonicalKey]) ?? (numKey ? ctx.itemReviewSummaries?.[numKey] : undefined);
  if (ir) {
    const rsObj: Record<string, any> = {};
    if (typeof ir.averageRating === 'number') rsObj.avg = ir.averageRating;
    if (typeof ir.averageDaysToArrive === 'number') rsObj.days = ir.averageDaysToArrive;
    if (typeof ir.numberOfReviews === 'number') rsObj.cnt = ir.numberOfReviews;
    if (Object.keys(rsObj).length > 0) entry.rs = rsObj;
  }

  // Categorization: manual override first, then automated pipeline
  try {
    const override = ctx.categoryOverrides.get(String(canonicalKey)) ||
      (numKey ? ctx.categoryOverrides.get(String(numKey)) : null);
    if (override) {
      entry.c = override.primary;
      if (override.subcategories.length > 0) entry.sc = override.subcategories;
    } else if (name || description) {
      const cat = categorize(name || '', description || '');
      if (cat?.primary) entry.c = cat.primary;
      if (Array.isArray(cat?.subcategories) && cat.subcategories.length) entry.sc = cat.subcategories;
    }
  } catch { }

  // Change detection vs previous index
  let prev = ctx.prevByRef.get(String(ref || ''));
  if (!prev && numId != null) prev = ctx.prevByNum.get(String(numId));
  const nowIso = new Date().toISOString();

  const metaHit = canonicalKey ? ctx.indexMetaAgg[canonicalKey] : undefined;
  const _appliedMeta = !!metaHit;
  const isEnglishMarket = ctx.code === 'GB';
  const { changed, reasons: changeReasons } = diffMarketIndexEntries(prev, entry, isEnglishMarket);

  // Timestamp handling (fsa, lua, lur)
  const fsa = metaHit?.fsa || prev?.fsa || prev?.firstSeenAt;
  if (fsa) entry.fsa = fsa;
  else if (!prev && !metaHit?.fsa && !ctx.coldStart) entry.fsa = nowIso;

  let carriedLua: string | undefined = undefined;
  const metaLuaExplicitlyCleared = metaHit && 'lua' in metaHit && metaHit.lua === '';
  if (metaHit?.lua) carriedLua = metaHit.lua;
  else if (!metaLuaExplicitlyCleared && prev?.lua) carriedLua = prev.lua;
  else if (!metaLuaExplicitlyCleared && prev?.lastUpdatedAt) carriedLua = prev.lastUpdatedAt;
  const carriedLur = metaHit?.lur ?? prev?.lur ?? prev?.lastUpdateReason ?? null;
  if (changed && changeReasons.length > 0) {
    entry.lua = nowIso;
    entry.lur = changeReasons.join(', ');
  } else if (carriedLua) {
    entry.lua = carriedLua;
    if (carriedLur != null) entry.lur = carriedLur;
  }

  // Translations (applied AFTER change detection)
  let _appliedTranslation = false;
  if (ctx.needsTranslation && ctx.targetLocale && canonicalKey) {
    const itemTranslation = ctx.translationsAgg[canonicalKey];
    const localeTranslation = itemTranslation?.locales?.[ctx.targetLocale];
    if (localeTranslation?.n) {
      if (entry.n) entry.nEn = entry.n;
      if (entry.d) entry.dEn = entry.d;
      entry.n = localeTranslation.n;
      if (localeTranslation.d) entry.d = localeTranslation.d;
      _appliedTranslation = true;

      if (localeTranslation.v && Array.isArray(localeTranslation.v) && Array.isArray(entry.v)) {
        const variantTranslationMap = new Map<string | number, string>();
        for (const vt of localeTranslation.v) {
          if (vt.vid !== undefined && vt.d) variantTranslationMap.set(vt.vid, vt.d);
        }
        for (const variant of entry.v) {
          if (variant.vid !== undefined) {
            const translatedDesc = variantTranslationMap.get(variant.vid);
            if (translatedDesc && variant.d) {
              variant.dEn = variant.d;
              variant.d = translatedDesc;
            }
          }
        }
      }
    }
  }

  // Endorsements: preserve or default 0
  entry.ec = typeof prev?.ec === 'number'
    ? prev.ec
    : (typeof prev?.endorsementCount === 'number' ? prev.endorsementCount : 0);

  // Share link: carry forward or use aggregate
  if (prev?.sl) entry.sl = prev.sl;
  else if (canonicalKey && ctx.sharesAgg[canonicalKey]) entry.sl = ctx.sharesAgg[canonicalKey];

  // Shipping summary: aggregate > previous sh > previous ship (legacy)
  const shFromAgg = canonicalKey && ctx.shipAgg[canonicalKey] ? normalizeSh(ctx.shipAgg[canonicalKey]) : undefined;
  const shFromPrev = prev?.sh ? normalizeSh(prev.sh) : (prev?.ship ? normalizeSh(prev.ship) : undefined);
  entry.sh = shFromAgg ?? shFromPrev;

  // IndexMeta merge
  let metaUpdate: { key: string; next: IndexMetaEntry } | undefined;
  if (canonicalKey) {
    const candidate = {
      fsa: typeof entry.fsa === 'string' ? entry.fsa : null,
      lua: typeof entry.lua === 'string' ? entry.lua : null,
      lur: typeof entry.lur === 'string' ? entry.lur : null,
      lsi: new Date().toISOString(),
    };
    const result = mergeIndexMetaEntry(ctx.indexMetaAgg[canonicalKey], candidate);
    if (result.changed) {
      metaUpdate = { key: canonicalKey, next: result.next };
    }
  }

  return {
    entry,
    canonicalKey,
    numKey,
    metaUpdate,
    appliedMeta: _appliedMeta,
    appliedTranslation: _appliedTranslation,
    appliedImageMeta: _appliedImageMeta,
  };
}
