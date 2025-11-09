import type { AxiosInstance } from "axios";
import { ensureAuthedClient } from "../../shared/http/authedClient";
import { fetchReviewsPage } from "../../shared/reviews/fetchItemReviewsPage";
import { normalizeReviews } from "../../shared/reviews/normalizeReviews";

export interface ReviewResult {
  ok: boolean;
  refNum: string;
  total?: number;
  stored?: number;
  data?: any;
  error?: string;
}

// ensureAuthedClient moved to shared/http/authedClient to avoid stage coupling

export async function fetchFirstReviews(client: AxiosInstance, refNum: string, pageSize = 100): Promise<ReviewResult> {
  try {
    const page = await fetchReviewsPage({ client, refNum, offset: 0, pageSize });
    const rawReviews = Array.isArray(page?.reviews) ? page.reviews : [];
  // Include item details so downstream aggregates (e.g., recent reviews) can build itemUrl and show item name/ref
  const normalized = normalizeReviews(rawReviews, { captureMedia: true, includeItem: true, includeAuthor: true });
    // The endpoint does not expose a total count here; report what we fetched on this page
    const total = rawReviews.length;
    const stored = Array.isArray(normalized) ? normalized.length : 0;
    // Return normalized array and include a tiny bit of page context for potential future use
    const data = { reviews: normalized, first: page?.first ?? 0, n: page?.n ?? pageSize };
    return { ok: true, refNum, total, stored, data };
  } catch (e: any) {
    return { ok: false, refNum, error: e?.message || String(e) };
  }
}
