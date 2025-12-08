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
  id: '2025-xmas-last-post',
  messageByLocale: {
    'en-GB': 'Royal Mail Christmas last post: Sat 20 Dec | SNDD: Tues 23 Dec. {{mbr}}Check seller schedules and expect delays.',
  },
  allowedLocales: ['en-GB', 'en'],
  severity: 'info',
};
