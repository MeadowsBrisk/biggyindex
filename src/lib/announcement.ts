import { readR2JSON } from "@/lib/r2";

export type AnnouncementSeverity = "info" | "warning" | "success";

/**
 * Announcement banner config loaded from R2.
 * Stored at `shared/announcement-banner.json` — edit via `yarn r2 put`.
 *
 * Example:
 * {
 *   "id": "2026-launch",
 *   "messageByLocale": {
 *     "en-GB": "BiggyIndex v2 is live! {{mbr}}Faster, cleaner, same data.",
 *     "de-DE": "BiggyIndex v2 ist da!"
 *   },
 *   "allowedLocales": ["en-GB", "de-DE"],
 *   "href": "/browse",
 *   "ctaLabel": "Explore",
 *   "severity": "info",
 *   "active": true
 * }
 *
 * Set `active: false` to disable without removing the file.
 * Use `{{mbr}}` for a mobile-only line break inside messages.
 */
export interface AnnouncementBannerConfig {
  id: string;
  messageByLocale: Record<string, string>;
  allowedLocales?: string[];
  href?: string;
  ctaLabel?: string;
  severity?: AnnouncementSeverity;
  /** When false, banner is hidden. Defaults to true when omitted. */
  active?: boolean;
}

/** Fetch the current banner config from R2. Returns null when missing/inactive. */
export async function loadAnnouncementBanner(): Promise<AnnouncementBannerConfig | null> {
  const cfg = await readR2JSON<AnnouncementBannerConfig>(
    "shared/announcement-banner.json",
  );
  if (!cfg || !cfg.id || !cfg.messageByLocale) return null;
  if (cfg.active === false) return null;
  return cfg;
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
