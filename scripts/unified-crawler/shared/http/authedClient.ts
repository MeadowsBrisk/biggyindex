import type { AxiosInstance } from "axios";
import { loadEnv } from "../env/loadEnv";
import { login } from "../auth/login";
import { createCookieHttp } from "./client";

export async function ensureAuthedClient(): Promise<{ client: AxiosInstance; jar: any }> {
  const env = loadEnv();
  // If credentials are present, perform a full login and return that client
  if (env.auth.username && env.auth.password) {
    try {
      const res = await login({ username: env.auth.username, password: env.auth.password });
      return { client: res.client, jar: res.jar };
    } catch (e: any) {
      console.warn(`[authedClient] login failed, falling back to anonymous client: ${e?.message || e}`);
    }
  }
  // Anonymous cookie-enabled client (may be insufficient for some endpoints)
  const { client, jar } = await createCookieHttp({ headers: { "User-Agent": "UnifiedCrawler" } });
  return { client, jar };
}
