import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import {
  loadAnnouncementBanner,
  pickAnnouncementMessage,
} from "@/lib/announcement";

/**
 * Server Component wrapper — loads R2 config, picks locale-matched message,
 * renders the client banner. Returns null when no banner or no message matches.
 */
export async function AnnouncementBannerGate({ locale }: { locale: string }) {
  const cfg = await loadAnnouncementBanner();
  if (!cfg) return null;
  const message = pickAnnouncementMessage(cfg, locale);
  if (!message) return null;
  return (
    <AnnouncementBanner
      id={cfg.id}
      message={message}
      severity={cfg.severity}
      href={cfg.href}
      ctaLabel={cfg.ctaLabel}
    />
  );
}
