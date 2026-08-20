export type AnnouncementSeverity = "info" | "warning" | "success";

/**
 * Announcement banner config — hardcoded in the repo.
 *
 * To show a banner: flip `active: true`, edit messages, redeploy.
 * Use `{{mbr}}` for a mobile-only line break inside messages.
 *
 * Hardcoded on purpose: the banner runs a handful of times a year (launches,
 * holidays), so an R2 fetch per request — even a cached one — costs more than
 * redeploy-to-update is worth.
 */
export interface AnnouncementBannerConfig {
  id: string;
  messageByLocale: Record<string, string>;
  allowedLocales?: string[];
  targetHostnames?: string[];
  href?: string;
  ctaLabel?: string;
  severity?: AnnouncementSeverity;
  active?: boolean;
}

const BANNER: AnnouncementBannerConfig = {
  id: "biggyindex-v2-launch-2026-04",
  active: false,
  severity: "info",
  targetHostnames: ["biggyindex.com", "www.biggyindex.com"],
  messageByLocale: {
    "en-GB":
      "Welcome to BiggyIndex v2. {{mbr}}The old site can still be found at",
  },
  href: "https://old.biggyindex.com",
  ctaLabel: "old.biggyindex.com",
};

/** Return the current banner config, or null when inactive. */
export function getAnnouncementBanner(): AnnouncementBannerConfig | null {
  if (!BANNER.active) return null;
  if (!BANNER.id || !BANNER.messageByLocale) return null;
  return BANNER;
}

/** Pick the best-matching message for the given locale. */
export function pickAnnouncementMessage(
  cfg: AnnouncementBannerConfig,
  locale: string | null | undefined,
): string {
  const { messageByLocale, allowedLocales } = cfg;
  if (!messageByLocale) return "";
  const normalized = (locale || "en-GB").toString();
  const base = normalized.split("-")[0];
  if (Array.isArray(allowedLocales) && allowedLocales.length) {
    const isAllowed =
      allowedLocales.includes(normalized) || allowedLocales.includes(base);
    if (!isAllowed) return "";
  }
  if (messageByLocale[normalized]) return messageByLocale[normalized];
  if (base && messageByLocale[base]) return messageByLocale[base];
  if (Array.isArray(allowedLocales) && allowedLocales.length) return "";
  return messageByLocale["en-GB"] || Object.values(messageByLocale)[0] || "";
}
