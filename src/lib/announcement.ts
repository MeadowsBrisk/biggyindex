export type AnnouncementSeverity = "info" | "warning" | "success";

/**
 * Announcement banner config — hardcoded in the repo.
 *
 * To show a banner: flip `active: true`, edit messages, redeploy.
 * Use `{{mbr}}` for a mobile-only line break inside messages.
 *
 * Why hardcoded: banner is used rarely (a few times a year — launches, holidays).
 * An R2 fetch on every request — even cached — costs more than it's worth
 * when the config changes maybe 3 times a year. Redeploy-to-update is fine.
 */
export interface AnnouncementBannerConfig {
  id: string;
  messageByLocale: Record<string, string>;
  allowedLocales?: string[];
  href?: string;
  ctaLabel?: string;
  severity?: AnnouncementSeverity;
  active?: boolean;
}

const BANNER: AnnouncementBannerConfig = {
  id: "placeholder",
  active: false,
  severity: "info",
  messageByLocale: {
    "en-GB": "",
  },
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
