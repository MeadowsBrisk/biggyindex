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
  id: '2025-xmas',
  messageByLocale: {
    'en-GB': 'Have a merry Christmas and a happy New Year from the Biggy Index',
  },
  // allowedLocales: ['en-GB', 'en'],
  severity: 'info',
};
