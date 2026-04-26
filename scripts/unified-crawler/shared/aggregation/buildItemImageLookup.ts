// Build a compact item image lookup from a market index list.
// `byRef`/`byId` stay as display URL maps for legacy consumers, while
// `recordsByRef`/`recordsById` preserve source URLs for crawler retry stages
// after public browse JSON drops raw `i`/`is` fields.

type ImageAnimatedFlag = 0 | 1 | boolean | null;

export type IndexEntry = {
  id?: string | number;
  refNum?: string | number;
  ref?: string | number;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  i?: string | null;
  is?: string[] | null;
  t?: string | null;
  ih?: string | null;
  ish?: Array<string | null> | null;
  ia?: ImageAnimatedFlag;
  isa?: ImageAnimatedFlag[] | null;
};

export interface ItemImageRecord {
  i?: string | null;
  is?: string[];
  ih?: string | null;
  ish?: Array<string | null>;
  ia?: ImageAnimatedFlag;
  isa?: ImageAnimatedFlag[];
}

export interface ItemImageLookup {
  byRef: Record<string, string>;
  byId: Record<string, string>;
  recordsByRef: Record<string, ItemImageRecord>;
  recordsById: Record<string, ItemImageRecord>;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return out.length ? out : undefined;
}

function nullableStringArray(value: unknown): Array<string | null> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((item) => (typeof item === 'string' && item.length > 0 ? item : null));
  return out.some((item) => item != null) ? out : undefined;
}

function animatedArray(value: unknown): ImageAnimatedFlag[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.length ? value.map((item) => (item === 1 || item === 0 || typeof item === 'boolean' ? item : null)) : undefined;
}

function imageCdnBase(): string {
  const base = process.env.NEXT_PUBLIC_R2_IMAGES_URL || process.env.R2_IMAGES_PUBLIC_URL || 'img.biggyindex.com';
  return base.startsWith('http') ? base.replace(/\/$/, '') : `https://${base.replace(/\/$/, '')}`;
}

function isAnimated(value: ImageAnimatedFlag | undefined): boolean {
  return value === true || value === 1;
}

export function buildItemImageRecord(raw: IndexEntry | any): ItemImageRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const primary = stringValue(raw.i) ?? stringValue(raw.imageUrl) ?? stringValue(raw.t);
  const gallery = stringArray(raw.is) ?? stringArray(raw.imageUrls);
  const primaryHash = stringValue(raw.ih);
  const galleryHashes = nullableStringArray(raw.ish);
  const galleryAnimated = animatedArray(raw.isa);
  const record: ItemImageRecord = {};

  if (primary) record.i = primary;
  if (gallery) record.is = gallery;
  if (primaryHash) record.ih = primaryHash;
  if (galleryHashes) record.ish = galleryHashes;
  if (raw.ia === 1 || raw.ia === 0 || typeof raw.ia === 'boolean') record.ia = raw.ia;
  if (galleryAnimated) record.isa = galleryAnimated;

  return Object.keys(record).length ? record : null;
}

export function getItemImageDisplayUrl(record: ItemImageRecord | IndexEntry | any | null | undefined, size: 'thumb' | 'full' | 'icon' = 'thumb'): string | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const hash = stringValue((record as ItemImageRecord).ih);
  if (hash) {
    return isAnimated((record as ItemImageRecord).ia) ? `${imageCdnBase()}/${hash}/anim.webp` : `${imageCdnBase()}/${hash}/${size}.avif`;
  }
  return stringValue((record as ItemImageRecord).i) ?? stringValue((record as any).imageUrl) ?? undefined;
}

export function buildItemImageLookupFromIndex(index: Array<IndexEntry | any>): ItemImageLookup {
  const lookup: ItemImageLookup = { byRef: {}, byId: {}, recordsByRef: {}, recordsById: {} };
  if (!Array.isArray(index)) return lookup;

  for (const raw of index) {
    if (!raw || typeof raw !== 'object') continue;
    const id = raw.id != null ? String(raw.id) : null;
    const ref = raw.refNum != null ? String(raw.refNum) : (raw.ref != null ? String(raw.ref) : null);
    const record = buildItemImageRecord(raw);
    if (!record) continue;

    const displayUrl = getItemImageDisplayUrl(record);
    if (ref) {
      if (!lookup.recordsByRef[ref]) lookup.recordsByRef[ref] = record;
      if (displayUrl && !lookup.byRef[ref]) lookup.byRef[ref] = displayUrl;
    }
    if (id) {
      if (!lookup.recordsById[id]) lookup.recordsById[id] = record;
      if (displayUrl && !lookup.byId[id]) lookup.byId[id] = displayUrl;
    }
  }

  return lookup;
}

export function getItemImageRecord(
  lookup: Partial<ItemImageLookup> | null | undefined,
  refOrId: string | number | null | undefined,
  id?: string | number | null,
): ItemImageRecord | undefined {
  if (!lookup) return undefined;
  const refKey = refOrId != null ? String(refOrId) : null;
  const idKey = id != null ? String(id) : null;
  const rich =
    (refKey ? lookup.recordsByRef?.[refKey] : undefined) ??
    (idKey ? lookup.recordsById?.[idKey] : undefined) ??
    (refKey ? lookup.recordsById?.[refKey] : undefined);
  if (rich) return rich;

  const legacyUrl =
    (refKey ? lookup.byRef?.[refKey] : undefined) ??
    (idKey ? lookup.byId?.[idKey] : undefined) ??
    (refKey ? lookup.byId?.[refKey] : undefined);
  return legacyUrl ? { i: legacyUrl } : undefined;
}

export function mergeItemImageRecord<T extends Record<string, any>>(entry: T, record: ItemImageRecord | null | undefined): T {
  if (!record) return entry;
  const merged = { ...entry } as Record<string, any>;
  if (record.i && !merged.i && !merged.imageUrl) merged.i = record.i;
  if (record.is?.length && !(Array.isArray(merged.is) && merged.is.length) && !(Array.isArray(merged.imageUrls) && merged.imageUrls.length)) merged.is = record.is;
  if (record.ih && !merged.ih) merged.ih = record.ih;
  if (record.ish?.length && !(Array.isArray(merged.ish) && merged.ish.length)) merged.ish = record.ish;
  if (record.ia != null && merged.ia == null) merged.ia = record.ia;
  if (record.isa?.length && !(Array.isArray(merged.isa) && merged.isa.length)) merged.isa = record.isa;
  return merged as T;
}

export function collectItemImageSourceUrls(entry: IndexEntry | any, record?: ItemImageRecord | null): string[] {
  const urls: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0 && !urls.includes(value)) urls.push(value);
  };
  const source = record ?? buildItemImageRecord(entry);
  add(entry?.i);
  add(entry?.imageUrl);
  add(source?.i);
  for (const url of stringArray(entry?.is) ?? []) add(url);
  for (const url of stringArray(entry?.imageUrls) ?? []) add(url);
  for (const url of source?.is ?? []) add(url);
  return urls;
}
