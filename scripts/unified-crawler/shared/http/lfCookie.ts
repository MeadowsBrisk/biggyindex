import type { MarketCode } from "../types";

// Precomputed "lf" cookie values for LittleBiggy location filter per market.
// This allows us to skip token scraping and POSTing the filter in many cases.
export const LF_BY_MARKET: Partial<Record<MarketCode, string>> = {
  GB: "eyJzaGlwc0Zyb20iOm51bGwsInNoaXBzVG8iOiJHQiJ9",
  DE: "eyJzaGlwc0Zyb20iOm51bGwsInNoaXBzVG8iOiJERSJ9",
  FR: "eyJzaGlwc0Zyb20iOm51bGwsInNoaXBzVG8iOiJGUiJ9",
  IT: "eyJzaGlwc0Zyb20iOm51bGwsInNoaXBzVG8iOiJJVCJ9",
  PT: "eyJzaGlwc0Zyb20iOm51bGwsInNoaXBzVG8iOiJQVCJ9",
};

export function getLocationFilterCookie(market: MarketCode): string | undefined {
  return LF_BY_MARKET[market];
}

// Best-effort: seed the lf cookie onto the client's jar for both apex and www hosts.
export async function seedLocationFilterCookie(client: any, market: MarketCode): Promise<void> {
  try {
    const lfVal = getLocationFilterCookie(market);
    if (!lfVal) return;
    const jar = client?.__jar || client?.defaults?.jar;
    if (!jar) return;
    const cookieStr = `lf=${lfVal}; Domain=.littlebiggy.net; Path=/`;
    const setSync = typeof jar.setCookieSync === 'function';
    const setAsync = typeof jar.setCookie === 'function';
    if (setSync) {
      try { jar.setCookieSync(cookieStr, "https://littlebiggy.net"); } catch {}
      try { jar.setCookieSync(cookieStr, "https://www.littlebiggy.net"); } catch {}
    } else if (setAsync) {
      await new Promise<void>((resolve) => jar.setCookie(cookieStr, "https://littlebiggy.net", () => resolve()));
      await new Promise<void>((resolve) => jar.setCookie(cookieStr, "https://www.littlebiggy.net", () => resolve()));
    }
  } catch {}
}
