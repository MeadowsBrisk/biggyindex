import type { AxiosInstance } from "axios";
import { createCookieHttp, warmCookieJar } from "../http/client";
import { saveCookieJar } from "../http/cookies";

export interface LoginOptions {
  username: string;
  password: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface LoginResult {
  client: AxiosInstance;
  jar: any;
  cookies: string[];
}

// TS port of legacy auth/login.js using our shared cookie-enabled client; preserves host fallback and checks JWT_USER.
export async function login(opts: LoginOptions): Promise<LoginResult> {
  const { username, password } = opts;
  const timeoutMs = opts.timeoutMs ?? 45000;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  if (!username || !password) throw new Error("login: missing credentials");
  const hosts = ["https://littlebiggy.net", "https://www.littlebiggy.net"];
  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const host of hosts) {
      try {
        const { client, jar } = await createCookieHttp({
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 UnifiedCrawler/PhaseA",
            Accept: "application/json, text/plain, */*",
            Referer: host + "/",
            Origin: host,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/json",
          },
          timeoutMs,
        });
        // Warm-up to seed any cookies
        try { await warmCookieJar(client, host + "/core/api/auth/login"); } catch {}

        const url = host + "/core/api/auth/login";
        // eslint-disable-next-line no-console
        console.info(`[auth] attempt=${attempt}/${maxAttempts} host=${host}`);
        const res = await client.post(url, { username, password });
        const setCookies = (res.headers?.["set-cookie"] as string[]) || [];
        const hasJwt = setCookies.some((c) => /^JWT_USER=/.test(c));
        if (!hasJwt) {
          // eslint-disable-next-line no-console
          console.warn("[auth] Response lacked JWT_USER cookie; treating as failure");
          throw new Error("missing JWT_USER cookie");
        }
        // Persist cookies for reuse
        try { await saveCookieJar(jar); } catch {}
        return { client, jar, cookies: setCookies };
      } catch (e: any) {
        lastErr = e;
        const status = e?.response?.status;
        const isTimeout = e?.code === "ECONNABORTED";
        // eslint-disable-next-line no-console
        console.warn(
          `[auth] failed attempt=${attempt} host=${host} status=${status || e?.code || "ERR"}${
            isTimeout ? " (timeout)" : ""
          }`
        );
        if (status === 401 || status === 403) throw new Error(`Auth failed status=${status}`);
      }
    }
    if (attempt < maxAttempts) {
      const backoff = 1200 * attempt + Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr || new Error("Login failed after retries");
}
