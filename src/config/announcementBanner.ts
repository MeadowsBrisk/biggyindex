export type AnnouncementBannerConfig = {
  id: string;
  /** 
   * Messages by locale. Use {{mbr}} to insert a mobile-only line break.
   * Example: "First part.{{mbr}}Second part." 
   */
  messageByLocale: Record<string, string>;
  allowedLocales?: string[];
  href?: string;
  ctaLabel?: string;
  severity?: 'info' | 'warning' | 'success';
};

export const announcementBanner: AnnouncementBannerConfig = {
  id: '2026-v2-switchover',
  messageByLocale: {
    'en-GB': 'Index v2 is coming soon. You may notice temporary issues until then.',
  },
  // allowedLocales: ['en-GB', 'en'],
  severity: 'info',
};
