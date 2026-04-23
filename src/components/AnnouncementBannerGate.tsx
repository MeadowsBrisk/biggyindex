import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import {
  getAnnouncementBanner,
  pickAnnouncementMessage,
} from "@/lib/announcement";

/**
 * Server Component wrapper — reads hardcoded banner config, picks locale-matched
 * message, renders the client banner. Returns null when inactive or no match.
 */
export function AnnouncementBannerGate({ locale }: { locale: string }) {
  const cfg = getAnnouncementBanner();
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
