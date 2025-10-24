import { createCookieHttp } from "../../shared/http/client";
import { login } from "../../shared/auth/login";
import { loadEnv } from "../../shared/env/loadEnv";
import type { AxiosInstance } from "axios";

// Use legacy, proven fetchers for now; we'll port them to TS later for parity
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchReviewsPage } = require("../../../item-crawler/fetch/fetchReviewsPage");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeReviews } = require("../../../item-crawler/parse/normalizeReviews");

export interface ReviewResult {
  ok: boolean;
  refNum: string;
  total?: number;
  stored?: number;
  data?: any;
  error?: string;
}

export async function ensureAuthedClient(): Promise<{ client: AxiosInstance; jar: any }> {
  const env = loadEnv();
  // If credentials are present, perform a full login and return that client
  if (env.auth.username && env.auth.password) {
    try {
      const res = await login({ username: env.auth.username, password: env.auth.password });
      return { client: res.client, jar: res.jar };
    } catch {
      // fall through to anonymous client
    }
  }
  // Anonymous cookie-enabled client (may be insufficient for reviews)
  const { client, jar } = await createCookieHttp({ headers: { "User-Agent": "UnifiedCrawler/PhaseA" } });
  return { client, jar };
}

export async function fetchFirstReviews(client: AxiosInstance, refNum: string, pageSize = 100): Promise<ReviewResult> {
  try {
    const page = await fetchReviewsPage({ client, refNum, offset: 0, pageSize });
    const rawReviews = Array.isArray(page?.reviews) ? page.reviews : [];
    const normalized = normalizeReviews(rawReviews, { captureMedia: true, includeAuthor: true });
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
