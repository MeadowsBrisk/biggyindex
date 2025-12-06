export type AnnouncementBannerConfig = {
  id: string;
  messageByLocale: Record<string, string>;
  allowedLocales?: string[];
  href?: string;
  ctaLabel?: string;
  severity?: 'info' | 'warning' | 'success';
};

export const announcementBanner: AnnouncementBannerConfig = {
  id: '2025-xmas-last-post',
  messageByLocale: {
    'en-GB': 'Christmas last post: 2nd Class: Weds 17 Dec | 1st Class: Sat 20 Dec | Special Delivery: Tues 23 Dec',
  },
  allowedLocales: ['en-GB', 'en'],
  severity: 'info',
};
