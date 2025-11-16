import PQueue from "p-queue";
import { ensureAuthedClient } from "../http/authedClient";
import { fetchSellerReviewsPaged } from "../reviews/fetchSellerReviewsPaged";
import { normalizeReviews } from "../reviews/normalizeReviews";
import { loadSellerReviewCache, saveSellerReviewCache, shouldSkipSellerReviews, updateSellerReviewCache } from "../reviews/reviewCache";

export interface SellerReviewsResult {
  reviewsBySeller: Map<string, any[]>;
  reviewsMetaBySeller: Map<string, { fetched: number; sourceFetched: number; mode?: string; pageSizeRequested?: number; pages?: any[] }>;
  processedTotal: number;
  failed: number;
}

export async function collectSellerReviews(opts: {
  sellerIds: string[];
  pageSize: number;
  maxStore: number;
  concurrency: number;
  enableSkip: boolean;
}): Promise<SellerReviewsResult> {
  const { sellerIds, pageSize, maxStore, concurrency, enableSkip } = opts;
  const reviewCache = await loadSellerReviewCache();
  const reviewsBySeller = new Map<string, any[]>();
  const reviewsMetaBySeller = new Map<string, { fetched: number; sourceFetched: number; mode?: string; pageSizeRequested?: number; pages?: any[] }>();
  const { client: httpClient } = await ensureAuthedClient();
  const queue = new PQueue({ concurrency });
  let processed = 0;
  let failed = 0;

  await Promise.allSettled(sellerIds.map((sid) => queue.add(async () => {
    try {
      const firstPage = await fetchSellerReviewsPaged({ client: httpClient, sellerId: sid, pageSize: Math.min(20, pageSize), maxStore: Math.min(20, maxStore) });
      const newest = Array.isArray(firstPage?.reviews) && firstPage.reviews.length ? firstPage.reviews[0] : null;
      const newestCreated = newest ? (typeof newest.created === "number" ? newest.created : (newest.reviewDate || newest.date)) : undefined;
      if (enableSkip && shouldSkipSellerReviews(reviewCache, String(sid), typeof newestCreated === "number" ? newestCreated : undefined)) {
        const normalizedPeek = normalizeReviews(Array.isArray(firstPage?.reviews) ? firstPage.reviews : [], { captureMedia: true, includeItem: true, includeAuthor: true }) || [];
        reviewsBySeller.set(String(sid), normalizedPeek);
        const created = normalizedPeek.length && typeof normalizedPeek[0].created === "number" ? normalizedPeek[0].created : undefined;
        updateSellerReviewCache(reviewCache, String(sid), created, normalizedPeek[0]?.id ?? null);
        reviewsMetaBySeller.set(String(sid), {
          fetched: normalizedPeek.length,
          sourceFetched: typeof firstPage?.sourceFetched === "number" ? firstPage.sourceFetched : normalizedPeek.length,
          mode: "peek",
          pageSizeRequested: Math.min(20, pageSize),
          pages: firstPage?.meta?.pages || [],
        });
        console.log(`[sellers] reviews cached id=${sid} fetched=${normalizedPeek.length} source=${typeof firstPage?.sourceFetched === "number" ? firstPage.sourceFetched : normalizedPeek.length} mode=peek`);
        return;
      }
      const fullPage = await fetchSellerReviewsPaged({ client: httpClient, sellerId: sid, pageSize, maxStore });
      const raw = Array.isArray(fullPage?.reviews) ? fullPage.reviews : [];
      const normalized = normalizeReviews(raw, { captureMedia: true, includeItem: true, includeAuthor: true }) || [];
      if (normalized.length) {
        const first = normalized[0];
        const created = typeof first.created === "number" ? first.created : (typeof (first as any).reviewDate === "number" ? (first as any).reviewDate : undefined);
        updateSellerReviewCache(reviewCache, String(sid), created, (first as any).id || (first as any).reviewId || null);
      }
      reviewsBySeller.set(String(sid), normalized);
      reviewsMetaBySeller.set(String(sid), {
        fetched: normalized.length,
        sourceFetched: typeof fullPage?.sourceFetched === "number" ? fullPage.sourceFetched : normalized.length,
        mode: fullPage?.meta?.mode || "paged",
        pageSizeRequested: fullPage?.meta?.pageSizeRequested || pageSize,
        pages: fullPage?.meta?.pages || [],
      });
      console.log(`[sellers] reviews stored id=${sid} fetched=${normalized.length} source=${typeof fullPage?.sourceFetched === "number" ? fullPage.sourceFetched : normalized.length} mode=${fullPage?.meta?.mode || "paged"}`);
    } catch (err) {
      failed++;
      console.warn(`[crawler:sellers] reviews fetch failed seller=${sid} ${(err as any)?.message || err}`);
      reviewsBySeller.set(String(sid), []);
      reviewsMetaBySeller.set(String(sid), { fetched: 0, sourceFetched: 0, mode: "error" });
    } finally {
      processed++;
      if (processed % 10 === 0) console.log(`[crawler:sellers] progress sellers=${processed}/${sellerIds.length}`);
    }
  })));

  try { await saveSellerReviewCache(reviewCache); } catch {}
  return { reviewsBySeller, reviewsMetaBySeller, processedTotal: processed, failed };
}
