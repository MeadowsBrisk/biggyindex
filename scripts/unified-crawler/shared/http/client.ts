// Axios HTTP client factory with optional cookie jar support
// Centralizes headers, agents, and (future) retry/backoff. Keep minimal for Phase A.
import axios, { type AxiosInstance } from "axios";
import { loadCookieJar, saveCookieJar } from "./cookies";

export interface HttpOptions {
  baseURL?: string;
  headers?: Record<string, string>;
}

export function createHttp(opts: HttpOptions = {}): AxiosInstance {
  const instance = axios.create({
    baseURL: opts.baseURL,
    headers: opts.headers,
  });
  return instance;
}

// Cookie-jar backed axios client (uses http-cookie-agent + tough-cookie)
export async function createCookieHttp(opts: {
  headers: Record<string, string>;
  timeoutMs?: number;
}): Promise<{ client: AxiosInstance; jar: any }> {
  const [{ CookieJar }, httpMod] = await Promise.all([
    import("tough-cookie"),
    import("http-cookie-agent/http"),
  ]);
  const { HttpCookieAgent, HttpsCookieAgent } = httpMod as any;
  // Try to reuse a persisted jar; fall back to a fresh one
  const persisted = await loadCookieJar().catch(() => null);
  const jar = persisted && typeof (persisted as any).setCookieSync === "function" ? persisted : new CookieJar();
  const client = axios.create({
    httpAgent: new HttpCookieAgent({ cookies: { jar } }),
    httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
    withCredentials: true,
    timeout: opts.timeoutMs ?? 30000,
    headers: opts.headers,
    // Only treat 2xx as success; callers can override if needed
    validateStatus: (s) => s >= 200 && s < 300,
  });
  // Opportunistically persist jar on process exit in long-lived envs (best-effort)
  try { process.on?.("beforeExit", () => { void saveCookieJar(jar); }); } catch {}
  return { client, jar };
}

// Warm a cookie jar by hitting a non-API page first to establish baseline cookies
export async function warmCookieJar(client: AxiosInstance, url: string) {
  const base = url.includes("/core/api/") ? url.replace("/core/api/", "/").split("?")[0] : url.split("?")[0];
  try {
    await client.get(base, { responseType: "text" });
  } catch {
    // ignore warm-up errors
  }
}
