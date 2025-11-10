// TypeScript port of normalizeReviews
// Converts raw API review objects to a normalized structure with optional media + item metadata

export interface RawReviewSegmentImage { contentType: 'blot'; blotName: 'image'; value: string; }
export interface RawReviewSegmentPlain { contentType: 'plain'; value: string; }
export interface RawReviewContent {
  contentType?: 'plain' | 'blot' | string;
  blotName?: 'image' | string;
  value?: string;
}

export interface RawReviewItem { id?: number; refNum?: string | number; name?: string; }

export interface RawReview {
  id?: any;
  created?: any; // number (epoch secs) or ISO string
  rating?: number;
  daysToArrive?: number;
  content?: RawReviewContent[];
  item?: RawReviewItem;
  // allow any other fields
  [k: string]: any;
}

export interface NormalizedReviewSegmentText { type: 'text'; value: string; }
export interface NormalizedReviewSegmentImage { type: 'image'; url: string; }
export type NormalizedReviewSegment = NormalizedReviewSegmentText | NormalizedReviewSegmentImage | { type: string; [k: string]: any };

export interface NormalizedReviewItem { refNum: string | null; name: string | null; id: number | null; }
export interface NormalizedReview {
  id: any;
  created: any;
  rating?: number;
  daysToArrive?: number;
  segments: NormalizedReviewSegment[];
  item?: NormalizedReviewItem;
  itemId?: string | null;
  [k: string]: any;
}

export interface NormalizeOptions {
  captureMedia?: boolean;
  includeItem?: boolean;
  includeAuthor?: boolean; // reserved for future use
}

export function normalizeReviews(rawReviews: RawReview[], opts: NormalizeOptions = {}): NormalizedReview[] {
  const { captureMedia = true, includeItem = false } = opts;
  if (!Array.isArray(rawReviews)) return [];
  return rawReviews.map(r => {
    const segments: NormalizedReviewSegment[] = [];
    if (Array.isArray(r.content)) {
      for (const part of r.content) {
        if (!part) continue;
        if (part.contentType === 'plain') {
          if (typeof part.value === 'string') {
            const raw = part.value;
            if (raw.trim()) {
              segments.push({ type: 'text', value: raw });
            } else if (/\r|\n/.test(raw)) {
              const prev = segments[segments.length - 1];
              if (!(prev && prev.type === 'text' && /\n\n$/.test((prev as any).value))) {
                segments.push({ type: 'text', value: '\n\n' });
              }
            }
          }
        } else if (captureMedia && part.contentType === 'blot' && (part.blotName === 'image' || part.blotName === 'video')) {
          if (typeof part.value === 'string') {
            const kind = part.blotName === 'video' ? 'video' : 'image';
            segments.push({ type: kind, url: part.value });
          }
        } else if (part.contentType && (part as any).value) {
          segments.push({ type: String(part.contentType), value: (part as any).value });
        }
      }
    }
    const out: NormalizedReview = {
      id: r.id,
      created: r.created,
      rating: r.rating,
      daysToArrive: r.daysToArrive,
      segments,
    };
    if (includeItem && r.item && typeof r.item === 'object') {
      out.item = {
        refNum: r.item.refNum != null ? String(r.item.refNum) : null,
        name: r.item.name || null,
        id: r.item.id != null ? r.item.id : null,
      };
      out.itemId = out.item.refNum || (out.item.id != null ? String(out.item.id) : null);
    }
    return out;
  });
}
